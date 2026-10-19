import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AuthContext, type AuthState } from '../auth/AuthContext'
import Login from '../app/login'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))

const base: AuthState = {
  cargando: false, session: null, perfil: null, iniciarSesion: async () => null, cerrarSesion: async () => {},
}
const dibujar = (e: Partial<AuthState> = {}) =>
  render(<AuthContext.Provider value={{ ...base, ...e }}><Login /></AuthContext.Provider>)

describe('Login (app móvil)', () => {
  beforeEach(() => mockPush.mockReset())

  it('pide correo y contraseña antes de enviar', async () => {
    const iniciarSesion = jest.fn()
    await dibujar({ iniciarSesion })
    await fireEvent.press(screen.getByLabelText('Entrar'))
    expect(screen.getByText('Escribe tu correo y tu contraseña')).toBeTruthy()
    expect(iniciarSesion).not.toHaveBeenCalled()
  })

  it('muestra el error genérico si las credenciales fallan', async () => {
    const iniciarSesion = jest.fn().mockResolvedValue('Correo o contraseña incorrectos')
    await dibujar({ iniciarSesion })
    await fireEvent.changeText(screen.getByLabelText('Correo institucional'), 'a@x.com')
    await fireEvent.changeText(screen.getByLabelText('Contraseña'), 'mala')
    await fireEvent.press(screen.getByLabelText('Entrar'))
    await waitFor(() => expect(screen.getByText('Correo o contraseña incorrectos')).toBeTruthy())
    expect(iniciarSesion).toHaveBeenCalledWith('a@x.com', 'mala')
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
