import { obtenerAlmacen } from './almacen'
import { arranqueMs } from './relojMonotonico'
import type { RelojDeMarcacion } from './tipos'

/**
 * El «ancla» de la hora: la última hora que el servidor entregó firmada (en `GET /marcaciones/hoy`) y cuánto llevaba
 * encendido el celular cuando la recibió. Con eso, al marcar sin conexión, la app puede probarle al servidor que el
 * reloj del celular no estaba atrasado (backend `app/reloj.py`). Se guarda por persona y nunca falla hacia afuera:
 * sin ancla, la marcación se envía igual, solo con la hora del celular.
 */
interface Ancla { servidor_t: string; firma: string; arranque_ms: number }

const clave = (usuarioId: string) => `ancla_reloj:${usuarioId}`

/** Guarda la hora firmada que acaba de llegar. Se llama cada vez que se consulta el servidor con éxito. */
export async function guardarAncla(usuarioId: string, hora: { t: string; firma: string } | undefined): Promise<void> {
  if (!hora?.t || !hora.firma) return
  try {
    const arranque = await arranqueMs()
    if (arranque === null) return
    const ancla: Ancla = { servidor_t: hora.t, firma: hora.firma, arranque_ms: arranque }
    await obtenerAlmacen().guardarCache(clave(usuarioId), JSON.stringify(ancla))
  } catch (e) {
    console.warn('No se pudo guardar la hora del servidor', e)
  }
}

function esAncla(x: unknown): x is Ancla {
  const a = x as Partial<Ancla> | null
  return !!a && typeof a.servidor_t === 'string' && typeof a.firma === 'string' && typeof a.arranque_ms === 'number'
}

/**
 * La prueba que acompaña a una marcación hecha ahora, o null si no se puede armar: no hay ancla, no se puede leer el
 * contador, o el celular se reinició desde que se guardó (el contador volvió a cero y ya no sirve de comparación).
 */
export async function relojDeMarca(usuarioId: string): Promise<RelojDeMarcacion | null> {
  try {
    const texto = await obtenerAlmacen().leerCache(clave(usuarioId))
    if (!texto) return null
    const ancla: unknown = JSON.parse(texto)
    if (!esAncla(ancla)) return null
    const ahora = await arranqueMs()
    if (ahora === null || ahora < ancla.arranque_ms) return null
    return { servidor_t: ancla.servidor_t, firma: ancla.firma, arranque_ancla_ms: ancla.arranque_ms, arranque_marca_ms: ahora }
  } catch {
    return null
  }
}
