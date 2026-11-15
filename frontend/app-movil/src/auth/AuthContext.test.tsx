import { act, render, waitFor } from '@testing-library/react-native'
import { AppState } from 'react-native'
import { AuthProvider, useAuth } from './AuthContext'
import { Text } from 'react-native'
import { revisarCuenta } from '../lib/sesion'

const mockSesion = jest.fn()
const mockPerfil = jest.fn()
const mockOyente = jest.fn()
jest.mock('../lib/sesion', () => ({ ...jest.requireActual('../lib/sesion'), revisarCuenta: jest.fn() }))
jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockSesion(),
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => { mockOyente(cb); return { data: { subscription: { unsubscribe: jest.fn() } } } },
    },
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

describe('AuthProvider · abrir sin internet', () => {
  const fila = { id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol: 'usuario', activo: true }
  const guardada = { user: { id: 'u1' }, refresh_token: 'r', access_token: 'vencido', expires_at: 1 }
  const almacen: Record<string, string> = {}
  function Estado() {
    const { cargando, session, perfil } = useAuth()
    return <Text>{cargando ? 'cargando' : `${session ? 'con sesión' : 'sin sesión'} · ${perfil?.nombres ?? 'sin perfil'}`}</Text>
  }
  const sinInternet = { data: { session: null }, error: { name: 'AuthRetryableFetchError' } }

  beforeEach(() => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://proyecto1.supabase.co'
    for (const k of Object.keys(almacen)) delete almacen[k]
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => almacen[k] ?? null, setItem: (k: string, v: string) => { almacen[k] = v }, removeItem: (k: string) => { delete almacen[k] },
    }
    mockOyente.mockReset()
  })
  afterEach(() => { delete (globalThis as { localStorage?: unknown }).localStorage; delete process.env.EXPO_PUBLIC_SUPABASE_URL })

  it('con internet guarda una copia del perfil', async () => {
    mockSesion.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockPerfil.mockResolvedValue({ data: fila })
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await waitFor(() => getByText('con sesión · Ana'))
    expect(JSON.parse(almacen['perfil-guardado']!)).toEqual(fila)
  })

  it('sin internet y con el acceso vencido, entra con la sesión y el perfil guardados', async () => {
    almacen['sb-proyecto1-auth-token'] = JSON.stringify(guardada)
    almacen['perfil-guardado'] = JSON.stringify(fila)
    mockSesion.mockResolvedValue(sinInternet)
    mockPerfil.mockResolvedValue({ data: null, error: { message: 'Network request failed' } })
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await waitFor(() => getByText('con sesión · Ana'))
  })

  it('el aviso inicial de «sin sesión» no descarta la sesión guardada', async () => {
    almacen['sb-proyecto1-auth-token'] = JSON.stringify(guardada)
    almacen['perfil-guardado'] = JSON.stringify(fila)
    mockSesion.mockResolvedValue({ data: { session: null }, error: null })
    mockPerfil.mockResolvedValue({ data: null, error: { message: 'Network request failed' } })
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await act(async () => mockOyente.mock.calls[0]![0]('INITIAL_SESSION', null))
    await waitFor(() => getByText('con sesión · Ana'))
  })

  it('sin sesión guardada va al login, aunque no haya internet', async () => {
    mockSesion.mockResolvedValue(sinInternet)
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await waitFor(() => getByText('sin sesión · sin perfil'))
  })

  it('si la copia guardada es de otra cuenta, no se usa', async () => {
    almacen['sb-proyecto1-auth-token'] = JSON.stringify(guardada)
    almacen['perfil-guardado'] = JSON.stringify({ ...fila, id: 'otra', nombres: 'Otra' })
    mockSesion.mockResolvedValue(sinInternet)
    mockPerfil.mockResolvedValue({ data: null, error: { message: 'Network request failed' } })
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await waitFor(() => getByText('con sesión · sin perfil'))
  })

  it('si la consulta responde que no hay cuenta, borra la copia guardada', async () => {
    almacen['perfil-guardado'] = JSON.stringify(fila)
    mockSesion.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    mockPerfil.mockResolvedValue({ data: null })
    const { getByText } = await render(<AuthProvider><Estado /></AuthProvider>)
    await waitFor(() => getByText('con sesión · sin perfil'))
    expect(almacen['perfil-guardado']).toBeUndefined()
  })
})
