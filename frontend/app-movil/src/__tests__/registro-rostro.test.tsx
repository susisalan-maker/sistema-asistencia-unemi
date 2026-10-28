import { fireEvent, render, screen } from '@testing-library/react-native'
import RegistroRostro from '../app/(app)/registro-rostro'
import { registrarRostro } from '../lib/rostro'

// Las pantallas se prueban sueltas, sin barra de pestañas: UnaVisita (que reinicia la pantalla en cada visita) se prueba en una-visita.test.tsx.
jest.mock('../components/UnaVisita', () => ({ UnaVisita: ({ children }: { children: unknown }) => children }))

const mockBack = jest.fn()
const mockTomarFoto = jest.fn()
let mockPermisoCamara: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true }
const mockPedirCamara = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack, push: jest.fn() }) }))
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
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/rostro', () => ({ ...jest.requireActual('../lib/rostro'), registrarRostro: jest.fn() }))

let n = 0
beforeEach(() => {
  n = 0
  mockBack.mockReset(); mockPedirCamara.mockReset(); mockTomarFoto.mockReset(); jest.mocked(registrarRostro).mockReset()
  mockPermisoCamara = { granted: true, canAskAgain: true }
  mockTomarFoto.mockImplementation(async () => ({ uri: `file://f${++n}.jpg`, base64: `B64-${n}` }))
})

async function aceptarConsentimiento() {
  await render(<RegistroRostro />)
  await fireEvent.press(screen.getByLabelText('Acepto el tratamiento de mis datos biométricos'))
  await fireEvent.press(screen.getByLabelText('Continuar'))
}
async function tomarYUsar(etiquetaUsar = 'Usar esta foto') {
  await fireEvent.press(await screen.findByLabelText('Tomar foto'))
  await fireEvent.press(await screen.findByLabelText(etiquetaUsar))
}

describe('Registro de rostro', () => {
  it('no deja continuar sin aceptar el consentimiento', async () => {
    await render(<RegistroRostro />)
    expect(screen.getByText(/datos biométricos \(Ley Orgánica/)).toBeTruthy()
    expect(screen.getByLabelText('Continuar').props.accessibilityState?.disabled).toBe(true)
    await fireEvent.press(screen.getByLabelText('Continuar'))
    expect(screen.queryByTestId('camara')).toBeNull()
  })

  it('guía las tres fotos y las envía juntas', async () => {
    jest.mocked(registrarRostro).mockResolvedValue({ ok: true })
    await aceptarConsentimiento()
    expect(await screen.findByText(/Foto 1 de 3 · De frente/)).toBeTruthy()
    await tomarYUsar()
    expect(await screen.findByText(/Foto 2 de 3/)).toBeTruthy()
    await tomarYUsar()
    expect(await screen.findByText(/Foto 3 de 3/)).toBeTruthy()
    await tomarYUsar('Usar y registrar mi rostro')
    expect(await screen.findByText(/Tu rostro quedó registrado/)).toBeTruthy()
    expect(registrarRostro).toHaveBeenCalledWith(['B64-1', 'B64-2', 'B64-3'])
    await fireEvent.press(screen.getByLabelText('Listo'))
    expect(mockBack).toHaveBeenCalled()
  })

  it('se puede repetir una foto antes de usarla', async () => {
    jest.mocked(registrarRostro).mockResolvedValue({ ok: true })
    await aceptarConsentimiento()
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    await fireEvent.press(await screen.findByLabelText('Repetir foto'))
    expect(await screen.findByText(/Foto 1 de 3/)).toBeTruthy()
    await tomarYUsar(); await tomarYUsar(); await tomarYUsar('Usar y registrar mi rostro')
    await screen.findByText(/Tu rostro quedó registrado/)
    expect(registrarRostro).toHaveBeenCalledWith(['B64-2', 'B64-3', 'B64-4'])   // la primera tomada se descartó
  })

  it('si el servidor rechaza una foto, vuelve a pedir desde esa y conserva las anteriores', async () => {
    jest.mocked(registrarRostro)
      .mockResolvedValueOnce({ ok: false, mensaje: 'Foto 2: La foto salió borrosa.', foto: 2 })
      .mockResolvedValueOnce({ ok: true })
    await aceptarConsentimiento()
    await tomarYUsar(); await tomarYUsar(); await tomarYUsar('Usar y registrar mi rostro')
    expect(await screen.findByText('Foto 2: La foto salió borrosa.')).toBeTruthy()
    expect(screen.getByText(/Foto 2 de 3/)).toBeTruthy()
    await tomarYUsar(); await tomarYUsar('Usar y registrar mi rostro')
    await screen.findByText(/Tu rostro quedó registrado/)
    expect(registrarRostro).toHaveBeenLastCalledWith(['B64-1', 'B64-4', 'B64-5'])
  })

  it('si falla el envío por la red permite reintentar con las mismas fotos', async () => {
    jest.mocked(registrarRostro)
      .mockResolvedValueOnce({ ok: false, mensaje: 'No hay conexión con el servidor.', foto: null })
      .mockResolvedValueOnce({ ok: true })
    await aceptarConsentimiento()
    await tomarYUsar(); await tomarYUsar(); await tomarYUsar('Usar y registrar mi rostro')
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    await screen.findByText(/Tu rostro quedó registrado/)
    expect(registrarRostro).toHaveBeenNthCalledWith(2, ['B64-1', 'B64-2', 'B64-3'])
  })

  it('si las fotos no son de la misma persona permite empezar de nuevo', async () => {
    jest.mocked(registrarRostro).mockResolvedValueOnce({ ok: false, mensaje: 'Las fotos no parecen ser de la misma persona.', foto: null })
    await aceptarConsentimiento()
    await tomarYUsar(); await tomarYUsar(); await tomarYUsar('Usar y registrar mi rostro')
    await fireEvent.press(await screen.findByLabelText('Tomar las fotos otra vez'))
    expect(await screen.findByText(/Foto 1 de 3/)).toBeTruthy()
  })

  it('sin permiso de cámara lo pide', async () => {
    mockPermisoCamara = { granted: false, canAskAgain: true }
    await aceptarConsentimiento()
    await fireEvent.press(await screen.findByLabelText('Permitir cámara'))
    expect(mockPedirCamara).toHaveBeenCalled()
  })

  it('si la cámara falla al tomar la foto lo avisa', async () => {
    mockTomarFoto.mockRejectedValueOnce(new Error('x'))
    await aceptarConsentimiento()
    await fireEvent.press(await screen.findByLabelText('Tomar foto'))
    expect(await screen.findByText('No se pudo tomar la foto. Inténtalo de nuevo.')).toBeTruthy()
  })
})
