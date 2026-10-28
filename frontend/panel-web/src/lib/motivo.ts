import { MOTIVOS, type MotivoContingencia } from './marcacion'

const CLAVE = 'motivo-contingencia'

/** El motivo que la persona eligió en esta sesión del navegador (se pide una vez y se recuerda hasta cerrar la pestaña). */
export function leerMotivo(): MotivoContingencia | '' {
  try {
    const v = window.sessionStorage.getItem(CLAVE)
    return MOTIVOS.some((m) => m.valor === v) ? (v as MotivoContingencia) : ''
  } catch {
    return ''
  }
}

export function guardarMotivo(valor: MotivoContingencia | ''): void {
  try {
    if (valor) window.sessionStorage.setItem(CLAVE, valor)
    else window.sessionStorage.removeItem(CLAVE)
  } catch { /* sin almacenamiento: el motivo vale solo para esta pantalla */ }
}

/** Un UUID para que reintentar la misma marcación no la duplique. `randomUUID` solo existe en conexiones seguras. */
export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
