import { ApiError, api } from './api'
import { avisoDeSalida, olvidarAvisoDeSalida } from './sesion'

const auth = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), signOut: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { auth } }))

const respuesta = (status: number, cuerpo?: unknown) =>
  ({ ok: status < 400, status, json: async () => { if (cuerpo === undefined) throw new Error('sin cuerpo'); return cuerpo } }) as Response
const MUERTA = { name: 'AuthApiError', status: 400 }
const SIN_RED = { name: 'AuthRetryableFetchError', status: 0 }
const fetchMock = () => vi.mocked(globalThis.fetch)

beforeEach(() => {
  olvidarAvisoDeSalida()
  auth.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'viejo' } } })
  auth.refreshSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'nuevo' } }, error: null })
  auth.signOut.mockReset().mockResolvedValue({ error: null })
  globalThis.fetch = vi.fn()
})

describe('api · sesión vencida', () => {
  it('envía el token de la sesión', async () => {
    fetchMock().mockResolvedValue(respuesta(200, { ok: true }))
    await expect(api('/x')).resolves.toEqual({ ok: true })
    expect(fetchMock().mock.calls[0]![1]!.headers).toMatchObject({ Authorization: 'Bearer viejo' })
    expect(auth.refreshSession).not.toHaveBeenCalled()
  })

  it('ante un 401 renueva el token y repite la petición una vez', async () => {
    fetchMock().mockResolvedValueOnce(respuesta(401, { detail: 'x', codigo: 'sesion_vencida' })).mockResolvedValueOnce(respuesta(200, { ok: 1 }))
    await expect(api('/x', { method: 'POST', body: { a: 1 } })).resolves.toEqual({ ok: 1 })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(fetchMock().mock.calls[1]![1]!.headers).toMatchObject({ Authorization: 'Bearer nuevo' })
    expect(fetchMock().mock.calls[1]![1]!.body).toBe('{"a":1}')
    expect(auth.signOut).not.toHaveBeenCalled()
  })

  it('si la sesión ya no se puede renovar, la cierra y deja el aviso para el login', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: MUERTA })
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'Tu sesión terminó. Vuelve a iniciar sesión', codigo: 'sesion_vencida' }))
    const e = (await api('/x').catch((x: unknown) => x)) as ApiError
    expect(e).toBeInstanceOf(ApiError)
    expect(e.status).toBe(401)
    expect(e.codigo).toBe('sesion_vencida')
    expect(fetchMock()).toHaveBeenCalledTimes(1)
    expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' })   // solo este navegador; no revoca otros dispositivos
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si renueva pero el servidor sigue rechazando el token, también cierra la sesión', async () => {
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'x', codigo: 'sesion_vencida' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock()).toHaveBeenCalledTimes(2)
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si solo falló internet al renovar, NO cierra la sesión', async () => {
    auth.refreshSession.mockResolvedValue({ data: { session: null }, error: SIN_RED })
    fetchMock().mockResolvedValue(respuesta(401, { detail: 'x' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 401 })
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('una cuenta desactivada cierra la sesión con su propio aviso', async () => {
    fetchMock().mockResolvedValue(respuesta(403, { detail: 'Tu cuenta está desactivada.', codigo: 'cuenta_inhabilitada' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 403, codigo: 'cuenta_inhabilitada' })
    expect(auth.signOut).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('desactivada')
    expect(auth.refreshSession).not.toHaveBeenCalled()   // un 403 no se arregla renovando el token
  })

  it('un 403 normal (rol o permiso) no toca la sesión', async () => {
    fetchMock().mockResolvedValue(respuesta(403, { detail: 'Solo un administrador activo puede hacer esto' }))
    await expect(api('/x')).rejects.toMatchObject({ status: 403 })
    expect(auth.signOut).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('varias peticiones que fallan a la vez comparten una sola renovación', async () => {
    fetchMock().mockImplementation(async (_u, init) =>
      (init!.headers as Record<string, string>).Authorization === 'Bearer nuevo' ? respuesta(200, {}) : respuesta(401, { detail: 'x' }))
    await Promise.all([api('/a'), api('/b'), api('/c')])
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  })
})
