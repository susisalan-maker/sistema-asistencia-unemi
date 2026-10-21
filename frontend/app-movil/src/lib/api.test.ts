import { ApiError, api } from './api'

import { avisoDeSalida, olvidarAvisoDeSalida } from './sesion'

const mockSesion = jest.fn()
const mockRenovar = jest.fn()
const mockSalir = jest.fn()
jest.mock('./supabase', () => ({
  supabase: { auth: { getSession: () => mockSesion(), refreshSession: () => mockRenovar(), signOut: (o: unknown) => mockSalir(o) } },
}))

const respuesta = (status: number, cuerpo?: unknown) =>
  ({ ok: status < 400, status, json: async () => { if (cuerpo === undefined) throw new Error('sin cuerpo'); return cuerpo } }) as Response

beforeEach(() => {
  olvidarAvisoDeSalida()
  mockSesion.mockResolvedValue({ data: { session: { access_token: 'tok' } } })
  mockRenovar.mockReset().mockResolvedValue({ data: { session: { access_token: 'nuevo' } }, error: null })
  mockSalir.mockReset().mockResolvedValue({ error: null })
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

  it('conserva el código y el intento que añade el servidor', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValue(respuesta(422, { detail: 'No pudimos verificar tu rostro', codigo: 'rostro_no_verificado', intento: 2 }))
    await expect(api('/x')).rejects.toMatchObject({ status: 422, codigo: 'rostro_no_verificado', intento: 2 })
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

describe('api (app móvil) · sesión vencida', () => {
  const MUERTA = { name: 'AuthApiError', status: 400 }
  const SIN_RED = { name: 'AuthRetryableFetchError', status: 0 }
  const fetchMock = () => jest.mocked(globalThis.fetch)

  it('ante un 401 renueva el token y repite la petición una vez', async () => {
    fetchMock().mockResolvedValueOnce(respuesta(401, { detail: 'x', codigo: 'sesion_vencida' })).mockResolvedValueOnce(respuesta(200, { ok: 1 }))
    await expect(api('/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: 1 })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(fetchMock().mock.calls[1]![1]!.headers).toMatchObject({ Authorization: 'Bearer nuevo' })
    expect(fetchMock().mock.calls[1]![1]!.body).toBe('{"a":1}')
    expect(mockSalir).not.toHaveBeenCalled()
  })

  it('si la sesión ya no se puede renovar, la cierra y deja el aviso para el login', async () => {
    mockRenovar.mockResolvedValue({ data: { session: null }, error: MUERTA })
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'Tu sesión terminó.', codigo: 'sesion_vencida' }))
    const e = (await api('/x').catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(401)
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    expect(mockSalir).toHaveBeenCalledWith({ scope: 'local' })
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si renueva pero el servidor sigue rechazando el token, también cierra la sesión', async () => {
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'x' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(mockSalir).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si solo falló internet al renovar, NO cierra la sesión', async () => {
    mockRenovar.mockResolvedValue({ data: { session: null }, error: SIN_RED })
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'x' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 401 })
    expect(mockSalir).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('una cuenta desactivada cierra la sesión con su propio aviso', async () => {
    fetchMock().mockResolvedValue(respuesta(403, { detail: 'Tu cuenta está desactivada.', codigo: 'cuenta_inhabilitada' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 403, codigo: 'cuenta_inhabilitada' })
    expect(mockSalir).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('desactivada')
    expect(mockRenovar).not.toHaveBeenCalled()
  })

  it('un 403 normal (otro celular, ubicación simulada…) no toca la sesión', async () => {
    fetchMock().mockResolvedValue(respuesta(403, { detail: 'Este dispositivo no es el vinculado a tu cuenta' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 403 })
    expect(mockSalir).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('varias peticiones que fallan a la vez comparten una sola renovación', async () => {
    fetchMock().mockImplementation((async (_u: unknown, init: RequestInit) =>
      (init.headers as Record<string, string>).Authorization === 'Bearer nuevo' ? respuesta(200, {}) : respuesta(401, { detail: 'x' })) as never)
    await Promise.all([api('/a'), api('/b'), api('/c')])
    expect(mockRenovar).toHaveBeenCalledTimes(1)
  })
})

