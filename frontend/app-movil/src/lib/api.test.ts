import { ApiError, api } from './api'

const mockSesion = jest.fn()
jest.mock('./supabase', () => ({ supabase: { auth: { getSession: () => mockSesion() } } }))

const respuesta = (status: number, cuerpo?: unknown) =>
  ({ ok: status < 400, status, json: async () => { if (cuerpo === undefined) throw new Error('sin cuerpo'); return cuerpo } }) as Response

beforeEach(() => {
  mockSesion.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  globalThis.fetch = jest.fn()
})

describe('api (app móvil)', () => {
  it('envía el token y el cuerpo en JSON', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(200, { ok: true }))
    await expect(api('/x', { method: 'POST', body: { a: 1 }, headers: { 'X-Dispositivo-Id': 'cel' } })).resolves.toEqual({ ok: true })
    const [url, init] = jest.mocked(globalThis.fetch).mock.calls[0]!
    expect(String(url)).toMatch(/\/x$/)
    expect(init!.method).toBe('POST')
    expect(init!.body).toBe('{"a":1}')
    expect(init!.headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Dispositivo-Id': 'cel' })
  })

  it('sin sesión no manda Authorization', async () => {
    mockSesion.mockResolvedValue({ data: { session: null } })
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(200, {}))
    await api('/x')
    expect(jest.mocked(globalThis.fetch).mock.calls[0]![1]!.headers).not.toHaveProperty('Authorization')
  })

  it('un error del servidor trae su mensaje', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(409, { detail: 'Ahora te corresponde marcar «salida»' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 409, message: 'Ahora te corresponde marcar «salida»' })
  })

  it('un error de validación no muestra el detalle técnico', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(422, { detail: [{ loc: ['body'], msg: 'x' }] }))
    await expect(api('/x')).rejects.toMatchObject({ status: 422, message: 'Revisa los datos enviados' })
  })

  it('sin cuerpo JSON usa un mensaje genérico', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(500))
    await expect(api('/x')).rejects.toMatchObject({ status: 500, message: 'Error 500' })
  })

  it('sin red lanza un ApiError con status 0 y un mensaje claro', async () => {
    jest.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Network request failed'))
    const e = (await api('/x').catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(0)
    expect(e.message).toMatch(/No hay conexión/)
  })

  it('una respuesta 200 que no es JSON se convierte en un ApiError con una pista', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(200))
    const e = (await api('/x').catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.message).toMatch(/EXPO_PUBLIC_API_URL/)
  })

  it('ApiError conserva su tipo, su nombre y su status', () => {
    const e = new ApiError(409, 'x')
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe('ApiError')
    expect(e.status).toBe(409)
  })

  it('si el servidor no responde a tiempo, corta la espera y dice qué revisar', async () => {
    jest.useFakeTimers()
    jest.mocked(globalThis.fetch).mockImplementation(
      (_url, init) => new Promise((_, rechazar) => { init!.signal!.addEventListener('abort', () => rechazar(new Error('abortado'))) }),
    )
    const promesa = api('/x').catch((x: unknown) => x as ApiError)
    await jest.advanceTimersByTimeAsync(15_001)
    const e = (await promesa) as ApiError
    jest.useRealTimers()
    expect(e.status).toBe(0)
    expect(e.message).toMatch(/no respondió/)
    expect(e.message).toMatch(/misma red/)
  })

  it('una respuesta a tiempo no deja ningún temporizador pendiente', async () => {
    jest.useFakeTimers()
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(200, { ok: 1 }))
    await api('/x')
    expect(jest.getTimerCount()).toBe(0)
    jest.useRealTimers()
  })
})
