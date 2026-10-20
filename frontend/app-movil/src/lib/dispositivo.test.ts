import * as Application from 'expo-application'
import { Platform } from 'react-native'
import { idDispositivo } from './dispositivo'

jest.mock('expo-application', () => ({ getAndroidId: jest.fn(), getIosIdForVendorAsync: jest.fn() }))
jest.mock('expo-crypto', () => ({ randomUUID: jest.fn(() => 'uuid-nuevo') }))

const memoria = new Map<string, string>()
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v) },
  })
})
beforeEach(() => { memoria.clear(); jest.mocked(Application.getAndroidId).mockReset(); jest.mocked(Application.getIosIdForVendorAsync).mockReset() })

const como = (os: 'android' | 'ios' | 'web') => { Platform.OS = os }

describe('idDispositivo', () => {
  it('en Android usa el ANDROID_ID', async () => {
    como('android')
    jest.mocked(Application.getAndroidId).mockReturnValue('abc123')
    expect(await idDispositivo()).toBe('android:abc123')
  })

  it('en iPhone usa el identificador del proveedor', async () => {
    como('ios')
    jest.mocked(Application.getIosIdForVendorAsync).mockResolvedValue('vendor-9')
    expect(await idDispositivo()).toBe('ios:vendor-9')
  })

  it('si el sistema no lo da, crea uno y lo conserva para la próxima vez', async () => {
    como('android')
    jest.mocked(Application.getAndroidId).mockReturnValue('')
    expect(await idDispositivo()).toBe('android:uuid-nuevo')
    expect(memoria.get('asistencia.dispositivo_id')).toBe('android:uuid-nuevo')
    memoria.set('asistencia.dispositivo_id', 'android:guardado')
    expect(await idDispositivo()).toBe('android:guardado')
  })

  it('si leer el identificador falla, también usa el respaldo', async () => {
    como('ios')
    jest.mocked(Application.getIosIdForVendorAsync).mockRejectedValue(new Error('no'))
    expect(await idDispositivo()).toBe('ios:uuid-nuevo')
  })

  it('en web usa el respaldo', async () => {
    como('web')
    expect(await idDispositivo()).toBe('web:uuid-nuevo')
  })
})
