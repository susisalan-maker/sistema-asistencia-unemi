import { supabase } from '../../lib/supabase'
import { caso } from './anomaliasTipos'
import type { EventoBitacora } from './auditoriaTipos'
import { limitesDelRango, type Rango } from './reportesPeriodo'

/** Cuántos cambios caben en una página de la tabla de Auditoría. */
export const POR_PAGINA_AUDITORIA = 20

/** «Realizado por»: vacío = cualquiera; `SISTEMA` = lo hizo el sistema (sin persona); si no, el id de un administrador. */
export const SISTEMA = 'sistema'

export interface FiltrosAuditoria { rango: Rango; evento: '' | EventoBitacora; entidad: string; por: string }

export interface FilaAuditoria {
  id: string
  created_at: string
  evento: EventoBitacora
  entidad: string
  entidad_id: string
  campo: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
  motivo: string | null
  usuario_id: string | null
  autor: { nombres: string; apellidos: string } | null
}

export interface Administrador { id: string; nombres: string; apellidos: string }

const COLUMNAS = 'id, created_at, evento, entidad, entidad_id, campo, valor_anterior, valor_nuevo, motivo, usuario_id, autor:usuarios(nombres, apellidos)'

/** Una página de la bitácora, del cambio más reciente al más antiguo. Lanza un error si la consulta falla. */
export async function consultarBitacora(f: FiltrosAuditoria, pagina: number): Promise<{ filas: FilaAuditoria[]; total: number }> {
  const { desde, hasta } = limitesDelRango(f.rango)
  let c = supabase.from('bitacora').select(COLUMNAS, { count: 'exact' }).gte('created_at', desde).lt('created_at', hasta)
  if (f.evento) c = c.eq('evento', f.evento)
  if (f.entidad) c = c.eq('entidad', f.entidad)
  if (f.por === SISTEMA) c = c.is('usuario_id', null)
  else if (f.por) c = c.eq('usuario_id', f.por)
  const desdeFila = (pagina - 1) * POR_PAGINA_AUDITORIA
  // Se desempata por id para que una página no repita ni se salte cambios que ocurrieron en el mismo instante.
  const { data, error, count } = await c.order('created_at', { ascending: false }).order('id', { ascending: false })
    .range(desdeFila, desdeFila + POR_PAGINA_AUDITORIA - 1)
  if (error) throw error
  const filas = (data ?? []) as unknown as FilaAuditoria[]
  return { filas, total: count ?? filas.length }
}

/** Los administradores, para el filtro «Realizado por». Lanza un error si la consulta falla. */
export async function consultarAdministradores(): Promise<Administrador[]> {
  const { data, error } = await supabase.from('usuarios').select('id, nombres, apellidos').eq('rol', 'administrador').order('nombres')
  if (error) throw error
  return (data ?? []) as Administrador[]
}

type Busqueda = { entidad: string; tabla: string; columnas: string; nombre: (r: Record<string, unknown>) => string | null }
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const BUSQUEDAS: Busqueda[] = [
  { entidad: 'sedes', tabla: 'sedes', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'bloques', tabla: 'bloques', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'feriados', tabla: 'feriados', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'ia_claves', tabla: 'ia_claves', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'usuarios', tabla: 'usuarios', columnas: 'id, nombres, apellidos', nombre: (r) => texto(`${texto(r.nombres) ?? ''} ${texto(r.apellidos) ?? ''}`) },
  { entidad: 'anomalias', tabla: 'v_anomalias_detalle', columnas: 'id, numero', nombre: (r) => (typeof r.numero === 'number' ? `Caso ${caso(r.numero)}` : null) },
]

/**
 * Los nombres de lo que cambió: la bitácora guarda el id del registro, que a nadie le dice nada. Devuelve un mapa
 * «entidad:id» → nombre (y «sedes:id» para la sede que aparece como valor de un cambio). Si una búsqueda falla o el
 * registro ya no se ve, simplemente no está en el mapa y la pantalla muestra el identificador corto: nunca rompe la tabla.
 */
export async function nombresDeRegistros(filas: FilaAuditoria[]): Promise<Map<string, string>> {
  const ids = new Map<string, Set<string>>()
  const pedir = (entidad: string, id: string | null) => {
    if (!id) return
    if (!ids.has(entidad)) ids.set(entidad, new Set())
    ids.get(entidad)!.add(id)
  }
  for (const f of filas) {
    pedir(f.entidad, f.entidad_id)
    if (f.campo === 'sede_id') { pedir('sedes', f.valor_anterior); pedir('sedes', f.valor_nuevo) }
  }

  const nombres = new Map<string, string>()
  await Promise.allSettled(BUSQUEDAS.filter((b) => ids.has(b.entidad)).map(async (b) => {
    const { data, error } = await supabase.from(b.tabla).select(b.columnas).in('id', [...ids.get(b.entidad)!])
    if (error) return
    for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
      const nombre = b.nombre(r)
      if (typeof r.id === 'string' && nombre) nombres.set(`${b.entidad}:${r.id}`, nombre)
    }
  }))
  return nombres
}
