import { supabase } from '../../lib/supabase'
import { ESTADOS, nombreDeTipo, type ClasificacionIA, type EstadoAnomalia } from './anomaliasTipos'
import { limitesDelRango, type Rango } from './reportesPeriodo'

// ---------------------------------------------------------------------------------------------------------------------
// Los números del periodo: los cuenta la base (función `reporte_anomalias`, migración 0014), no el navegador.
// ---------------------------------------------------------------------------------------------------------------------

export interface AgregadoReporte {
  total: number
  /** Marcaciones registradas en el mismo periodo (y sede). */
  marcaciones: number
  por_estado: Partial<Record<EstadoAnomalia, number>>
  por_tipo: { tipo: string; total: number }[]
  por_sede: { sede_id: string | null; sede: string | null; total: number }[]
  /** `justificadas`: de los casos de ese día, los que terminaron justificados. */
  por_dia: { dia: string; total: number; justificadas: number }[]
  por_hora: { hora: number; total: number }[]
  por_clasificacion: Partial<Record<ClasificacionIA, number>>
  /** Marcaciones de ingreso y de salida del periodo, y cuántas tienen una falta de horario (de ahí sale la puntualidad). */
  jornada: { marcaciones: number; con_falta: number }
  /** Casos cuyo plazo ya terminó o que ya tienen justificación: sobre ellos se mide «a tiempo». */
  evaluadas: number
  /** De esos, los que la persona justificó antes de vencer su plazo. */
  a_tiempo: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])
const mapa = (v: unknown): Record<string, number> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([k, n]) => [k, num(n)])) : {}

/** Lo que devuelve la base, limpio y con todos los campos (nunca se confía en que llegue completo). */
export function leerAgregado(crudo: unknown): AgregadoReporte {
  const r = (crudo && typeof crudo === 'object' ? crudo : {}) as Record<string, unknown>
  return {
    total: num(r.total),
    marcaciones: num(r.marcaciones),
    por_estado: mapa(r.por_estado) as AgregadoReporte['por_estado'],
    por_tipo: lista(r.por_tipo).map((x) => ({ tipo: String(x.tipo ?? ''), total: num(x.total) })),
    por_sede: lista(r.por_sede).map((x) => ({ sede_id: typeof x.sede_id === 'string' ? x.sede_id : null, sede: typeof x.sede === 'string' ? x.sede : null, total: num(x.total) })),
    por_dia: lista(r.por_dia).map((x) => ({ dia: String(x.dia ?? ''), total: num(x.total), justificadas: num(x.justificadas) })),
    por_hora: lista(r.por_hora).map((x) => ({ hora: num(x.hora), total: num(x.total) })),
    por_clasificacion: mapa(r.por_clasificacion) as AgregadoReporte['por_clasificacion'],
    jornada: { marcaciones: num((r.jornada as Record<string, unknown> | undefined)?.marcaciones), con_falta: num((r.jornada as Record<string, unknown> | undefined)?.con_falta) },
    evaluadas: num(r.evaluadas),
    a_tiempo: num(r.a_tiempo),
  }
}

/** Pide a la base los números del periodo. `sedeId` vacío = todas las sedes. Lanza un error si la consulta falla. */
export async function consultarAgregado(rango: Rango, sedeId: string): Promise<AgregadoReporte> {
  const { desde, hasta } = limitesDelRango(rango)
  const { data, error } = await supabase.rpc('reporte_anomalias', { p_desde: desde, p_hasta: hasta, p_sede: sedeId || null })
  if (error) throw error
  return leerAgregado(data)
}

// ---------------------------------------------------------------------------------------------------------------------
// Indicadores que se calculan sobre esos números
// ---------------------------------------------------------------------------------------------------------------------

const redondear = (n: number, decimales = 1) => Math.round(n * 10 ** decimales) / 10 ** decimales

/** Cuánto subió o bajó, en %, contra el periodo anterior. Sin periodo anterior con casos no se puede decir: null. */
export function variacion(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior <= 0) return null
  return redondear(((actual - anterior) / anterior) * 100)
}

/** `parte` de cada 100 de `total` (con un decimal); null si no hay total. */
export function porCada100(parte: number, total: number): number | null {
  return total > 0 ? redondear((parte / total) * 100) : null
}

export interface Indicadores {
  total: number
  anterior: number | null
  variacionPct: number | null
  marcaciones: number
  /** Anomalías por cada 100 marcaciones. */
  porCada100Marcaciones: number | null
  /** % de los casos evaluados que la persona justificó a tiempo. */
  aTiempoPct: number | null
  evaluadas: number
  aTiempo: number
  /** % de ingresos y salidas sin falta de horario; null si no hubo marcaciones. */
  puntualidadPct: number | null
  /** Cuántos puntos subió o bajó la puntualidad frente al periodo anterior (null si falta alguno de los dos). */
  puntualidadPts: number | null
  jornadaMarcaciones: number
  jornadaConFalta: number
  /** Casos que esperan al administrador: en revisión o sin justificar. */
  porResolver: number
  tipoTop: { tipo: string; total: number } | null
  sedeTop: { sede: string; total: number } | null
  horaPico: { hora: number; total: number } | null
  diaPico: { dia: string; total: number } | null
}

const mayor = <T extends { total: number }>(xs: T[]): T | null => xs.reduce<T | null>((m, x) => (x.total > (m?.total ?? 0) ? x : m), null)

/** % de marcaciones de ingreso y de salida sin falta de horario. */
export function puntualidadDe(a: AgregadoReporte): number | null {
  return porCada100(a.jornada.marcaciones - a.jornada.con_falta, a.jornada.marcaciones)
}

export function calcularIndicadores(a: AgregadoReporte, anterior: AgregadoReporte | null): Indicadores {
  const sede = mayor(a.por_sede.filter((s) => s.sede))
  const puntualidad = puntualidadDe(a)
  const puntualidadAntes = anterior ? puntualidadDe(anterior) : null
  return {
    total: a.total,
    anterior: anterior ? anterior.total : null,
    variacionPct: variacion(a.total, anterior ? anterior.total : null),
    marcaciones: a.marcaciones,
    porCada100Marcaciones: porCada100(a.total, a.marcaciones),
    aTiempoPct: porCada100(a.a_tiempo, a.evaluadas),
    evaluadas: a.evaluadas,
    aTiempo: a.a_tiempo,
    puntualidadPct: puntualidad,
    puntualidadPts: puntualidad !== null && puntualidadAntes !== null ? redondear(puntualidad - puntualidadAntes) : null,
    jornadaMarcaciones: a.jornada.marcaciones,
    jornadaConFalta: a.jornada.con_falta,
    porResolver: (a.por_estado.en_revision ?? 0) + (a.por_estado.sin_justificar ?? 0),
    tipoTop: mayor(a.por_tipo),
    sedeTop: sede ? { sede: sede.sede as string, total: sede.total } : null,
    horaPico: mayor(a.por_hora),
    diaPico: mayor(a.por_dia),
  }
}

/** «09:00 a 09:59» */
export const franjaDe = (hora: number) => `${String(hora).padStart(2, '0')}:00 a ${String(hora).padStart(2, '0')}:59`

// ---------------------------------------------------------------------------------------------------------------------
// Tabla histórica: todos los estados del periodo, página a página (la base filtra, ordena y cuenta).
// ---------------------------------------------------------------------------------------------------------------------

export const POR_PAGINA_REPORTE = 15
const TAMANO_LOTE = 1000   // lo máximo que devuelve una petición
/** Cuántos casos se traen como máximo para exportar. Más allá, el archivo avisa que está recortado. */
export const TOPE_EXPORTACION = 5000

export interface FiltrosHistorico { rango: Rango; sedeId: string; estado: '' | EstadoAnomalia; tipo: string }

export interface FilaHistorico {
  id: string
  numero: number
  caso: string
  tipo: string
  estado: EstadoAnomalia
  created_at: string
  colaborador: string | null
  sede: string | null
  clasificacion_ia: ClasificacionIA | null
  decision_final: 'aprobada' | 'rechazada' | 'escalada' | null
  revisado_por_nombre: string | null
  fecha_decision: string | null
}

const COLUMNAS_HISTORICO = 'id, numero, caso, tipo, estado, created_at, colaborador, sede, clasificacion_ia, decision_final, revisado_por_nombre, fecha_decision'

function consultaHistorico(f: FiltrosHistorico) {
  const { desde, hasta } = limitesDelRango(f.rango)
  let c = supabase.from('v_anomalias_detalle').select(COLUMNAS_HISTORICO, { count: 'exact' }).gte('created_at', desde).lt('created_at', hasta)
  if (f.sedeId) c = c.eq('sede_id', f.sedeId)
  if (f.estado) c = c.eq('estado', f.estado)
  if (f.tipo) c = c.eq('tipo', f.tipo)
  // Siempre se desempata por número de caso para que una página no repita ni se salte casos.
  return c.order('created_at', { ascending: false }).order('numero', { ascending: false })
}

/** Una página de la tabla histórica. Lanza un error si la consulta falla. */
export async function consultarHistorico(f: FiltrosHistorico, pagina: number): Promise<{ filas: FilaHistorico[]; total: number }> {
  const desdeFila = (pagina - 1) * POR_PAGINA_REPORTE
  const { data, error, count } = await consultaHistorico(f).range(desdeFila, desdeFila + POR_PAGINA_REPORTE - 1)
  if (error) throw error
  const filas = (data ?? []) as unknown as FilaHistorico[]
  return { filas, total: count ?? filas.length }
}

/** Todos los casos del periodo (de a mil por petición), hasta el tope. Es lo que se exporta. */
export async function traerTodoElHistorico(f: FiltrosHistorico, tope = TOPE_EXPORTACION): Promise<{ filas: FilaHistorico[]; total: number; recortado: boolean }> {
  const filas: FilaHistorico[] = []
  let total = 0
  for (let desdeFila = 0; desdeFila < tope; desdeFila += TAMANO_LOTE) {
    const hastaFila = Math.min(desdeFila + TAMANO_LOTE, tope) - 1
    const { data, error, count } = await consultaHistorico(f).range(desdeFila, hastaFila)
    if (error) throw error
    const lote = (data ?? []) as unknown as FilaHistorico[]
    total = count ?? total
    filas.push(...lote)
    if (lote.length < hastaFila - desdeFila + 1 || filas.length >= total) break
  }
  return { filas, total: Math.max(total, filas.length), recortado: filas.length < total }
}

// ---------------------------------------------------------------------------------------------------------------------
// Dashboard: los casos que esperan al administrador (en revisión o sin justificar) dentro del periodo y la sede.
// ---------------------------------------------------------------------------------------------------------------------

export const PENDIENTES_EN_DASHBOARD = 6

export type FilaPendiente = Pick<FilaHistorico, 'id' | 'numero' | 'caso' | 'tipo' | 'estado' | 'created_at' | 'colaborador' | 'sede'>

/** Los casos más recientes que esperan al administrador y cuántos son en total. Lanza un error si la consulta falla. */
export async function consultarPendientes(rango: Rango, sedeId: string, limite = PENDIENTES_EN_DASHBOARD): Promise<{ filas: FilaPendiente[]; total: number }> {
  const { desde, hasta } = limitesDelRango(rango)
  let c = supabase.from('v_anomalias_detalle').select('id, numero, caso, tipo, estado, created_at, colaborador, sede', { count: 'exact' })
    .gte('created_at', desde).lt('created_at', hasta).in('estado', ['en_revision', 'sin_justificar'])
  if (sedeId) c = c.eq('sede_id', sedeId)
  const { data, error, count } = await c.order('created_at', { ascending: false }).order('numero', { ascending: false }).range(0, limite - 1)
  if (error) throw error
  const filas = (data ?? []) as unknown as FilaPendiente[]
  return { filas, total: count ?? filas.length }
}

/** Cómo terminó el caso, en una frase corta: «Aprobada · Ana Pérez», «Aprobada automáticamente», «Esperando a la persona». */
export function resolucionDe(f: Pick<FilaHistorico, 'estado' | 'decision_final' | 'revisado_por_nombre'>): string {
  if (f.decision_final === 'aprobada') return f.revisado_por_nombre ? `Aprobada · ${f.revisado_por_nombre}` : 'Aprobada automáticamente'
  if (f.decision_final === 'rechazada') return f.revisado_por_nombre ? `Rechazada · ${f.revisado_por_nombre}` : 'Rechazada'
  if (f.estado === 'pendiente') return 'Esperando a la persona'
  if (f.estado === 'sin_justificar') return 'Plazo vencido sin justificar'
  if (f.estado === 'en_revision') return 'Pendiente de revisión'
  return ESTADOS[f.estado].texto
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que se le manda a la IA para redactar el resumen: solo números ya agregados y nombres de tipo y de sede. Nunca
// personas, correos ni textos de las justificaciones.
// ---------------------------------------------------------------------------------------------------------------------

export interface DatosResumen {
  periodo: string
  sede: string | null
  total: number
  total_anterior: number | null
  variacion_pct: number | null
  marcaciones: number
  por_cada_100_marcaciones: number | null
  a_tiempo_pct: number | null
  casos_evaluados: number
  por_estado: { nombre: string; total: number }[]
  por_tipo: { nombre: string; total: number }[]
  por_sede: { nombre: string; total: number }[]
  clasificacion_ia: { nombre: string; total: number }[]
  hora_pico: { nombre: string; total: number } | null
  dia_pico: { nombre: string; total: number } | null
}

const CLASIFICACION_TEXTO: Record<ClasificacionIA, string> = { aceptable: 'aceptable', requiere_revision: 'requiere revisión', sospechosa: 'sospechosa' }

export function datosParaIA(periodo: string, sedeNombre: string | null, a: AgregadoReporte, ind: Indicadores): DatosResumen {
  return {
    periodo,
    sede: sedeNombre,
    total: a.total,
    total_anterior: ind.anterior,
    variacion_pct: ind.variacionPct,
    marcaciones: a.marcaciones,
    por_cada_100_marcaciones: ind.porCada100Marcaciones,
    a_tiempo_pct: ind.aTiempoPct,
    casos_evaluados: ind.evaluadas,
    por_estado: (Object.keys(ESTADOS) as EstadoAnomalia[]).filter((e) => (a.por_estado[e] ?? 0) > 0).map((e) => ({ nombre: ESTADOS[e].texto, total: a.por_estado[e] as number })),
    por_tipo: a.por_tipo.slice(0, 10).map((t) => ({ nombre: nombreDeTipo(t.tipo), total: t.total })),
    por_sede: a.por_sede.filter((s) => s.sede).slice(0, 10).map((s) => ({ nombre: s.sede as string, total: s.total })),
    clasificacion_ia: (Object.keys(CLASIFICACION_TEXTO) as ClasificacionIA[]).filter((c) => (a.por_clasificacion[c] ?? 0) > 0).map((c) => ({ nombre: CLASIFICACION_TEXTO[c], total: a.por_clasificacion[c] as number })),
    hora_pico: ind.horaPico ? { nombre: franjaDe(ind.horaPico.hora), total: ind.horaPico.total } : null,
    dia_pico: ind.diaPico ? { nombre: ind.diaPico.dia, total: ind.diaPico.total } : null,
  }
}
