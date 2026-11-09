import { supabase } from '../../lib/supabase'
import { CLASIFICACIONES, hoyEcuador, inicioDelDia } from './anomaliasConsulta'
import { ESTADOS_POR_RESOLVER } from './anomaliasTipos'

/** Cuántos casos justificó la persona desde ese instante (la justificación tiene siempre lo que concluyó la IA). */
export async function contarJustificadasDesde(desdeIso: string): Promise<number> {
  const r = await supabase.from('justificaciones').select('id', { count: 'exact', head: true })
    .gte('created_at', desdeIso).in('clasificacion_ia', CLASIFICACIONES)
  if (r.error) throw r.error
  return r.count ?? 0
}

export interface JustificadasHoy {
  /** Casos que las personas justificaron hoy. */
  total: number
  /** De ellos, los que todavía esperan la decisión del administrador. */
  porResolver: number
}

/** Lo justificado hoy (día de Ecuador) y cuánto de eso sigue esperando al administrador. */
export async function contarJustificadasHoy(ahora: Date = new Date()): Promise<JustificadasHoy> {
  const desde = inicioDelDia(hoyEcuador(ahora))
  const [todas, pendientes] = await Promise.all([
    contarJustificadasDesde(desde),
    supabase.from('anomalias').select('id, justificaciones!inner(created_at)', { count: 'exact', head: true })
      .in('estado', ESTADOS_POR_RESOLVER).gte('justificaciones.created_at', desde).in('justificaciones.clasificacion_ia', CLASIFICACIONES),
  ])
  if (pendientes.error) throw pendientes.error
  return { total: todas, porResolver: pendientes.count ?? 0 }
}

const clave = (usuarioId: string) => `bandeja-visita:${usuarioId}`

/** La última vez que el administrador estuvo en la bandeja (se guarda en este navegador, por persona). */
export function leerVisita(usuarioId: string): string | null {
  try { return window.localStorage.getItem(clave(usuarioId)) } catch { return null }
}

export function guardarVisita(usuarioId: string, iso: string): void {
  try { window.localStorage.setItem(clave(usuarioId), iso) } catch { /* sin almacenamiento: no hay novedades guardadas */ }
}
