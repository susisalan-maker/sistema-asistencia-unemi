import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AuthContext, type AuthState } from '../auth/AuthContext'
import Login from '../app/login'
import { avisoDeSalida } from '../lib/sesion'

jest.mock('../lib/sesion', () => ({ ...jest.requireActual('../lib/sesion'), avisoDeSalida: jest.fn(() => null) }))
const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1234' }))
const mockVincular = jest.fn().mockResolvedValue(null)
jest.mock('../lib/useEstadoHoy', () => ({ vincularEsteDispositivo: () => mockVincular() }))

const base: AuthState = {
  cargando: false, session: null, perfil: null, iniciarSesion: async () => null, cerrarSesion: async () => {},
}
const dibujar = (e: Partial<AuthState> = {}) =>
  render(<AuthContext.Provider value={{ ...base, ...e }}><Login /></AuthContext.Provider>)

describe('Login (app móvil)', () => {
  beforeEach(() => { mockPush.mockReset(); mockVincular.mockClear() })

  it('si la sesión terminó sola, lo explica', async () => {
    jest.mocked(avisoDeSalida).mockReturnValueOnce('vencida')
    await dibujar()
    expect(screen.getByText('Tu sesión terminó. Vuelve a iniciar sesión.')).toBeTruthy()
  })

  it('si desactivaron la cuenta mientras estaba dentro, lo explica', async () => {
    jest.mocked(avisoDeSalida).mockReturnValueOnce('desactivada')
    await dibujar()
    expect(screen.getByText(/Tu cuenta fue desactivada/)).toBeTruthy()
  })

  it('al entrar normalmente no sale ningún aviso de sesión', async () => {
    await dibujar()
    expect(screen.queryByText(/Tu sesión terminó/)).toBeNull()
  })

  it('pide correo y contraseña antes de enviar', async () => {
    const iniciarSesion = jest.fn()
    await dibujar({ iniciarSesion })
    await fireEvent.press(screen.getByLabelText('Ingresar y vincular'))
    expect(screen.getByText('Escribe tu correo y tu contraseña')).toBeTruthy()
    expect(iniciarSesion).not.toHaveBeenCalled()
    expect(mockVincular).not.toHaveBeenCalled()
  })

  it('al ingresar bien vincula este celular', async () => {
    const iniciarSesion = jest.fn().mockResolvedValue(null)
    await dibujar({ iniciarSesion })
    await fireEvent.changeText(screen.getByLabelText('Correo institucional'), 'a@x.com')
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'buena')
    await fireEvent.press(screen.getByLabelText('Ingresar y vincular'))
    await waitFor(() => expect(mockVincular).toHaveBeenCalledTimes(1))
  })

  it('muestra qué dispositivo se vinculará', async () => {
    await dibujar()
    expect(screen.getByText('Este dispositivo')).toBeTruthy()
    expect(await screen.findByText(/ID …1234/)).toBeTruthy()
    expect(screen.getByText(/dispositivo único de marcación/)).toBeTruthy()
  })

  it('«Ver» muestra y oculta la contraseña', async () => {
    await dibujar()
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(true)
    await fireEvent.press(screen.getByLabelText('Ver contraseña'))
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(false)
    await fireEvent.press(screen.getByLabelText('Ocultar contraseña'))
    expect(screen.getByLabelText('Contraseña').props.secureTextEntry).toBe(true)
  })

  it('muestra el error genérico si las credenciales fallan', async () => {
    const iniciarSesion = jest.fn().mockResolvedValue('Correo o contraseña incorrectos')
    await dibujar({ iniciarSesion })
    await fireEvent.changeText(screen.getByLabelText('Correo institucional'), 'a@x.com')
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'mala')
    await fireEvent.press(screen.getByLabelText('Ingresar y vincular'))
    await waitFor(() => expect(screen.getByText('Correo o contraseña incorrectos')).toBeTruthy())
    expect(iniciarSesion).toHaveBeenCalledWith('a@x.com', 'mala')
    expect(mockVincular).not.toHaveBeenCalled()
  })

  it('el enlace de olvidé mi contraseña va a la pantalla de recuperación', async () => {
    await dibujar()
    await fireEvent.press(screen.getByText('¿Olvidaste tu contraseña?'))
    expect(mockPush).toHaveBeenCalledWith('/recuperar-contrasena')
  })

  it('avisa si la cuenta está desactivada y permite salir', async () => {
    const cerrarSesion = jest.fn()
    await dibujar({
      session: { user: { id: 'u1' } } as unknown as Session,
      perfil: { id: 'u1', nombres: 'A', apellidos: 'B', email: 'a@x.com', rol: 'usuario', activo: false },
      cerrarSesion,
    })
    expect(screen.getByText(/cuenta está desactivada/)).toBeTruthy()
    await fireEvent.press(screen.getByText('Salir'))
    expect(cerrarSesion).toHaveBeenCalled()
  })

  it('avisa si hay sesión pero no existe el perfil', async () => {
    await dibujar({ session: { user: { id: 'u1' } } as unknown as Session })
    expect(screen.getByText(/no tiene un perfil asignado/)).toBeTruthy()
  })
})
