import NetInfo from '@react-native-community/netinfo'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Marcar from '../app/(app)/marcar'
import { ApiError, api } from '../lib/api'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { pendiente } from '../lib/offline/ayudasDePrueba'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'
import { guardarAncla } from '../lib/offline/ancla'
import { crearNativoFalso, modulo, type NativoFalso } from '../lib/firma/ayudasDePrueba'
import { mensajeDeMarcacion } from '../lib/firma/mensaje'
import { obtenerPosicion } from '../lib/ubicacion'

// Las pantallas se prueban sueltas, sin barra de pestañas: UnaVisita (que reinicia la pantalla en cada visita) se prueba en una-visita.test.tsx.
jest.mock('../components/UnaVisita', () => ({ UnaVisita: ({ children }: { children: unknown }) => children }))

const mockBack = jest.fn()
const mockNavigate = jest.fn()
const mockTomarFoto = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), navigate: mockNavigate }),
  useLocalSearchParams: () => ({ tipo: 'salida_almuerzo' }),
}))
jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = require('react')
  const { View } = require('react-native')
  return {
    CameraView: forwardRef((_: unknown, ref: unknown) => {
      useImperativeHandle(ref, () => ({ takePictureAsync: (o: unknown) => mockTomarFoto(o) }))
      return <View testID="camara" />
    }),
    useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  }
})
let mockArranque = 5_000_000
jest.mock('expo-device', () => ({ getUptimeAsync: async () => mockArranque }))
let mockUuid = 0
jest.mock('expo-crypto', () => ({ ...require('../lib/firma/ayudasDePrueba').expoCryptoFalso(), randomUUID: () => `uuid-${++mockUuid}` }))
// El módulo nativo de la firma: cada prueba decide si lo hay (un celular con chip de seguridad) o no (Expo Go).
jest.mock('../../modules/firma-dispositivo', () => ({ __esModule: true, get default() { return require('../lib/firma/ayudasDePrueba').modulo.actual } }))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1234', etiquetaDispositivo: (id: string) => `Android · ID …${id.slice(-4)}` }))
jest.mock('../lib/ubicacion', () => ({ ...jest.requireActual('../lib/ubicacion'), obtenerPosicion: jest.fn() }))

const POS = { latitud: -2.14, longitud: -79.6, precision_m: 8, tomadaEn: Date.now(), simulada: false }
const OK = (id: string) => ({
  marcacion: { id, tipo: 'salida_almuerzo', fecha_hora: '2026-10-15T17:30:00+00:00', sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada', sin_conexion: true },
  anomalias: [], reintento: false,
})
const ZONA = { dentro: true, sede: 'Sede Matriz', lugar: 'Bloque A', distancia_m: 42, radio_m: 150, centro: { latitud: -2.14, longitud: -79.6 }, permite_fuera: false }

const almacen = () => obtenerAlmacen() as AlmacenMemoria
let avisoRed: (s: { isConnected: boolean | null }) => void
let mockZona: () => Promise<unknown>
let mockEnvio: (cuerpo: Record<string, unknown>) => Promise<unknown>
const envios = () => jest.mocked(api).mock.calls.filter((c) => c[0] === '/marcaciones').map((c) => (c[1] as { body: Record<string, unknown> }).body)

beforeEach(() => {
  modulo.actual = null
  mockUuid = 0
  mockArranque = 5_000_000
  almacen().filas.clear(); almacen().cache.clear()
  mockBack.mockReset(); mockNavigate.mockReset(); mockTomarFoto.mockReset(); jest.mocked(api).mockReset()
  mockZona = async () => ZONA
  mockEnvio = async (c) => OK(c.id as string)
  jest.mocked(api).mockImplementation((async (ruta: string, op?: { body: Record<string, unknown> }) =>
    (ruta.startsWith('/marcaciones/zona') ? mockZona() : mockEnvio(op!.body))) as typeof api)
  jest.mocked(obtenerPosicion).mockReset()
  jest.mocked(obtenerPosicion).mockResolvedValue(POS)
  mockTomarFoto.mockResolvedValue({ uri: 'file://foto.jpg', base64: 'AAAA' })
  jest.mocked(NetInfo.addEventListener).mockImplementation(((fn: typeof avisoRed) => { avisoRed = fn; return jest.fn() }) as never)
})

async function marcarConFoto(usuarioId: string | null = 'u-1') {
  await render(<SincronizacionProvider usuarioId={usuarioId}><Marcar /></SincronizacionProvider>)
  await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
  await fireEvent.press(await screen.findByLabelText('Tomar foto'))
}

describe('Marcar sin internet', () => {
  it('si la red falla al enviar, la marcación queda guardada en el celular y se dice claramente', async () => {
    mockEnvio = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    await marcarConFoto()
    expect(await screen.findByText(/^Salida a almorzar guardada · /)).toBeTruthy()
    expect(screen.getByText('Sin conexión: se enviará sola en cuanto tengas internet.')).toBeTruthy()
    expect(screen.getByText('Pendiente de enviar')).toBeTruthy()
    expect(screen.getByText(/se verifican al enviarla/)).toBeTruthy()
    expect(screen.queryByText(/Error|No se pudo registrar/)).toBeNull()

    const [p] = await almacen().listar('u-1')
    expect(p).toMatchObject({ id: 'uuid-1', tipo: 'salida_almuerzo', latitud: -2.14, longitud: -79.6, precision_m: 8, dispositivo_id: 'android:cel-1234', estado: 'pendiente' })
    expect(await almacen().selfie('uuid-1')).toBe('AAAA')
  })

  describe('firma con la clave del chip de seguridad del celular', () => {
    const ALIAS = 'asistencia.marca.u-1'
    let nativo: NativoFalso
    beforeEach(async () => {
      nativo = crearNativoFalso()
      modulo.actual = nativo
      await nativo.crearClaveAsync(ALIAS, 'x')   // la clave que se creó al vincular el celular
    })

    it('la marcación hecha sin internet queda firmada, y la firma se verifica con los datos guardados', async () => {
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      const [p] = await almacen().listar('u-1')
      expect(p!.firma).toEqual(expect.any(String))
      const mensaje = await mensajeDeMarcacion({
        usuario_id: 'u-1', id: p!.id, tipo: p!.tipo, fecha_hora: p!.fecha_hora, latitud: p!.latitud, longitud: p!.longitud,
        dispositivo_id: p!.dispositivo_id, selfie_b64: (await almacen().selfie(p!.id))!,
      })
      expect(nativo.verificar(ALIAS, mensaje, p!.firma!)).toBe(true)
    })

    it('al enviarla después viaja con la firma', async () => {
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      const [p] = await almacen().listar('u-1')
      mockEnvio = async (c) => OK(c.id as string)
      await act(async () => { avisoRed({ isConnected: false }); avisoRed({ isConnected: true }) })
      await waitFor(() => expect(almacen().filas.size).toBe(0))
      expect(envios().at(-1)!.firma).toBe(p!.firma)
    })

    it('en línea no se firma: el servidor pone la hora', async () => {
      await marcarConFoto()
      await screen.findByText(/Salida a almorzar registrada/)
      expect(envios()[0]).not.toHaveProperty('firma')
      expect(nativo.firmarAsync).not.toHaveBeenCalled()
    })

    it('si el chip no logra firmar, no se guarda la marcación y se le dice a la persona', async () => {
      nativo.firmarAsync.mockRejectedValue(new Error('el chip no responde'))
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      expect(await screen.findByText(/No se pudo firmar la marcación/)).toBeTruthy()
      expect(almacen().filas.size).toBe(0)
    })

    it('sin el módulo (Expo Go) se guarda sin firma, como siempre', async () => {
      modulo.actual = null
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      expect((await almacen().listar('u-1'))[0]!.firma).toBeNull()
    })
  })

  describe('prueba de que el reloj no estaba atrasado', () => {
    const HORA = { t: '2026-10-15T12:50:00.000+00:00', firma: 'f'.repeat(64) }

    it('guarda con la marcación la hora firmada del servidor y cuánto llevaba encendido el celular', async () => {
      await guardarAncla('u-1', HORA)            // la app recibió la hora del servidor con el celular encendido 5 000 000 ms
      mockArranque = 5_000_000 + 600_000         // y marca 10 minutos después
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      const [p] = await almacen().listar('u-1')
      expect(p!.reloj).toEqual({ servidor_t: HORA.t, firma: HORA.firma, arranque_ancla_ms: 5_000_000, arranque_marca_ms: 5_600_000 })
    })

    it('al enviarla después, la prueba viaja con la marcación', async () => {
      await guardarAncla('u-1', HORA)
      mockArranque = 5_600_000
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      mockEnvio = async (c) => OK(c.id as string)
      await act(async () => { avisoRed({ isConnected: false }); avisoRed({ isConnected: true }) })
      await waitFor(() => expect(almacen().filas.size).toBe(0))
      const enviada = envios().at(-1)!
      expect(enviada.sin_conexion).toBe(true)
      expect(enviada.reloj).toEqual({ servidor_t: HORA.t, firma: HORA.firma, arranque_ancla_ms: 5_000_000, arranque_marca_ms: 5_600_000 })
    })

    it('sin hora guardada (primera vez) la marcación se guarda igual, sin prueba', async () => {
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      expect((await almacen().listar('u-1'))[0]!.reloj).toBeNull()
    })

    it('si el celular se reinició desde que recibió la hora, no hay prueba pero la marcación no se pierde', async () => {
      await guardarAncla('u-1', HORA)
      mockArranque = 20_000   // el contador volvió a cero
      mockEnvio = async () => { throw new ApiError(0, 'sin red') }
      await marcarConFoto()
      await screen.findByText(/guardada · /)
      expect((await almacen().listar('u-1'))[0]!.reloj).toBeNull()
    })

    it('en línea no viaja: el servidor pone la hora', async () => {
      await guardarAncla('u-1', HORA)
      await marcarConFoto()
      await screen.findByText(/Salida a almorzar registrada/)
      expect(envios()[0]).not.toHaveProperty('reloj')
    })
  })

  it('guarda la hora en que se tomó la foto, no la del momento en que vuelve la señal', async () => {
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    const antes = Date.now()
    await marcarConFoto()
    await screen.findByText(/guardada · /)
    const [p] = await almacen().listar('u-1')
    const hora = new Date(p!.fecha_hora).getTime()
    expect(hora).toBeGreaterThanOrEqual(antes - 1000)
    expect(hora).toBeLessThanOrEqual(Date.now() + 1000)
    expect(p!.fecha_hora).toMatch(/Z$/)
  })

  it('en línea, la hora de la marcación sigue sin viajar: la pone el servidor', async () => {
    await marcarConFoto()
    await screen.findByText(/Salida a almorzar registrada/)
    expect(envios()).toHaveLength(1)
    expect(envios()[0]).not.toHaveProperty('fecha_hora')
    expect(envios()[0]).not.toHaveProperty('sin_conexion')
    expect(almacen().filas.size).toBe(0)
  })

  it('si el celular no tiene ninguna red ni lo intenta: la guarda al instante', async () => {
    await render(<SincronizacionProvider usuarioId="u-1"><Marcar /></SincronizacionProvider>)
    await act(async () => { avisoRed({ isConnected: false }) })
    await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText(/guardada · /)).toBeTruthy()
    expect(envios()).toHaveLength(0)
    expect(almacen().filas.size).toBe(1)
  })

  it('«Reintentar verificación» tras un rostro rechazado no arrastra el id ni la hora de la foto anterior', async () => {
    mockEnvio = async () => { throw new ApiError(422, 'No pudimos verificar tu rostro', { codigo: 'rostro_no_verificado', intento: 1 }) }
    await marcarConFoto()
    await fireEvent.press(await screen.findByLabelText('Reintentar verificación'))
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    await screen.findByText(/guardada · /)
    expect(envios().map((b) => b.id)).toEqual(['uuid-1', 'uuid-2'])
    expect((await almacen().listar('u-1')).map((p) => p.id)).toEqual(['uuid-2'])
  })

  it('un rechazo del servidor (no un corte de red) NO se guarda: se muestra el error', async () => {
    mockEnvio = async () => { throw new ApiError(409, 'Ahora te corresponde marcar «ingreso»') }
    await marcarConFoto()
    expect(await screen.findByText('Ahora te corresponde marcar «ingreso»')).toBeTruthy()
    expect(almacen().filas.size).toBe(0)
  })

  it('sin sesión (no hay dónde guardar) mantiene el comportamiento de siempre: error y «Reintentar»', async () => {
    mockEnvio = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    await marcarConFoto(null)
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    expect(screen.getByLabelText('Reintentar')).toBeTruthy()
  })

  it('«Volver al inicio» y «Ver historial» funcionan desde la pantalla de guardada', async () => {
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await marcarConFoto()
    await fireEvent.press(await screen.findByLabelText('Ver historial'))
    expect(mockNavigate).toHaveBeenCalledWith('/historial')
    await fireEvent.press(screen.getByLabelText('Volver al inicio'))
    expect(mockBack).toHaveBeenCalled()
  })
})

describe('Marcar con marcaciones ya guardadas', () => {
  it('si hay otras sin enviar, esta se guarda detrás y se envían todas en orden; se muestra el resultado de esta', async () => {
    await almacen().insertar(pendiente('previa', 'ingreso', '08:00'), 'FOTO-PREVIA')
    // El proveedor intenta enviar lo guardado al entrar y no hay red: sigue pendiente.
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await render(<SincronizacionProvider usuarioId="u-1"><Marcar /></SincronizacionProvider>)
    await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
    await waitFor(() => expect(envios().length).toBeGreaterThan(0))

    mockEnvio = async (c) => OK(c.id as string)
    jest.mocked(api).mockClear()
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText(/Salida a almorzar registrada/)).toBeTruthy()
    expect(envios().map((b) => b.id)).toEqual(['previa', 'uuid-1'])
    expect(envios().every((b) => b.sin_conexion === true)).toBe(true)
    expect(almacen().filas.size).toBe(0)
  })

  it('si aún no hay red, se guarda y se dice que está pendiente', async () => {
    await almacen().insertar(pendiente('previa', 'ingreso', '08:00'), 'FOTO-PREVIA')
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await marcarConFoto()
    expect(await screen.findByText(/guardada · /)).toBeTruthy()
    expect((await almacen().listar('u-1')).map((p) => p.id).sort()).toEqual(['previa', 'uuid-1'].sort())
  })

  it('si el servidor rechaza esta marcación al sincronizar, muestra el motivo y no la deja en la lista', async () => {
    await almacen().insertar(pendiente('previa', 'ingreso', '08:00'), 'FOTO-PREVIA')
    mockEnvio = async () => { throw new ApiError(0, 'sin red') }
    await render(<SincronizacionProvider usuarioId="u-1"><Marcar /></SincronizacionProvider>)
    await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
    await waitFor(() => expect(envios().length).toBeGreaterThan(0))
    mockEnvio = async (c) => {
      if (c.id === 'previa') return OK('previa')
      throw new ApiError(422, 'Pasaron más de 48 horas desde que marcaste', { codigo: 'marcacion_expirada' })
    }
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText('Pasaron más de 48 horas desde que marcaste')).toBeTruthy()
    expect(almacen().filas.size).toBe(0)
  })
})

describe('Marcar · aviso previo sin internet', () => {
  it('si la zona no se puede consultar por falta de red, lo dice y deja continuar', async () => {
    mockZona = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    await render(<SincronizacionProvider usuarioId="u-1"><Marcar /></SincronizacionProvider>)
    expect(await screen.findByText('SIN CONEXIÓN')).toBeTruthy()
    expect(screen.getByText('La zona se comprobará cuando se envíe.')).toBeTruthy()
    expect(screen.getByText(/tu marcación se guardará en el celular/)).toBeTruthy()
    expect(screen.getByLabelText('Iniciar verificación facial')).toBeEnabled()
  })

  it('si la zona falla por otro motivo no habla de conexión', async () => {
    mockZona = async () => { throw new ApiError(502, 'No se pudo comprobar tu ubicación') }
    await render(<SincronizacionProvider usuarioId="u-1"><Marcar /></SincronizacionProvider>)
    await screen.findByText('Verifica tu identidad')
    await waitFor(() => expect(screen.getByLabelText('Iniciar verificación facial')).toBeEnabled())
    expect(screen.queryByText('SIN CONEXIÓN')).toBeNull()
  })
})
