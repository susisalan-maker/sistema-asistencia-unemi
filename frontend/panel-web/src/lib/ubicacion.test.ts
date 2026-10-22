import { ErrorUbicacion, obtenerPosicion } from './ubicacion'

function simular(geo: unknown) {
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true })
}
afterEach(() => simular(undefined))

describe('obtenerPosicion (navegador)', () => {
  it('devuelve la posición con su precisión', async () => {
    simular({ getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude: -2.14, longitude: -79.59, accuracy: 12 } }) })
    const p = await obtenerPosicion()
    expect(p).toMatchObject({ latitud: -2.14, longitud: -79.59, precision_m: 12 })
    expect(Date.now() - p.tomadaEn).toBeLessThan(1000)
  })

  it('si el navegador no tiene geolocalización, lo dice', async () => {
    simular(undefined)
    await expect(obtenerPosicion()).rejects.toThrow(/no permite obtener la ubicación/)
  })

  it.each([
    [1, /Bloqueaste la ubicación/],
    [3, /a tiempo/],
    [2, /No pudimos obtener tu ubicación/],
  ])('el error %i se explica en español', async (code, mensaje) => {
    simular({ getCurrentPosition: (_: unknown, ko: (e: unknown) => void) => ko({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) })
    const error = await obtenerPosicion().catch((e) => e)
    expect(error).toBeInstanceOf(ErrorUbicacion)
    expect(error.message).toMatch(mensaje)
  })
})
