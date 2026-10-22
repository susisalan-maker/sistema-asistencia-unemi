import { abrirCamara, cerrarCamara, ErrorCamara, tomarFoto } from './camara'

function simularCamara(getUserMedia?: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', { value: getUserMedia ? { getUserMedia } : undefined, configurable: true })
}
afterEach(() => simularCamara())

describe('abrirCamara', () => {
  it('pide la cámara frontal sin audio', async () => {
    const flujo = {} as MediaStream
    const pedir = vi.fn().mockResolvedValue(flujo)
    simularCamara(pedir)
    expect(await abrirCamara()).toBe(flujo)
    expect(pedir).toHaveBeenCalledWith(expect.objectContaining({ audio: false, video: expect.objectContaining({ facingMode: 'user' }) }))
  })

  it('sin soporte del navegador lo explica', async () => {
    simularCamara()
    await expect(abrirCamara()).rejects.toThrow(/no permite usar la cámara/)
  })

  it.each([
    ['NotAllowedError', /Bloqueaste la cámara/],
    ['NotFoundError', /No encontramos una cámara/],
    ['NotReadableError', /Otra aplicación/],
    ['AbortError', /No se pudo abrir la cámara/],
  ])('%s se explica en español', async (nombre, mensaje) => {
    simularCamara(vi.fn().mockRejectedValue(new DOMException('x', nombre)))
    const error = await abrirCamara().catch((e) => e)
    expect(error).toBeInstanceOf(ErrorCamara)
    expect(error.message).toMatch(mensaje)
  })
})

describe('cerrarCamara y tomarFoto', () => {
  it('detiene todas las pistas de la cámara', () => {
    const detener = vi.fn()
    cerrarCamara({ getTracks: () => [{ stop: detener }, { stop: detener }] } as unknown as MediaStream)
    expect(detener).toHaveBeenCalledTimes(2)
    expect(() => cerrarCamara(null)).not.toThrow()
  })

  it('si el video aún no tiene imagen, pide esperar', () => {
    expect(() => tomarFoto({ videoWidth: 0, videoHeight: 0 } as HTMLVideoElement)).toThrow(/todavía no está lista/)
  })
})
