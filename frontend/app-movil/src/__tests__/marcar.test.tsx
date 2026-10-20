import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { forwardRef, useImperativeHandle } from 'react'
import { View } from 'react-native'
import Marcar from '../app/(app)/marcar'
import { ApiError, api } from '../lib/api'
import { ErrorUbicacion, obtenerPosicion } from '../lib/ubicacion'

const mockBack = jest.fn()
const mockTomarFoto = jest.fn()
let mockPermisoCamara: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true }
const mockPedirCamara = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: jest.fn() }),
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
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1' }))
jest.mock('../lib/ubicacion', () => ({ ...jest.requireActual('../lib/ubicacion'), obtenerPosicion: jest.fn() }))

const POS = { latitud: -2.14, longitud: -79.6, precision_m: 8, tomadaEn: Date.now() }
const OK = {
  marcacion: { id: 'uuid-1', tipo: 'ingreso', fecha_hora: '2026-10-15T13:02:00+00:00', sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada' },
  anomalias: [], reintento: false,
}

beforeEach(() => {
  mockUuid = 0
  mockBack.mockReset(); mockTomarFoto.mockReset(); mockPedirCamara.mockReset(); jest.mocked(api).mockReset()
  mockPermisoCamara = { granted: true, canAskAgain: true }
  jest.mocked(obtenerPosicion).mockReset()
  jest.mocked(obtenerPosicion).mockResolvedValue(POS)
  mockTomarFoto.mockResolvedValue({ uri: 'file://foto.jpg', base64: 'AAAA' })
})

async function hastaConfirmar() {
  await render(<Marcar />)
  await fireEvent.press(await screen.findByLabelText('Tomar foto'))
  await screen.findByLabelText('Enviar marcación')
}

describe('Marcar · ubicación', () => {
  it('pide la ubicación al abrir y luego muestra la cámara', async () => {
    await render(<Marcar />)
    expect(await screen.findByTestId('camara')).toBeTruthy()
    expect(obtenerPosicion).toHaveBeenCalledTimes(1)
  })

  it('si no hay permiso de ubicación lo explica y permite reintentar', async () => {
    jest.mocked(obtenerPosicion).mockRejectedValueOnce(new ErrorUbicacion('Necesitamos tu ubicación para comprobar que estás en tu sede.'))
    await render(<Marcar />)
    expect(await screen.findByText(/Necesitamos tu ubicación/)).toBeTruthy()
    expect(screen.queryByLabelText('Abrir ajustes')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByTestId('camara')).toBeTruthy()
  })

  it('si el permiso quedó bloqueado ofrece abrir los ajustes', async () => {
    jest.mocked(obtenerPosicion).mockRejectedValueOnce(new ErrorUbicacion('Actívala en los ajustes.', true))
    await render(<Marcar />)
    expect(await screen.findByLabelText('Abrir ajustes')).toBeTruthy()
  })
})

describe('Marcar · cámara', () => {
  it('sin permiso de cámara lo pide', async () => {
    mockPermisoCamara = { granted: false, canAskAgain: true }
    await render(<Marcar />)
    await fireEvent.press(await screen.findByLabelText('Permitir cámara'))
    expect(mockPedirCamara).toHaveBeenCalled()
  })

  it('con la cámara bloqueada manda a los ajustes', async () => {
    mockPermisoCamara = { granted: false, canAskAgain: false }
    await render(<Marcar />)
    expect(await screen.findByLabelText('Abrir ajustes')).toBeTruthy()
  })

  it('si la foto falla avisa y deja intentar otra vez', async () => {
    mockTomarFoto.mockResolvedValueOnce(undefined)
    await render(<Marcar />)
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText('No se pudo tomar la foto. Inténtalo de nuevo.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Tomar foto'))
    expect(await screen.findByLabelText('Enviar marcación')).toBeTruthy()
  })

  it('«Repetir foto» vuelve a la cámara', async () => {
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Repetir foto'))
    expect(await screen.findByTestId('camara')).toBeTruthy()
  })
})

describe('Marcar · envío', () => {
  it('envía tipo, ubicación, celular y selfie, y confirma con la hora de Ecuador', async () => {
    jest.mocked(api).mockResolvedValue(OK)
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText('Ingreso registrada a las 08:02.')).toBeTruthy()
    const [ruta, op] = jest.mocked(api).mock.calls[0] as [string, { method: string; body: Record<string, unknown> }]
    expect(ruta).toBe('/marcaciones')
    expect(op.method).toBe('POST')
    expect(op.body).toMatchObject({
      id: 'uuid-1', tipo: 'ingreso', latitud: -2.14, longitud: -79.6, precision_m: 8,
      origen: 'app', dispositivo_id: 'android:cel-1', selfie_b64: 'AAAA',
    })
    expect(new Date(op.body.fecha_hora as string).toString()).not.toBe('Invalid Date')
  })

  it('muestra las observaciones que dejó el servidor', async () => {
    jest.mocked(api).mockResolvedValue({ ...OK, anomalias: [{ tipo: 'fuera_geocerca', detalle: 'a 900 m' }, { tipo: 'fuera_horario', detalle: null }] })
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText('Estás fuera de la zona de tu sede.')).toBeTruthy()
    expect(screen.getByText('La marcación quedó fuera de tu horario.')).toBeTruthy()
  })

  it('un reintento ya registrado se dice así y «Listo» vuelve al inicio', async () => {
    jest.mocked(api).mockResolvedValue({ ...OK, reintento: true })
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText('Ingreso ya estaba registrada a las 08:02.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Listo'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('si falla la red muestra el error y, al reintentar, reenvía la MISMA marcación', async () => {
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.')).mockResolvedValue(OK)
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    await screen.findByText('Ingreso registrada a las 08:02.')
    const [primero, segundo] = jest.mocked(api).mock.calls.map((c) => (c[1] as { body: { id: string; fecha_hora: string } }).body)
    expect(segundo!.id).toBe(primero!.id)
    expect(segundo!.fecha_hora).toBe(primero!.fecha_hora)
  })

  it('si el rostro no se verifica muestra el motivo y permite repetir la foto', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(422, 'No pudimos verificar tu rostro. Intenta de nuevo con buena luz y de frente'))
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText(/No pudimos verificar tu rostro/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Repetir foto'))
    expect(await screen.findByTestId('camara')).toBeTruthy()
  })

  it('una marcación fuera de secuencia muestra lo que corresponde', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(409, 'Ahora te corresponde marcar «salida almuerzo»'))
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    expect(await screen.findByText('Ahora te corresponde marcar «salida almuerzo»')).toBeTruthy()
  })

  it('si la ubicación ya es vieja, la mide otra vez antes de enviar', async () => {
    jest.mocked(api).mockResolvedValue(OK)
    jest.mocked(obtenerPosicion).mockResolvedValueOnce({ ...POS, tomadaEn: Date.now() - 5 * 60_000 })
    jest.mocked(obtenerPosicion).mockResolvedValueOnce({ ...POS, latitud: -2.2, tomadaEn: Date.now() })
    await hastaConfirmar()
    await fireEvent.press(screen.getByLabelText('Enviar marcación'))
    await screen.findByText(/registrada a las/)
    expect(obtenerPosicion).toHaveBeenCalledTimes(2)
    expect((jest.mocked(api).mock.calls[0]![1] as { body: { latitud: number } }).body.latitud).toBe(-2.2)
  })

  it('«Cancelar» vuelve atrás', async () => {
    await render(<Marcar />)
    await screen.findByTestId('camara')
    await fireEvent.press(screen.getByText('Cancelar'))
    expect(mockBack).toHaveBeenCalled()
  })
})
