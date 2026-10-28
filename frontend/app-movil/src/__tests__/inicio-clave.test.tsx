import type { Session } from '@supabase/supabase-js'
import NetInfo from '@react-native-community/netinfo'
import { render, screen, waitFor } from '@testing-library/react-native'
import Inicio from '../app/(app)/index'
import { AuthContext, type AuthState } from '../auth/AuthContext'
import { api } from '../lib/api'
import { MENSAJE_CLAVE_DISTINTA, sincronizarClave } from '../lib/firma'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1' }))
jest.mock('../lib/firma', () => ({ ...jest.requireActual('../lib/firma'), sincronizarClave: jest.fn() }))
jest.mock('../components/MapaGeocerca', () => ({ MapaGeocerca: () => null }))
jest.mock('../lib/useZona', () => ({ useZona: () => ({ estado: { fase: 'buscando' }, medir: jest.fn() }) }))

const base: AuthState = {
  cargando: false, session: { user: { id: 'u-1' } } as unknown as Session,
  perfil: { id: 'u-1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol: 'usuario', activo: true },
  iniciarSesion: async () => null, cerrarSesion: async () => {},
}
const dibujar = () =>
  render(<AuthContext.Provider value={base}><SincronizacionProvider usuarioId="u-1"><Inicio /></SincronizacionProvider></AuthContext.Provider>)

const hoy = (extra: object = {}) => ({
  fecha: '2026-10-15', marcaciones: [], siguiente: 'ingreso', dispositivo: 'este', rostro_registrado: true, rostro_requerido: true,
  ultima: null, jornada: { inicio: '08:00', fin: '17:00' }, ...extra,
})

beforeEach(() => {
  ;(obtenerAlmacen() as AlmacenMemoria).filas.clear()
  jest.mocked(api).mockReset()
  jest.mocked(sincronizarClave).mockReset()
  jest.mocked(sincronizarClave).mockResolvedValue({ estado: 'registrada' })
  jest.mocked(NetInfo.addEventListener).mockImplementation((() => jest.fn()) as never)
})

describe('Inicio · clave de seguridad del celular', () => {
  it('al cargar la jornada del celular vinculado, le pasa a la app la clave que el servidor tiene registrada', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ clave_publica: 'CLAVE-DEL-SERVIDOR' }) as never)
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    await waitFor(() => expect(sincronizarClave).toHaveBeenCalledWith({
      usuarioId: 'u-1', dispositivoId: 'android:cel-1', clavePublicaServidor: 'CLAVE-DEL-SERVIDOR',
    }))
  })

  it('sin clave registrada en el servidor, pasa null (la app la crea y la registra)', async () => {
    jest.mocked(api).mockResolvedValue(hoy() as never)
    await dibujar()
    await waitFor(() => expect(sincronizarClave).toHaveBeenCalledWith(expect.objectContaining({ clavePublicaServidor: null })))
  })

  it('si la cuenta tiene registrada la clave de otro celular, se lo dice a la persona', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ clave_publica: 'OTRA' }) as never)
    jest.mocked(sincronizarClave).mockResolvedValue({ estado: 'distinta', mensaje: MENSAJE_CLAVE_DISTINTA })
    await dibujar()
    expect(await screen.findByText(/no es la que tu cuenta tiene registrada/)).toBeTruthy()
    expect(screen.getByText(/Pide a Talento Humano que reinicie tu celular/)).toBeTruthy()
  })

  it('si todo está en orden no muestra nada', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ clave_publica: 'X' }) as never)
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    await waitFor(() => expect(sincronizarClave).toHaveBeenCalled())
    expect(screen.queryByText(/clave de seguridad/)).toBeNull()
  })

  it('en un celular que no es el vinculado ni lo intenta', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ dispositivo: 'otro' }) as never)
    await dibujar()
    await screen.findByText(/vinculada a otro celular/)
    expect(sincronizarClave).not.toHaveBeenCalled()
  })

  it('si el registro falla por un error inesperado, la jornada se ve igual', async () => {
    jest.mocked(api).mockResolvedValue(hoy() as never)
    jest.mocked(sincronizarClave).mockRejectedValue(new Error('boom'))
    await dibujar()
    expect(await screen.findByText('Tu jornada de hoy')).toBeTruthy()
  })
})
