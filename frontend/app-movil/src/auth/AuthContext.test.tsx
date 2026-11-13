import { act, render, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { AuthProvider, useAuth } from './AuthContext'
import { Text } from 'react-native'
import { revisarCuenta } from '../lib/sesion'

const mockSesion = jest.fn()
const mockPerfil = jest.fn()
jest.mock('../lib/sesion', () => ({ ...jest.requireActual('../lib/sesion'), revisarCuenta: jest.fn() }))
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockSesion(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => mockPerfil() }) }) }),
  },
}))

let alCambiar: (estado: string) => void = () => {}
beforeEach(() => {
  jest.mocked(revisarCuenta).mockReset()
  mockPerfil.mockReset().mockResolvedValue({ data: null })
  alCambiar = () => {}
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (e: string) => void) => {
    alCambiar = cb
    return { remove: jest.fn() }
  }) as never)
})

afterEach(() => jest.restoreAllMocks())

describe('AuthProvider · volver a la app', () => {
  it('con sesión, al volver a primer plano comprueba la cuenta; al irse a segundo plano no', async () => {
    mockSesion.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    await render(<AuthProvider>{null}</AuthProvider>)
    await waitFor(() => expect(AppState.addEventListener).toHaveBeenCalled())
    await act(async () => alCambiar('background'))
    expect(revisarCuenta).not.toHaveBeenCalled()
    await act(async () => alCambiar('active'))
    expect(revisarCuenta).toHaveBeenCalledTimes(1)
  })

  it('sin sesión no revisa nada al volver', async () => {
    mockSesion.mockResolvedValue({ data: { session: null } })
    await render(<AuthProvider>{null}</AuthProvider>)
    await waitFor(() => expect(mockSesion).toHaveBeenCalled())
    await act(async () => alCambiar('active'))
    expect(revisarCuenta).not.toHaveBeenCalled()
  })
})

describe('AuthProvider · el perfil se mantiene al día', () => {
  const fila = (nombres: string) => ({ id: 'u1', nombres, apellidos: 'Pérez', email: 'a@x.com', rol: 'usuario', activo: true })
  function Nombre() {
    const { perfil } = useAuth()
    return <Text>{perfil?.nombres ?? 'sin perfil'}</Text>
  }

  it('si Talento Humano cambia el nombre, al volver a la app se ve el nuevo', async () => {
    mockSesion.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockPerfil.mockResolvedValue({ data: fila('Ana') })
    const { getByText } = await render(<AuthProvider><Nombre /></AuthProvider>)
    await waitFor(() => getByText('Ana'))
    mockPerfil.mockResolvedValue({ data: fila('Rosario') })
    await act(async () => alCambiar('active'))
    await waitFor(() => getByText('Rosario'))
  })

  it('sin internet conserva el nombre que ya tenía', async () => {
    mockSesion.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockPerfil.mockResolvedValue({ data: fila('Ana') })
    const { getByText } = await render(<AuthProvider><Nombre /></AuthProvider>)
    await waitFor(() => getByText('Ana'))
    mockPerfil.mockResolvedValue({ data: null })
    await act(async () => alCambiar('active'))
    getByText('Ana')
  })
})
