import { avisoDeSalida, cerrarPor, olvidarAvisoDeSalida, revisarCuenta } from './sesion'

const mockSesion = jest.fn()
const mockUsuario = jest.fn()
const mockSalir = jest.fn()
const mockActivo = jest.fn()
jest.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: () => mockSesion(), getUser: () => mockUsuario(), signOut: (o: unknown) => mockSalir(o), refreshSession: jest.fn() },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockActivo() }) }) }),
  },
}))

beforeEach(() => {
  olvidarAvisoDeSalida()
  mockSesion.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } })
  mockUsuario.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mockSalir.mockReset().mockResolvedValue({ error: null })
  mockActivo.mockReset().mockResolvedValue({ data: { activo: true } })
})

describe('revisarCuenta (al volver a la pestaña)', () => {
  it('con la cuenta activa no hace nada', async () => {
    await revisarCuenta()
    expect(mockSalir).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('si desactivaron la cuenta, cierra la sesión y avisa', async () => {
    mockActivo.mockResolvedValue({ data: { activo: false } })
    await revisarCuenta()
    expect(mockSalir).toHaveBeenCalledWith({ scope: 'local' })
    expect(avisoDeSalida()).toBe('desactivada')
  })

  it('si Supabase ya no reconoce la sesión, cierra y avisa que terminó', async () => {
    mockUsuario.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } })
    await revisarCuenta()
    expect(mockSalir).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si no hay internet, no la cierra', async () => {
    mockUsuario.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } })
    await revisarCuenta()
    expect(mockSalir).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('sin sesión no consulta nada', async () => {
    mockSesion.mockResolvedValue({ data: { session: null } })
    await revisarCuenta()
    expect(mockUsuario).not.toHaveBeenCalled()
  })

  it('si no pudo leer el perfil (sin datos), no cierra por las dudas', async () => {
    mockActivo.mockResolvedValue({ data: null, error: { message: 'x' } })
    await revisarCuenta()
    expect(mockSalir).not.toHaveBeenCalled()
  })
})

describe('cerrarPor', () => {
  it('cerrar dos veces seguidas hace un solo cierre', async () => {
    await Promise.all([cerrarPor('vencida'), cerrarPor('vencida')])
    expect(mockSalir).toHaveBeenCalledTimes(1)
  })

  it('aunque Supabase falle al cerrar, no rompe y deja el aviso', async () => {
    mockSalir.mockRejectedValue(new Error('red'))
    await expect(cerrarPor('desactivada')).resolves.toBeUndefined()
    expect(avisoDeSalida()).toBe('desactivada')
  })
})
