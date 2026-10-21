import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import Marcar from '../app/(app)/marcar'
import { ApiError, api } from '../lib/api'
import { ErrorUbicacion, obtenerPosicion } from '../lib/ubicacion'

const mockBack = jest.fn()
const mockNavigate = jest.fn()
const mockTomarFoto = jest.fn()
let mockPermisoCamara: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true }
const mockPedirCamara = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn(), navigate: mockNavigate }),
  useLocalSearchParams: () => ({ tipo: 'ingreso' }),
}))
jest.mock('expo-camera', () => {
  const { forwardRef, useImperativeHandle } = require('react')
  const { View } = require('react-native')
  return {
    CameraView: forwardRef((_: unknown, ref: unknown) => {
      useImperativeHandle(ref, () => ({ takePictureAsync: (o: unknown) => mockTomarFoto(o) }))
      return <View testID="camara" />
    }),
    useCameraPermissions: () => [mockPermisoCamara, mockPedirCamara],
  }
})
let mockUuid = 0
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1234', etiquetaDispositivo: (id: string) => `Android · ID …${id.slice(-4)}` }))
jest.mock('../lib/ubicacion', () => ({ ...jest.requireActual('../lib/ubicacion'), obtenerPosicion: jest.fn() }))

const POS = { latitud: -2.14, longitud: -79.6, precision_m: 8, tomadaEn: Date.now(), simulada: false }
const OK = {
  marcacion: { id: 'uuid-1', tipo: 'ingreso', fecha_hora: '2026-10-15T13:02:00+00:00', sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada' },
  anomalias: [], reintento: false,
}
const ZONA = { dentro: true, sede: 'Sede Matriz', lugar: 'Bloque A', distancia_m: 42, radio_m: 150, centro: { latitud: -2.14, longitud: -79.6 }, permite_fuera: false }
// Responde la consulta de zona y deja que cada prueba decida qué responde el envío de la marcación.
let mockEnvio: () => Promise<unknown>
let mockZona: () => Promise<unknown>

beforeEach(() => {
  mockUuid = 0
  mockBack.mockReset(); mockNavigate.mockReset(); mockTomarFoto.mockReset(); mockPedirCamara.mockReset(); jest.mocked(api).mockReset()
  mockPermisoCamara = { granted: true, canAskAgain: true }
  mockEnvio = async () => OK
  mockZona = async () => ZONA
  jest.mocked(api).mockImplementation((async (ruta: string) => (ruta.startsWith('/marcaciones/zona') ? mockZona() : mockEnvio())) as typeof api)
  jest.mocked(obtenerPosicion).mockReset()
  jest.mocked(obtenerPosicion).mockResolvedValue(POS)
  mockTomarFoto.mockResolvedValue({ uri: 'file://foto.jpg', base64: 'AAAA' })
})

const envios = () => jest.mocked(api).mock.calls.filter((c) => c[0] === '/marcaciones')
async function aLaCamara() {
  await render(<Marcar />)
  await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
  await screen.findByLabelText('Tomar foto')
}
async function hastaElResultado() {
  await aLaCamara()
  await fireEvent.press(screen.getByLabelText('Tomar foto'))
}

describe('Marcar · aviso previo (M3.1)', () => {
  it('pide la ubicación, consulta la zona y muestra dónde estás', async () => {
    await render(<Marcar />)
    expect(await screen.findByText('Verifica tu identidad')).toBeTruthy()
    expect(await screen.findByText('DENTRO DEL PERÍMETRO')).toBeTruthy()
    expect(screen.getByText('Bloque A')).toBeTruthy()
    expect(screen.getByText('MARCACIÓN DE INGRESO')).toBeTruthy()
    expect(obtenerPosicion).toHaveBeenCalledTimes(1)
    expect(jest.mocked(api).mock.calls[0]![0]).toBe('/marcaciones/zona?latitud=-2.14&longitud=-79.6')
  })

  it('el botón espera a tener la ubicación', async () => {
    let medir: (v: typeof POS) => void = () => {}
    jest.mocked(obtenerPosicion).mockReturnValue(new Promise((r) => { medir = r }))
    await render(<Marcar />)
    expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(true)
    medir(POS)
    await waitFor(() => expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(false))
  })

  it('fuera de la zona avisa, pero deja continuar', async () => {
    mockZona = async () => ({ ...ZONA, dentro: false, distancia_m: 400 })
    await render(<Marcar />)
    expect(await screen.findByText('FUERA DEL PERÍMETRO')).toBeTruthy()
    expect(screen.getByText(/puedes marcar, pero quedará una observación/)).toBeTruthy()
    expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(false)
  })

  it('si la zona no se pudo consultar igual deja continuar (el servidor valida)', async () => {
    mockZona = async () => { throw new ApiError(0, 'sin red') }
    await render(<Marcar />)
    await waitFor(() => expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(false))
    expect(screen.queryByText('DENTRO DEL PERÍMETRO')).toBeNull()
  })

  it('si no hay permiso de ubicación lo explica y permite reintentar', async () => {
    jest.mocked(obtenerPosicion).mockRejectedValueOnce(new ErrorUbicacion('Necesitamos tu ubicación para comprobar que estás en tu sede.'))
    await render(<Marcar />)
    expect(await screen.findByText(/Necesitamos tu ubicación/)).toBeTruthy()
    expect(screen.queryByLabelText('Abrir ajustes')).toBeNull()
    expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    await waitFor(() => expect(screen.getByLabelText('Iniciar verificación facial').props.accessibilityState.disabled).toBe(false))
  })

  it('si el permiso quedó bloqueado ofrece abrir los ajustes', async () => {
    jest.mocked(obtenerPosicion).mockRejectedValueOnce(new ErrorUbicacion('Actívala en los ajustes.', true))
    await render(<Marcar />)
    expect(await screen.findByLabelText('Abrir ajustes')).toBeTruthy()
  })

  it('«Cancelar marcación» vuelve atrás', async () => {
    await render(<Marcar />)
    await fireEvent.press(await screen.findByLabelText('Cancelar marcación'))
    expect(mockBack).toHaveBeenCalled()
  })
})

describe('Marcar · cámara (M3.2)', () => {
  it('muestra la cámara con la guía del óvalo', async () => {
    await aLaCamara()
    expect(screen.getByTestId('camara')).toBeTruthy()
    expect(screen.getByText('Verificación facial')).toBeTruthy()
    expect(screen.getByText('Centra tu rostro dentro del óvalo')).toBeTruthy()
  })

  it('la ✕ vuelve al aviso previo', async () => {
    await aLaCamara()
    await fireEvent.press(screen.getByLabelText('Cerrar verificación'))
    expect(await screen.findByText('Verifica tu identidad')).toBeTruthy()
  })

  it('sin permiso de cámara lo pide', async () => {
    mockPermisoCamara = { granted: false, canAskAgain: true }
    await render(<Marcar />)
    await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
    await fireEvent.press(await screen.findByLabelText('Permitir cámara'))
    expect(mockPedirCamara).toHaveBeenCalled()
  })

  it('con la cámara bloqueada manda a los ajustes', async () => {
    mockPermisoCamara = { granted: false, canAskAgain: false }
    await render(<Marcar />)
    await fireEvent.press(await screen.findByLabelText('Iniciar verificación facial'))
    expect(await screen.findByLabelText('Abrir ajustes')).toBeTruthy()
  })

  it('si la foto falla avisa y deja intentar otra vez', async () => {
    mockTomarFoto.mockResolvedValueOnce(undefined)
    await aLaCamara()
    await fireEvent.press(screen.getByLabelText('Tomar foto'))
    expect(await screen.findByText('No se pudo tomar la foto. Inténtalo de nuevo.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Tomar foto'))
    expect(await screen.findByText(/Ingreso registrado/)).toBeTruthy()
  })
})

describe('Marcar · envío y resultado (M3.3)', () => {
  it('envía tipo, ubicación, celular y selfie, y confirma con la hora de Ecuador', async () => {
    await hastaElResultado()
    expect(await screen.findByText('Ingreso registrado · 08:02')).toBeTruthy()
    const [ruta, op] = envios()[0] as [string, { method: string; body: Record<string, unknown> }]
    expect(ruta).toBe('/marcaciones')
    expect(op.method).toBe('POST')
    expect(op.body).toMatchObject({
      id: 'uuid-1', tipo: 'ingreso', latitud: -2.14, longitud: -79.6, precision_m: 8,
      origen: 'app', dispositivo_id: 'android:cel-1234', selfie_b64: 'AAAA', ubicacion_simulada: false,
    })
    // La hora la pone el servidor: el celular ya no manda la suya.
    expect(op.body).not.toHaveProperty('fecha_hora')
  })

  it('si Android avisa que la ubicación es simulada, lo envía y muestra el rechazo del servidor', async () => {
    jest.mocked(obtenerPosicion).mockResolvedValue({ ...POS, simulada: true })
    mockEnvio = async () => { throw new ApiError(403, 'Detectamos que la ubicación de tu celular es simulada. Desactiva la app de ubicación falsa e inténtalo de nuevo') }
    await hastaElResultado()
    expect(await screen.findByText(/ubicación de tu celular es simulada/)).toBeTruthy()
    const [, op] = envios()[0] as [string, { body: Record<string, unknown> }]
    expect(op.body.ubicacion_simulada).toBe(true)
  })

  it('muestra analizando mientras el servidor responde', async () => {
    let responder: (v: unknown) => void = () => {}
    mockEnvio = () => new Promise((r) => { responder = r })
    await aLaCamara()
    // La pulsación espera al manejador (que espera al servidor): no se «await» hasta que responda.
    const pulsado = fireEvent.press(screen.getByLabelText('Tomar foto'))
    expect(await screen.findByText('Analizando rostro…')).toBeTruthy()
    expect(screen.getByText('Mantén el teléfono estable')).toBeTruthy()
    expect(screen.getByText(/Comparando con el rostro registrado/)).toBeTruthy()
    responder(OK)
    await pulsado
    expect(await screen.findByText('Ingreso registrado · 08:02')).toBeTruthy()
  })

  it('el resultado trae sede, coordenadas y dispositivo', async () => {
    await hastaElResultado()
    await screen.findByText('Ingreso registrado · 08:02')
    expect(screen.getByText('Sede Matriz')).toBeTruthy()
    expect(screen.getByText('-2.14000, -79.60000')).toBeTruthy()
    expect(screen.getByText('Android · ID …1234')).toBeTruthy()
    expect(screen.getByText(/Bloque A · Identidad verificada/)).toBeTruthy()
  })

  it('muestra las observaciones que dejó el servidor', async () => {
    mockEnvio = async () => ({ ...OK, anomalias: [{ tipo: 'fuera_geocerca', detalle: 'a 900 m' }, { tipo: 'fuera_horario', detalle: null }] })
    await hastaElResultado()
    expect(await screen.findByText('Estás fuera de la zona de tu sede.')).toBeTruthy()
    expect(screen.getByText('La marcación quedó fuera de tu horario.')).toBeTruthy()
  })

  it('una salida se dice en femenino', async () => {
    mockEnvio = async () => ({ ...OK, marcacion: { ...OK.marcacion, tipo: 'salida' } })
    await hastaElResultado()
    expect(await screen.findByText('Salida registrada · 08:02')).toBeTruthy()
  })

  it('un reintento ya registrado se dice así', async () => {
    mockEnvio = async () => ({ ...OK, reintento: true })
    await hastaElResultado()
    expect(await screen.findByText('Ingreso ya estaba registrado · 08:02')).toBeTruthy()
  })

  it('«Volver al inicio» y «Ver historial» navegan', async () => {
    await hastaElResultado()
    await fireEvent.press(await screen.findByLabelText('Volver al inicio'))
    expect(mockBack).toHaveBeenCalled()
    await fireEvent.press(screen.getByLabelText('Ver historial'))
    expect(mockNavigate).toHaveBeenCalledWith('/historial')
  })

  it('si la ubicación ya es vieja, la mide otra vez antes de enviar', async () => {
    jest.mocked(obtenerPosicion).mockResolvedValueOnce({ ...POS, tomadaEn: Date.now() - 5 * 60_000 })
    jest.mocked(obtenerPosicion).mockResolvedValueOnce({ ...POS, latitud: -2.2, tomadaEn: Date.now() })
    await hastaElResultado()
    await screen.findByText(/registrado · /)
    expect(obtenerPosicion).toHaveBeenCalledTimes(2)
    expect((envios()[0]![1] as { body: { latitud: number } }).body.latitud).toBe(-2.2)
  })
})

describe('Marcar · no se pudo verificar (M3.4)', () => {
  const rechazo = (intento: number) => new ApiError(422, 'No pudimos verificar tu rostro. Intenta de nuevo.', { codigo: 'rostro_no_verificado', intento })

  it('explica que la marcación no se guardó, con el número de intento y qué revisar', async () => {
    mockEnvio = async () => { throw rechazo(2) }
    await hastaElResultado()
    expect(await screen.findByText('No pudimos verificar tu identidad')).toBeTruthy()
    expect(screen.getByText(/Tu marcación de las \d\d:\d\d no se ha guardado/)).toBeTruthy()
    expect(screen.getByText('ANTES DE REINTENTAR')).toBeTruthy()
    expect(screen.getByText('Busca una zona con buena iluminación')).toBeTruthy()
    expect(screen.getByText('Intento 2')).toBeTruthy()
  })

  it('«Reintentar verificación» vuelve a la cámara y el siguiente envío es otra foto', async () => {
    mockEnvio = async () => { throw rechazo(1) }
    await hastaElResultado()
    await fireEvent.press(await screen.findByLabelText('Reintentar verificación'))
    mockEnvio = async () => OK
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText('Ingreso registrado · 08:02')).toBeTruthy()
    expect(envios()).toHaveLength(2)
  })

  it('un problema de calidad de la foto muestra el motivo del servidor', async () => {
    mockEnvio = async () => { throw new ApiError(422, 'No se detectó ningún rostro en la foto') }
    await hastaElResultado()
    expect(await screen.findByText(/No se detectó ningún rostro en la foto\. Tu marcación/)).toBeTruthy()
    expect(screen.queryByText(/Intento \d/)).toBeNull()
  })

  it('«Cancelar marcación» sale sin guardar', async () => {
    mockEnvio = async () => { throw rechazo(1) }
    await hastaElResultado()
    await fireEvent.press(await screen.findByLabelText('Cancelar marcación'))
    expect(mockBack).toHaveBeenCalled()
  })
})

describe('Marcar · otros errores', () => {
  it('si falla la red muestra el error y, al reintentar, reenvía la MISMA marcación', async () => {
    mockEnvio = async () => { throw new ApiError(0, 'No hay conexión con el servidor.') }
    await hastaElResultado()
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    mockEnvio = async () => OK
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    await screen.findByText('Ingreso registrado · 08:02')
    const [primero, segundo] = envios().map((c) => (c[1] as { body: { id: string } }).body)
    expect(segundo!.id).toBe(primero!.id)
  })

  it('una marcación fuera de secuencia muestra lo que corresponde', async () => {
    mockEnvio = async () => { throw new ApiError(409, 'Ahora te corresponde marcar «salida almuerzo»') }
    await hastaElResultado()
    expect(await screen.findByText('Ahora te corresponde marcar «salida almuerzo»')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Cancelar marcación'))
    expect(mockBack).toHaveBeenCalled()
  })
})
