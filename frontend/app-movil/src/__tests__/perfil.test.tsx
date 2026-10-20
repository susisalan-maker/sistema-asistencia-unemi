import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen } from '@testing-library/react-native'
import Perfil from '../app/(app)/perfil'
import { AuthContext, type AuthState, type Perfil as PerfilDatos } from '../auth/AuthContext'

jest.mock('../lib/supabase', () => ({ supabase: {} }))

const perfil = (rol: PerfilDatos['rol']): PerfilDatos => ({ id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol, activo: true })
const cerrar = jest.fn()
const dibujar = (rol: PerfilDatos['rol'] = 'usuario') =>
  render(<AuthContext.Provider value={{
    cargando: false, session: { user: { id: 'u1' } } as unknown as Session, perfil: perfil(rol), iniciarSesion: async () => null, cerrarSesion: cerrar,
  } as AuthState}><Perfil /></AuthContext.Provider>)

describe('Perfil', () => {
  it('muestra nombre, correo y rol, y cierra la sesión', async () => {
    await dibujar()
    expect(screen.getByText('Ana Pérez')).toBeTruthy()
    expect(screen.getByText('a@x.com')).toBeTruthy()
    expect(screen.getByText('USUARIO')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Cerrar sesión'))
    expect(cerrar).toHaveBeenCalled()
  })

  it('al administrador le avisa que el panel está en la web', async () => {
    await dibujar('administrador')
    expect(screen.getByText(/panel de gestión está en la versión web/)).toBeTruthy()
  })
})
