import type { Session } from '@supabase/supabase-js'
import NetInfo from '@react-native-community/netinfo'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Inicio from '../app/(app)/index'
import { AuthContext, type AuthState } from '../auth/AuthContext'
import { ApiError, api } from '../lib/api'
import { hoyLocal } from '../lib/marcacion'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { pendiente, respuestaOk } from '../lib/offline/ayudasDePrueba'
import { guardarEstadoHoy } from '../lib/offline/cacheEstado'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1' }))
let mockZona: object = { fase: 'buscando' }
const mockMedir = jest.fn()
jest.mock('../components/MapaGeocerca', () => ({ MapaGeocerca: () => null }))
jest.mock('../lib/useZona', () => ({ useZona: () => ({ estado: mockZona, medir: mockMedir }) }))

const base: AuthState = {
  cargando: false, session: { user: { id: 'u-1' } } as unknown as Session,
  perfil: { id: 'u-1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol: 'usuario', activo: true },
  iniciarSesion: async () => null, cerrarSesion: async () => {},
}
const dibujar = () =>
  render(<AuthContext.Provider value={base}><SincronizacionProvider usuarioId="u-1"><Inicio /></SincronizacionProvider></AuthContext.Provider>)

const almacen = () => obtenerAlmacen() as AlmacenMemoria
const FECHA = '2026-10-15'
const marca = (tipo: string, hora: string) => ({
  id: tipo, tipo, fecha_hora: `${FECHA}T${hora}:00-05:00`, sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada',
})
const hoy = (extra: object = {}) => ({
  fecha: FECHA, marcaciones: [], siguiente: 'ingreso', dispositivo: 'este', rostro_registrado: true, rostro_requerido: true, ultima: null,
  jornada: { inicio: '08:00', fin: '17:00' }, ...extra,
})
let avisoRed: (s: { isConnected: boolean | null }) => void
let mockHoy: () => Promise<unknown>
let mockEnvio: (cuerpo: { id: string; tipo: never }) => Promise<unknown>

beforeEach(() => {
  almacen().filas.clear(); almacen().cache.clear()
  mockPush.mockReset(); mockMedir.mockReset(); jest.mocked(api).mockReset()
  mockZona = { fase: 'buscando' }
  mockHoy = async () => hoy()
  mockEnvio = async (c) => respuestaOk(c.id, c.tipo)
  jest.mocked(api).mockImplementation((async (ruta: string, op?: { body: { id: string; tipo: never } }) =>
    (ruta === '/marcaciones/hoy' ? mockHoy() : mockEnvio(op!.body))) as typeof api)
  jest.mocked(NetInfo.addEventListener).mockImplementation(((fn: typeof avisoRed) => { avisoRed = fn; return jest.fn() }) as never)
})

describe('Inicio · marcaciones guardadas en el celular', () => {
  it('sin nada guardado y con red, no muestra avisos de sincronización', async () => {
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    expect(screen.queryByText('Pendiente de enviar')).toBeNull()
    expect(screen.queryByText(/Sin conexión a internet/)).toBeNull()
    expect(screen.queryByLabelText('Sincronizar ahora')).toBeNull()
  })

  it('una marcación guardada se ve en la jornada como «por enviar» y ya cuenta: toca la siguiente', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'FOTO')
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await dibujar()
    expect(await screen.findByText('↑ 08:00 · por enviar')).toBeTruthy()
    expect(screen.getByText('1 marcación guardada en tu celular')).toBeTruthy()
    expect(screen.getByText('PENDIENTE DE ENVIAR')).toBeTruthy()
    expect(screen.getByText('1 de 4')).toBeTruthy()                             // «Marcaciones hoy» ya la cuenta
    expect(screen.getByLabelText('Marcar salida a almorzar')).toBeTruthy()      // el siguiente, no otro ingreso
    expect(screen.getByText('POR ENVIAR')).toBeTruthy()                          // la tarjeta «última marcación»
  })

  it('varias guardadas se cuentan en plural', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'F')
    await almacen().insertar(pendiente('p2', 'salida_almuerzo', '12:00'), 'F')
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await dibujar()
    expect(await screen.findByText('2 marcaciones guardadas en tu celular')).toBeTruthy()
    expect(screen.getByLabelText('Marcar regreso del almuerzo')).toBeTruthy()
  })

  it('«Sincronizar ahora» las envía, desaparece el aviso y se vuelve a pedir la jornada', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'FOTO')
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await dibujar()
    await screen.findByText('1 marcación guardada en tu celular')
    jest.mocked(api).mockClear()
    mockEnvio = async (c) => respuestaOk(c.id, c.tipo)
    mockHoy = async () => hoy({ marcaciones: [marca('ingreso', '08:00')], siguiente: 'salida_almuerzo' })
    await fireEvent.press(screen.getByLabelText('Sincronizar ahora'))
    await waitFor(() => expect(screen.queryByText('1 marcación guardada en tu celular')).toBeNull())
    expect(jest.mocked(api).mock.calls.some((c) => c[0] === '/marcaciones')).toBe(true)
    await waitFor(() => expect(screen.getByText('✓ 08:00')).toBeTruthy())       // vino del servidor, ya no «por enviar»
    expect(jest.mocked(api).mock.calls.filter((c) => c[0] === '/marcaciones/hoy').length).toBeGreaterThan(0)
  })

  it('con el último intento fallido, lo dice', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'FOTO')
    mockEnvio = async () => { throw new ApiError(503, 'El servidor está ocupado') }
    await dibujar()
    expect(await screen.findByText('Último intento: El servidor está ocupado')).toBeTruthy()
  })

  it('una marcación que el servidor rechazó se explica y se quita con «Entendido»', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'FOTO')
    mockEnvio = async () => { throw new ApiError(422, 'Pasaron más de 48 horas desde que marcaste', { codigo: 'marcacion_expirada' }) }
    await dibujar()
    expect(await screen.findByText(/Ingreso de las 08:00 no se pudo registrar: Pasaron más de 48 horas desde que marcaste/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Entendido'))
    await waitFor(() => expect(screen.queryByText(/no se pudo registrar/)).toBeNull())
    expect(almacen().filas.size).toBe(0)
  })

  it('las marcaciones guardadas por otra persona en este celular no aparecen', async () => {
    await almacen().insertar(pendiente('ajena', 'ingreso', '08:00', { usuario_id: 'u-2' }), 'FOTO')
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    expect(screen.queryByText(/guardada en tu celular|guardadas en tu celular/)).toBeNull()
    expect(jest.mocked(api).mock.calls.filter((c) => c[0] === '/marcaciones')).toHaveLength(0)
  })
})

describe('Inicio · sin internet', () => {
  it('avisa que no hay red y que se puede marcar igual', async () => {
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    await act(async () => { avisoRed({ isConnected: false }) })
    expect(screen.getByText(/Sin conexión a internet\. Puedes marcar igual/)).toBeTruthy()
    await act(async () => { avisoRed({ isConnected: true }) })
    expect(screen.queryByText(/Sin conexión a internet/)).toBeNull()
  })

  it('sin red usa la copia de la última vez: la jornada y el botón de marcar siguen ahí', async () => {
    const copia = hoy({ fecha: hoyLocal(), marcaciones: [{ ...marca('ingreso', '08:00'), fecha_hora: `${hoyLocal()}T08:00:00-05:00` }], siguiente: 'salida_almuerzo' })
    await guardarEstadoHoy('u-1', copia as never)
    mockHoy = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    await dibujar()
    expect(await screen.findByText('Mostramos lo último que guardamos de tu jornada. Se actualizará cuando vuelvas a tener internet.')).toBeTruthy()
    expect(screen.getByText('✓ 08:00')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Marcar salida a almorzar'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/marcar', params: { tipo: 'salida_almuerzo' } })
  })

  it('la copia de ayer no da por hechas las marcaciones de hoy', async () => {
    await guardarEstadoHoy('u-1', hoy({ fecha: '2020-01-01', marcaciones: [marca('ingreso', '08:00')], siguiente: 'salida_almuerzo' }) as never)
    mockHoy = async () => { throw new ApiError(0, 'sin red') }
    await dibujar()
    expect(await screen.findByLabelText('Marcar ingreso')).toBeTruthy()
    expect(screen.queryByText('✓ 08:00')).toBeNull()
  })

  it('sin red y sin copia no hay jornada que mostrar: error y «Reintentar»', async () => {
    mockHoy = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    await dibujar()
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    expect(screen.getByLabelText('Reintentar')).toBeTruthy()
  })

  it('un error del servidor (no de red) NO usa la copia: muestra el error', async () => {
    await guardarEstadoHoy('u-1', hoy({ fecha: hoyLocal() }) as never)
    mockHoy = async () => { throw new ApiError(502, 'No se pudieron cargar tus marcaciones') }
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    await dibujar()
    expect(await screen.findByText('No se pudieron cargar tus marcaciones')).toBeTruthy()
    expect(screen.queryByText(/Mostramos lo último/)).toBeNull()
  })

  it('cada consulta exitosa renueva la copia', async () => {
    await dibujar()
    await screen.findByText('Tu jornada de hoy')
    await waitFor(() => expect(almacen().cache.has('estado_hoy:u-1')).toBe(true))
    expect(JSON.parse(almacen().cache.get('estado_hoy:u-1')!).fecha).toBe(FECHA)
  })

  it('con GPS pero sin internet, la zona dice que se comprobará al enviar', async () => {
    mockZona = { fase: 'sin_conexion', precision_m: 12 }
    await dibujar()
    expect(await screen.findByText('SIN CONEXIÓN')).toBeTruthy()
    expect(screen.getByText('GPS ±12 m')).toBeTruthy()
    expect(screen.getByText(/podemos comprobar la zona\. Puedes marcar/)).toBeTruthy()
  })
})
