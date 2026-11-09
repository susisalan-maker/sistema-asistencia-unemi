import { hoyLocal, TIPOS, type EstadoHoy, type MarcacionResumen } from '../marcacion'
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

/**
 * Una marcación que el servidor aceptó se suma a la copia de hoy. Sin esto, si se pierde la red justo después de marcar,
 * la copia (de antes de marcar) haría ofrecer otra vez la misma marcación. Nunca falla hacia afuera.
 * Si la copia es de otro día no se toca: la siguiente consulta que responda bien la reemplaza.
 */
export async function registrarMarcacionEnCopia(usuarioId: string, marcacion: MarcacionResumen): Promise<void> {
  try {
    const copia = await leerEstadoHoy(usuarioId)
    if (!copia || copia.fecha !== hoyLocal(new Date(marcacion.fecha_hora))) return
    const marcaciones = [...copia.marcaciones.filter((m) => m.id !== marcacion.id), marcacion]
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
    const nueva: EstadoHoy = {
      ...copia,
      marcaciones,
      siguiente: TIPOS[marcaciones.length]?.tipo ?? null,
      ultima: !copia.ultima || marcacion.fecha_hora >= copia.ultima.fecha_hora ? marcacion : copia.ultima,
    }
    await guardarEstadoHoy(usuarioId, nueva)
  } catch (e) {
    console.warn('No se pudo actualizar la copia de la jornada', e)
  }
}
