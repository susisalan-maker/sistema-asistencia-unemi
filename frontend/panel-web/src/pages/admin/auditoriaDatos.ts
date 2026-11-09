import { supabase } from '../../lib/supabase'
import type { EventoBitacora } from './auditoriaTipos'
import { limitesDelRango, type Rango } from './reportesPeriodo'

/** Cuántas acciones caben en una página de la lista de Auditoría. */
export const POR_PAGINA_AUDITORIA = 20
/** Lo máximo que cabe en un Excel de la bitácora. */
export const MAXIMO_EXPORTAR = 5000

/** «Realizado por»: vacío = cualquiera; `SISTEMA` = lo hizo el sistema (sin persona); si no, el id de un administrador. */
export const SISTEMA = 'sistema'

/** Los atajos de un toque: cada acción cae en uno solo. */
export type Grupo = 'configuracion' | 'personas_sedes' | 'rostros_celulares' | 'decisiones' | 'exportaciones' | 'sistema'
export const GRUPOS: { id: Grupo; texto: string }[] = [
  { id: 'configuracion', texto: 'Configuración' },
  { id: 'personas_sedes', texto: 'Personas y sedes' },
  { id: 'rostros_celulares', texto: 'Rostros y celulares' },
  { id: 'decisiones', texto: 'Decisiones de casos' },
  { id: 'exportaciones', texto: 'Exportaciones' },
  { id: 'sistema', texto: 'Hechos por el sistema' },
]
export const esGrupo = (v: string | null | undefined): v is Grupo => GRUPOS.some((g) => g.id === v)

export interface FiltrosAuditoria { rango: Rango; evento: '' | EventoBitacora; por: string; grupo: '' | Grupo; buscar: string }

/** Un dato cambiado dentro de una acción (la bitácora guarda uno por fila). */
export interface CambioAuditoria {
  id: string
  evento: EventoBitacora
  campo: string | null
  valor_anterior: string | null
  valor_nuevo: string | null
  motivo: string | null
}

/** Una acción: todo lo que una persona cambió de un mismo registro en un mismo instante. */
export interface AccionAuditoria {
  id: string
  created_at: string
  usuario_id: string | null
  autor: { nombres: string; apellidos: string } | null
  entidad: string
  entidad_id: string
  evento: EventoBitacora
  grupo: Grupo | 'otros'
  motivo: string | null
  datos: number
  cambios: CambioAuditoria[]
}

export interface PaginaAuditoria {
  total: number
  datos: number
  /** Las filas que tendría un Excel con una fila por dato cambiado. */
  filas: number
  /** Cuántas acciones tiene cada atajo (con la búsqueda y los filtros puestos, pero sin el atajo). */
  conteos: Record<'todo' | Grupo, number>
  acciones: AccionAuditoria[]
}

export interface Administrador { id: string; nombres: string; apellidos: string }

/** Una página de acciones, de la más reciente a la más antigua. La base agrupa, busca y cuenta. Lanza un error si falla. */
export async function consultarAcciones(f: FiltrosAuditoria, pagina: number, limite = POR_PAGINA_AUDITORIA): Promise<PaginaAuditoria> {
  const { desde, hasta } = limitesDelRango(f.rango)
  const { data, error } = await supabase.rpc('auditoria_acciones', {
    p_desde: desde, p_hasta: hasta, p_evento: f.evento || null, p_entidad: null, p_por: f.por || null, p_grupo: f.grupo || null,
    p_buscar: f.buscar.trim() || null, p_limite: limite, p_desplazamiento: (pagina - 1) * limite,
  })
  if (error) throw error
  const r = data as Partial<PaginaAuditoria> | null
  if (!r || !Array.isArray(r.acciones)) throw new Error('Respuesta inesperada de la bitácora')
  return {
    total: Number(r.total ?? 0), datos: Number(r.datos ?? 0), filas: Number(r.filas ?? 0),
    conteos: { todo: 0, configuracion: 0, personas_sedes: 0, rostros_celulares: 0, decisiones: 0, exportaciones: 0, sistema: 0, ...r.conteos },
    acciones: r.acciones,
  }
}

/** Deja constancia en Auditoría de quién descargó la bitácora. Lanza un error si no se pudo anotar. */
export async function registrarExportacionAuditoria(rango: Rango, filas: number, detalle: string): Promise<void> {
  const { desde, hasta } = limitesDelRango(rango)
  const { error } = await supabase.rpc('registrar_exportacion_auditoria', { p_desde: desde, p_hasta: hasta, p_filas: filas, p_detalle: detalle })
  if (error) throw error
}

/** Los administradores, para el filtro «Realizado por». Lanza un error si la consulta falla. */
export async function consultarAdministradores(): Promise<Administrador[]> {
  const { data, error } = await supabase.from('usuarios').select('id, nombres, apellidos').eq('rol', 'administrador').order('nombres')
  if (error) throw error
  return (data ?? []) as Administrador[]
}

type Busqueda = {
  entidad: string
  tabla: string
  columnas: string
  nombre: (r: Record<string, unknown>) => string | null
  /** Otros datos del registro que las frases usan por separado: «anomalias_persona:id» → «Carlos Ruiz». */
  extras?: (r: Record<string, unknown>) => [string, string][]
}
const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
const BUSQUEDAS: Busqueda[] = [
  { entidad: 'sedes', tabla: 'sedes', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'bloques', tabla: 'bloques', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'feriados', tabla: 'feriados', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'ia_claves', tabla: 'ia_claves', columnas: 'id, nombre', nombre: (r) => texto(r.nombre) },
  { entidad: 'usuarios', tabla: 'usuarios', columnas: 'id, nombres, apellidos', nombre: (r) => texto(`${texto(r.nombres) ?? ''} ${texto(r.apellidos) ?? ''}`) },
  {
    entidad: 'anomalias', tabla: 'v_anomalias_detalle', columnas: 'id, numero, colaborador',
    nombre: (r) => {
      if (typeof r.numero !== 'number') return null
      const persona = texto(r.colaborador)
      return `Caso A-${r.numero}${persona ? ` de ${persona}` : ''}`
    },
    extras: (r) => {
      const salida: [string, string][] = []
      if (typeof r.numero === 'number') salida.push(['anomalias_caso', `A-${r.numero}`])
      const persona = texto(r.colaborador)
      if (persona) salida.push(['anomalias_persona', persona])
      return salida
    },
  },
]
const TANDA = 100

/**
 * Los nombres de lo que cambió: la bitácora guarda el id del registro, que a nadie le dice nada. Devuelve un mapa
 * «entidad:id» → nombre (y «sedes:id» para la sede que aparece como valor de un cambio). Si una búsqueda falla o el
 * registro ya no se ve, simplemente no está en el mapa y la pantalla muestra el identificador corto: nunca rompe la lista.
 */
export async function nombresDeRegistros(acciones: AccionAuditoria[]): Promise<Map<string, string>> {
  const ids = new Map<string, Set<string>>()
  const pedir = (entidad: string, id: string | null) => {
    if (!id) return
    if (!ids.has(entidad)) ids.set(entidad, new Set())
    ids.get(entidad)!.add(id)
  }
  for (const a of acciones) {
    pedir(a.entidad, a.entidad_id)
    for (const c of a.cambios) if (c.campo === 'sede_id') { pedir('sedes', c.valor_anterior); pedir('sedes', c.valor_nuevo) }
  }

  const nombres = new Map<string, string>()
  const trabajos: Promise<void>[] = []
  for (const b of BUSQUEDAS.filter((x) => ids.has(x.entidad))) {
    const todos = [...ids.get(b.entidad)!]
    // De a tandas: con miles de ids la dirección de la consulta sería demasiado larga.
    for (let i = 0; i < todos.length; i += TANDA) {
      trabajos.push((async () => {
        const { data, error } = await supabase.from(b.tabla).select(b.columnas).in('id', todos.slice(i, i + TANDA))
        if (error) return
        for (const r of (data ?? []) as unknown as Record<string, unknown>[]) {
          const nombre = b.nombre(r)
          if (typeof r.id !== 'string') continue
          if (nombre) nombres.set(`${b.entidad}:${r.id}`, nombre)
          for (const [clave, valor] of b.extras?.(r) ?? []) nombres.set(`${clave}:${r.id}`, valor)
        }
      })())
    }
  }
  await Promise.allSettled(trabajos)
  return nombres
}
