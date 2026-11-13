import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Alert } from 'react-native'
import Perfil from '../app/(app)/perfil'
import { AuthContext, type AuthState, type Perfil as PerfilDatos } from '../auth/AuthContext'

jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }))
const mockRecargar = jest.fn()
let mockEstado: unknown = null
jest.mock('../lib/useEstadoHoy', () => ({ useEstadoHoy: () => ({ estado: mockEstado, recargar: mockRecargar }) }))
const estadoCompleto = { jornada: { inicio: '08:00', fin: '17:00' }, dias_laborables: [1, 2, 3, 4, 5], dispositivo: 'este', rostro_registrado: true }

const perfil = (rol: PerfilDatos['rol']): PerfilDatos => ({ id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol, activo: true })
const cerrar = jest.fn()
const dibujar = (rol: PerfilDatos['rol'] = 'usuario') =>
  render(<AuthContext.Provider value={{
    cargando: false, session: { user: { id: 'u1' } } as unknown as Session, perfil: perfil(rol), iniciarSesion: async () => null, cerrarSesion: cerrar, recargarPerfil: async () => {},
  } as AuthState}><Perfil /></AuthContext.Provider>)

beforeEach(() => { cerrar.mockReset(); mockRecargar.mockReset(); mockEstado = estadoCompleto; jest.spyOn(Alert, 'alert').mockImplementation(() => {}) })

/** Pulsa el botón de confirmación del Alert de cierre de sesión. */
const confirmar = () => {
  const botones = jest.mocked(Alert.alert).mock.calls[0]![2]!
  botones.find((b) => b.style === 'destructive')!.onPress!()
}

describe('Perfil', () => {
  it('muestra nombre, correo y rol', async () => {
    await dibujar()
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('a@x.com')).toBeTruthy()
    expect(screen.getByText('USUARIO')).toBeTruthy()
  })

  it('muestra horario, días, celular y rostro', async () => {
    await dibujar()
    expect(screen.getByText('08:00 – 17:00')).toBeTruthy()
    expect(screen.getByText('Lunes a viernes')).toBeTruthy()
    expect(screen.getByText('✓ VINCULADO')).toBeTruthy()
    expect(screen.getByText('✓ REGISTRADO')).toBeTruthy()
    expect(mockRecargar).toHaveBeenCalled()
  })

  it('si falta el rostro o el celular es otro, lo dice', async () => {
    mockEstado = { ...estadoCompleto, dispositivo: 'otro', rostro_registrado: false }
    await dibujar()
    expect(screen.getByText('ES OTRO CELULAR')).toBeTruthy()
    expect(screen.getByText('FALTA REGISTRARLO')).toBeTruthy()
  })

  it('cerrar sesión pide confirmación antes de salir', async () => {
    await dibujar()
    await fireEvent.press(screen.getByLabelText('Cerrar sesión'))
    expect(cerrar).not.toHaveBeenCalled()
    expect(Alert.alert).toHaveBeenCalledWith('¿Cerrar sesión?', expect.stringContaining('volver a ingresar'), expect.any(Array))
    confirmar()
    expect(cerrar).toHaveBeenCalled()
  })

  it('al administrador le avisa que el panel está en la web', async () => {
    await dibujar('administrador')
    expect(screen.getByText(/panel de gestión está en la versión web/)).toBeTruthy()
    expect(screen.queryByText('Mi jornada')).toBeNull()
    expect(mockRecargar).not.toHaveBeenCalled()
  })
})
