import { act, render, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { AuthProvider } from './AuthContext'
import { revisarCuenta } from '../lib/sesion'

const mockSesion = jest.fn()
jest.mock('../lib/sesion', () => ({ ...jest.requireActual('../lib/sesion'), revisarCuenta: jest.fn() }))
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => mockSesion(), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: jest.fn() } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}))

let alCambiar: (estado: string) => void = () => {}
beforeEach(() => {
  jest.mocked(revisarCuenta).mockReset()
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
