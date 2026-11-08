import { supabase } from '../../lib/supabase'
import { ESTADOS_POR_RESOLVER, type EstadoAnomalia } from './anomaliasTipos'

/** Cuántos días hacia atrás mira la ficha. */
export const DIAS_FICHA = 90
const MAXIMO_CASOS = 100
const MAXIMO_COINCIDENCIAS = 6

export interface PersonaBuscada { id: string; nombre: string; sede_id: string | null }
export interface CasoFicha { id: string; numero: number; caso: string; tipo: string; estado: EstadoAnomalia; created_at: string }

/** Sin tildes ni mayúsculas, para comparar nombres como los escribe la gente. */
export const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Busca personas por nombre o apellido (todas las palabras tienen que estar). La base filtra por la primera palabra y el resto se
 * filtra aquí; así «marcela ortiz» o «ortiz marcela» encuentran lo mismo. Lanza un error si la consulta falla.
 */
export async function buscarPersonas(texto: string): Promise<PersonaBuscada[]> {
  const palabras = sinTildes(texto).split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return []
  const primera = palabras[0]!.replace(/[,()*%\\]/g, '')
  if (!primera) return []
  const { data, error } = await supabase.from('usuarios').select('id, nombres, apellidos, sede_id').eq('rol', 'usuario')
    .or(`nombres.ilike.%${primera}%,apellidos.ilike.%${primera}%`).order('apellidos').limit(40)
  if (error) throw error
  return ((data ?? []) as { id: string; nombres: string; apellidos: string; sede_id: string | null }[])
    .map((u) => ({ id: u.id, nombre: `${u.nombres} ${u.apellidos}`.trim(), sede_id: u.sede_id }))
    .filter((p) => { const n = sinTildes(p.nombre); return palabras.every((w) => n.includes(w)) })
    .slice(0, MAXIMO_COINCIDENCIAS)
}

/** Los casos de una persona en los últimos 90 días, del más reciente al más antiguo. Lanza un error si la consulta falla. */
export async function casosDePersona(usuarioId: string, ahora = Date.now()): Promise<CasoFicha[]> {
  const desde = new Date(ahora - DIAS_FICHA * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('v_anomalias_detalle').select('id, numero, caso, tipo, estado, created_at')
    .eq('usuario_id', usuarioId).gte('created_at', desde).order('created_at', { ascending: false }).order('numero', { ascending: false }).limit(MAXIMO_CASOS)
  if (error) throw error
  return (data ?? []) as unknown as CasoFicha[]
}

export interface ResumenFicha { total: number; justificados: number; rechazados: number; sinDecidir: number }

/** Cuántos casos tiene, cuántos se justificaron, cuántos se rechazaron y cuántos todavía esperan una decisión. */
export function resumenDeFicha(casos: CasoFicha[]): ResumenFicha {
  return {
    total: casos.length,
    justificados: casos.filter((c) => c.estado === 'justificada').length,
    rechazados: casos.filter((c) => c.estado === 'rechazada').length,
    sinDecidir: casos.filter((c) => c.estado === 'pendiente' || ESTADOS_POR_RESOLVER.includes(c.estado)).length,
  }
}
