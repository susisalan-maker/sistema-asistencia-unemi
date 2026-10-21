import { render, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthContext'
import { revisarCuenta } from '../lib/sesion'

const mocks = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock('../lib/sesion', async (original) => ({ ...(await original<typeof import('../lib/sesion')>()), revisarCuenta: vi.fn() }))
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  },
}))

const volverALaPestana = (estado: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => estado })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => vi.mocked(revisarCuenta).mockReset())

describe('AuthProvider · volver a la pestaña', () => {
  it('con sesión, al volver a verse la pestaña comprueba la cuenta; al ocultarse no', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(<AuthProvider>{null}</AuthProvider>)
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled())
    await waitFor(() => { volverALaPestana('visible'); expect(revisarCuenta).toHaveBeenCalled() })
    vi.mocked(revisarCuenta).mockClear()
    volverALaPestana('hidden')
    expect(revisarCuenta).not.toHaveBeenCalled()
  })

  it('sin sesión no revisa nada', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    render(<AuthProvider>{null}</AuthProvider>)
    await waitFor(() => expect(mocks.getSession).toHaveBeenCalled())
    volverALaPestana('visible')
    expect(revisarCuenta).not.toHaveBeenCalled()
  })
})
