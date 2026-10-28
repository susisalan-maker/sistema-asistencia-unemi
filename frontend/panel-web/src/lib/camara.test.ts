import { abrirCamara, cerrarCamara, ErrorCamara, MENSAJE_SIN_CAMARA, tomarFoto } from './camara'

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

  it('el mensaje es el acordado: usar otro dispositivo con cámara', () => {
    expect(MENSAJE_SIN_CAMARA).toBe('Para registrar asistencia, utilice otro dispositivo con cámara')
  })

  it('sin soporte del navegador pide usar otro dispositivo con cámara', async () => {
    simularCamara()
    await expect(abrirCamara()).rejects.toThrow(MENSAJE_SIN_CAMARA)
  })

  it.each(['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError', 'TypeError'])(
    '%s (no hay cámara o no se puede usar) pide usar otro dispositivo con cámara', async (nombre) => {
      simularCamara(vi.fn().mockRejectedValue(new DOMException('x', nombre)))
      const error = await abrirCamara().catch((e) => e)
      expect(error).toBeInstanceOf(ErrorCamara)
      expect(error.message).toBe(MENSAJE_SIN_CAMARA)
    })

  it.each(['NotAllowedError', 'SecurityError'])('%s (permiso bloqueado) da el mismo mensaje y además dice cómo activarlo', async (nombre) => {
    simularCamara(vi.fn().mockRejectedValue(new DOMException('x', nombre)))
    const error = await abrirCamara().catch((e) => e)
    expect(error).toBeInstanceOf(ErrorCamara)
    expect(error.message.startsWith(MENSAJE_SIN_CAMARA)).toBe(true)
    expect(error.message).toMatch(/candado/)
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
