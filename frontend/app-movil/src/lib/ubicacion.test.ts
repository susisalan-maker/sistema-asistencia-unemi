import * as Location from 'expo-location'
import { ErrorUbicacion, obtenerPosicion } from './ubicacion'

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}))

const permiso = (status: 'granted' | 'denied', canAskAgain = true) =>
  jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status, canAskAgain } as never)

beforeEach(() => {
  jest.useRealTimers()
  permiso('granted')
  jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(true)
})

describe('obtenerPosicion', () => {
  it('devuelve las coordenadas y la precisión', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: -2.14, longitude: -79.6, accuracy: 12 } } as never)
    const p = await obtenerPosicion()
    expect(p).toMatchObject({ latitud: -2.14, longitud: -79.6, precision_m: 12 })
    expect(p.tomadaEn).toBeGreaterThan(0)
  })

  it('si el sistema no da la precisión, queda en null', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: 1, longitude: 2, accuracy: null } } as never)
    expect((await obtenerPosicion()).precision_m).toBeNull()
  })

  it('sin permiso explica qué hacer; si no se puede volver a pedir, manda a los ajustes', async () => {
    permiso('denied', true)
    await expect(obtenerPosicion()).rejects.toMatchObject({ message: expect.stringMatching(/ubicación/), abrirAjustes: false })
    permiso('denied', false)
    await expect(obtenerPosicion()).rejects.toMatchObject({ abrirAjustes: true })
  })

  it('con el GPS apagado lo dice', async () => {
    jest.mocked(Location.hasServicesEnabledAsync).mockResolvedValue(false)
    await expect(obtenerPosicion()).rejects.toThrow(/GPS está apagado/)
  })

  it('si el GPS falla, da un mensaje claro', async () => {
    jest.mocked(Location.getCurrentPositionAsync).mockRejectedValue(new Error('x'))
    const e = await obtenerPosicion().catch((x) => x)
    expect(e).toBeInstanceOf(ErrorUbicacion)
    expect(e.message).toMatch(/lugar abierto/)
  })

  it('si el GPS tarda demasiado, deja de esperar', async () => {
    jest.useFakeTimers()
    jest.mocked(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {}))
    const promesa = obtenerPosicion().catch((x) => x)
    await jest.advanceTimersByTimeAsync(20_001)
    expect((await promesa).message).toMatch(/lugar abierto/)
  })
})
