import type { Anomalia } from '../anomalias'
import { obtenerAlmacen } from './almacen'

/**
 * Copia de la última lista de avisos que el servidor entregó, para poder verla sin internet (se guarda por persona).
 * Nunca falla hacia afuera: sin copia, la pantalla se comporta como siempre (pide la lista al servidor).
 */
const clave = (usuarioId: string) => `avisos:${usuarioId}`

export async function guardarAnomalias(usuarioId: string, lista: Anomalia[]): Promise<void> {
  try {
    await obtenerAlmacen().guardarCache(clave(usuarioId), JSON.stringify(lista))
  } catch (e) {
    console.warn('No se pudo guardar la copia de los avisos', e)
  }
}

const esAnomalia = (x: unknown): x is Anomalia => {
  const a = x as Partial<Anomalia> | null
  return !!a && typeof a.id === 'string' && typeof a.tipo === 'string' && typeof a.estado === 'string' && typeof a.vence === 'string'
}

export async function leerAnomalias(usuarioId: string): Promise<Anomalia[] | null> {
  try {
    const texto = await obtenerAlmacen().leerCache(clave(usuarioId))
    if (!texto) return null
    const valor: unknown = JSON.parse(texto)
    return Array.isArray(valor) && valor.every(esAnomalia) ? valor : null
  } catch {
    return null
  }
}
