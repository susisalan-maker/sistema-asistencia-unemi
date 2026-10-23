import type { EstadoHoy } from '../marcacion'
import { obtenerAlmacen } from './almacen'

/**
 * Copia de lo último que el servidor dijo sobre «hoy» (qué marcaciones hay, cuál toca, si este celular está vinculado…).
 * Sirve para poder marcar sin internet. Se guarda por persona. Nunca falla hacia afuera: sin copia, la app se comporta
 * como siempre (pide el estado al servidor).
 */
const clave = (usuarioId: string) => `estado_hoy:${usuarioId}`

export async function guardarEstadoHoy(usuarioId: string, estado: EstadoHoy): Promise<void> {
  try {
    await obtenerAlmacen().guardarCache(clave(usuarioId), JSON.stringify(estado))
  } catch (e) {
    console.warn('No se pudo guardar la copia de la jornada', e)
  }
}

function esEstado(x: unknown): x is EstadoHoy {
  const e = x as Partial<EstadoHoy> | null
  return !!e && typeof e.fecha === 'string' && Array.isArray(e.marcaciones) && typeof e.dispositivo === 'string'
}

export async function leerEstadoHoy(usuarioId: string): Promise<EstadoHoy | null> {
  try {
    const texto = await obtenerAlmacen().leerCache(clave(usuarioId))
    if (!texto) return null
    const valor: unknown = JSON.parse(texto)
    return esEstado(valor) ? valor : null
  } catch {
    return null
  }
}
