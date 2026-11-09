import type { Anomalia, EstadoAnomalia } from './anomalias'
import { obtenerAlmacen } from './offline/almacen'

/**
 * «Novedades» de Avisos: un caso que pasó a justificada o rechazada y que la persona todavía no vio así.
 * Se guarda en el celular, por persona, qué casos (caso + estado) ya vio. La primera vez no hay nada guardado: lo que
 * ya estaba resuelto se toma como visto, para no llenar de novedades a quien instala la versión nueva.
 */
const clave = (usuarioId: string) => `avisos_vistos:${usuarioId}`
const ESTADOS_DE_RESULTADO: EstadoAnomalia[] = ['justificada', 'rechazada']
const marca = (id: string, estado: string) => `${id}:${estado}`

export const esResultado = (a: Pick<Anomalia, 'estado'>) => ESTADOS_DE_RESULTADO.includes(a.estado)

async function leer(usuarioId: string): Promise<Set<string> | null> {
  try {
    const texto = await obtenerAlmacen().leerCache(clave(usuarioId))
    if (!texto) return null
    const valor: unknown = JSON.parse(texto)
    return Array.isArray(valor) ? new Set(valor.filter((x): x is string => typeof x === 'string')) : null
  } catch {
    return null
  }
}

async function guardar(usuarioId: string, vistos: Set<string>): Promise<void> {
  try {
    await obtenerAlmacen().guardarCache(clave(usuarioId), JSON.stringify([...vistos]))
  } catch (e) {
    console.warn('No se pudo guardar lo que ya viste en Avisos', e)
  }
}

/** Los casos con resultado nuevo (ids). Nunca falla: si no se puede leer lo guardado, no hay novedades. */
export async function novedadesDeAvisos(usuarioId: string, lista: Anomalia[]): Promise<Set<string>> {
  const resultados = lista.filter(esResultado)
  const vistos = await leer(usuarioId)
  if (!vistos) {
    await guardar(usuarioId, new Set(resultados.map((a) => marca(a.id, a.estado))))
    return new Set()
  }
  return new Set(resultados.filter((a) => !vistos.has(marca(a.id, a.estado))).map((a) => a.id))
}

/** La persona ya vio el caso con ese estado (lo abrió o lo vio resolverse en el chat). */
export async function marcarVisto(usuarioId: string, id: string, estado: string): Promise<void> {
  if (!ESTADOS_DE_RESULTADO.includes(estado as EstadoAnomalia)) return
  const vistos = (await leer(usuarioId)) ?? new Set<string>()
  vistos.add(marca(id, estado))
  await guardar(usuarioId, vistos)
}
