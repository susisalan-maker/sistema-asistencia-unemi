import { avisoDeSalida, cerrarPor, olvidarAvisoDeSalida, revisarCuenta } from './sesion'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(), getUser: vi.fn(), signOut: vi.fn(), refreshSession: vi.fn(), activo: vi.fn(),
}))
vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, getUser: mocks.getUser, signOut: mocks.signOut, refreshSession: mocks.refreshSession },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mocks.activo() }) }) }),
  },
}))

beforeEach(() => {
  olvidarAvisoDeSalida()
  mocks.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 't' } } })
  mocks.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
  mocks.signOut.mockReset().mockResolvedValue({ error: null })
  mocks.activo.mockReset().mockResolvedValue({ data: { activo: true } })
})

describe('revisarCuenta (al volver a la pestaña)', () => {
  it('con la cuenta activa no hace nada', async () => {
    await revisarCuenta()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('si desactivaron la cuenta, cierra la sesión y avisa', async () => {
    mocks.activo.mockResolvedValue({ data: { activo: false } })
    await revisarCuenta()
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(avisoDeSalida()).toBe('desactivada')
  })

  it('si Supabase ya no reconoce la sesión, cierra y avisa que terminó', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthSessionMissingError', status: 400 } })
    await revisarCuenta()
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
    expect(avisoDeSalida()).toBe('vencida')
  })

  it('si no hay internet, no la cierra', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: 'AuthRetryableFetchError', status: 0 } })
    await revisarCuenta()
    expect(mocks.signOut).not.toHaveBeenCalled()
    expect(avisoDeSalida()).toBeNull()
  })

  it('sin sesión no consulta nada', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    await revisarCuenta()
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('si no pudo leer el perfil (sin datos), no cierra por las dudas', async () => {
    mocks.activo.mockResolvedValue({ data: null, error: { message: 'x' } })
    await revisarCuenta()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
})

describe('cerrarPor', () => {
  it('cerrar dos veces seguidas hace un solo cierre', async () => {
    await Promise.all([cerrarPor('vencida'), cerrarPor('vencida')])
    expect(mocks.signOut).toHaveBeenCalledTimes(1)
  })

  it('aunque Supabase falle al cerrar, no rompe y deja el aviso', async () => {
    mocks.signOut.mockRejectedValue(new Error('red'))
    await expect(cerrarPor('desactivada')).resolves.toBeUndefined()
    expect(avisoDeSalida()).toBe('desactivada')
  })
})
