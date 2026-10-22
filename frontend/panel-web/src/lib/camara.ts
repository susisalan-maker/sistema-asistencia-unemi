/** Falla con un mensaje listo para mostrar. */
export class ErrorCamara extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorCamara'
  }
}

/** Abre la cámara frontal. Pide permiso al navegador; solo funciona en una conexión segura (https o localhost). */
export async function abrirCamara(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new ErrorCamara('Tu navegador no permite usar la cámara aquí. Hace falta una conexión segura y un navegador actualizado.')
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 1280 } }, audio: false })
  } catch (e) {
    const nombre = e instanceof DOMException ? e.name : ''
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
      throw new ErrorCamara('Bloqueaste la cámara. Permítela desde el candado de la barra del navegador y vuelve a intentarlo.')
    }
    if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') throw new ErrorCamara('No encontramos una cámara en este equipo.')
    if (nombre === 'NotReadableError') throw new ErrorCamara('Otra aplicación está usando la cámara. Ciérrala e inténtalo de nuevo.')
    throw new ErrorCamara('No se pudo abrir la cámara. Inténtalo de nuevo.')
  }
}

export const cerrarCamara = (flujo: MediaStream | null) => flujo?.getTracks().forEach((t) => t.stop())

export interface FotoTomada {
  /** JPEG en base64, sin el prefijo `data:`. Es lo que se envía al servidor. */
  base64: string
  /** Para mostrarla mientras se analiza. */
  url: string
}

const LADO_MAX = 720

/** Toma la imagen que muestra el video, reducida y sin espejo (el espejo es solo de la vista previa). */
export function tomarFoto(video: HTMLVideoElement): FotoTomada {
  const ancho = video.videoWidth
  const alto = video.videoHeight
  if (!ancho || !alto) throw new ErrorCamara('La cámara todavía no está lista. Espera un segundo e inténtalo de nuevo.')
  const escala = Math.min(1, LADO_MAX / Math.max(ancho, alto))
  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(ancho * escala)
  lienzo.height = Math.round(alto * escala)
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new ErrorCamara('No se pudo procesar la imagen de la cámara.')
  ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height)
  const url = lienzo.toDataURL('image/jpeg', 0.7)
  return { base64: url.slice(url.indexOf(',') + 1), url }
}
