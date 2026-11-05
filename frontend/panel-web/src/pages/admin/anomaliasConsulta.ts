import { supabase } from '../../lib/supabase'
import { ESTADOS_POR_RESOLVER, FILTROS, type FilaAnomalia, type FiltroEstado } from './anomaliasTipos'

/** Cuántos casos caben en una página de la bandeja (12 reparte parejo en 2 y en 3 columnas). */
export const POR_PAGINA = 12

export type Orden = 'prioridad' | 'recientes' | 'antiguas' | 'vencer'
export type FiltroFecha = 'todas' | 'hoy' | '7d' | '30d' | 'rango'

export const FECHAS: { valor: FiltroFecha; texto: string }[] = [
  { valor: 'todas', texto: 'Fecha: todas' },
  { valor: 'hoy', texto: 'Hoy' },
  { valor: '7d', texto: 'Últimos 7 días' },
  { valor: '30d', texto: 'Últimos 30 días' },
  { valor: 'rango', texto: 'Elegir fechas…' },
]

const TEXTO_ORDEN: Record<Orden, string> = {
  prioridad: 'Prioridad (sospechosas y más antiguas)',
  recientes: 'Más recientes primero',
  antiguas: 'Más antiguas primero',
  vencer: 'Por vencer primero',
}

/**
 * Cómo se puede ordenar cada pestaña (la primera opción es la de siempre). «Prioridad» solo tiene sentido donde el
 * administrador decide; «Por vencer» solo donde se espera a la persona (el plazo para justificar sigue corriendo).
 */
export const ORDENES_DE: Record<FiltroEstado, Orden[]> = {
  por_resolver: ['prioridad', 'antiguas', 'recientes'],
  abiertas: ['vencer', 'recientes', 'antiguas'],
  resueltas: ['recientes', 'antiguas'],
  todas: ['recientes', 'antiguas'],
}
export const ordenesDe = (f: FiltroEstado) => ORDENES_DE[f].map((valor) => ({ valor, texto: TEXTO_ORDEN[valor] }))
export const ordenPorDefecto = (f: FiltroEstado): Orden => ORDENES_DE[f][0]

const ZONA = 'America/Guayaquil'
const DESFASE = '-05:00'   // Ecuador no cambia de hora en el año

/** «2026-10-19»: el día de hoy en Ecuador. */
export function hoyEcuador(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

const esDia = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** El instante exacto en que empieza ese día en Ecuador. */
export const inicioDelDia = (dia: string) => new Date(`${dia}T00:00:00${DESFASE}`).toISOString()

/**
 * Los límites de fecha para la consulta: `desde` incluido y `hasta` excluido (el comienzo del día siguiente), en hora de Ecuador.
 * Si las fechas elegidas vienen al revés se acomodan solas.
 */
export function limitesDeFecha(fecha: FiltroFecha, desde: string | null, hasta: string | null, ahora: Date = new Date()): { desde?: string; hasta?: string } {
  const hoy = hoyEcuador(ahora)
  if (fecha === 'hoy') return { desde: inicioDelDia(hoy) }
  if (fecha === '7d') return { desde: inicioDelDia(sumarDias(hoy, -6)) }
  if (fecha === '30d') return { desde: inicioDelDia(sumarDias(hoy, -29)) }
  if (fecha !== 'rango') return {}
  let a = esDia(desde) ? desde : null
  let b = esDia(hasta) ? hasta : null
  if (a && b && a > b) [a, b] = [b, a]
  return { desde: a ? inicioDelDia(a) : undefined, hasta: b ? inicioDelDia(sumarDias(b, 1)) : undefined }
}

/** Quita lo que rompería un filtro `or(...)` de PostgREST (comas, paréntesis, comodines). */
const limpiar = (t: string) => t.replace(/[,()%*\\_:"']/g, ' ').trim()

/** «A-12», «a12» o «12» son un número de caso; si no lo es, devuelve null. */
export function numeroDeCaso(q: string): number | null {
  const m = /^a?-?\s*(\d{1,12})$/i.exec(q.trim())
  return m ? Number(m[1]) : null
}

export interface ParametrosBandeja {
  filtro: FiltroEstado
  tipo: string
  q: string
  fecha: FiltroFecha
  desde: string | null
  hasta: string | null
  orden: Orden
  pagina: number
}

/** Cuántos casos hay en cada pestaña con los demás filtros (tipo, fechas y búsqueda) ya aplicados. */
export type Conteos = Record<FiltroEstado, number>
export interface ResultadoBandeja { filas: FilaAnomalia[]; total: number; conteos: Conteos }

const COLUMNAS = 'id, numero, tipo, estado, detalle, created_at, fecha_vencimiento, usuarios(nombres, apellidos, email), justificaciones(clasificacion_ia)'

interface Busqueda { ids: string[] | null; numero: number | null }

/** La búsqueda por persona se resuelve antes: se buscan sus ids y luego sus casos (o el número de caso escrito). */
async function resolverBusqueda(texto: string): Promise<Busqueda & { sinResultados: boolean }> {
  const q = texto.trim()
  if (!q) return { ids: null, numero: null, sinResultados: false }
  const numero = numeroDeCaso(q)
  let personas = supabase.from('usuarios').select('id')
  for (const t of q.split(/\s+/).map(limpiar).filter(Boolean)) {
    personas = personas.or(`nombres.ilike.%${t}%,apellidos.ilike.%${t}%,email.ilike.%${t}%`)
  }
  const r = await personas.limit(200)
  if (r.error) throw r.error
  const ids = ((r.data ?? []) as { id: string }[]).map((u) => u.id)
  return { ids, numero, sinResultados: ids.length === 0 && numero === null }
}

interface Filtrable<Q> {
  eq(columna: string, valor: string): Q
  gte(columna: string, valor: string): Q
  lt(columna: string, valor: string): Q
  or(filtro: string): Q
}

/** Los filtros que no son de estado (tipo, fechas y búsqueda): los comparten la lista y los conteos de las pestañas. */
function filtrar<Q extends Filtrable<Q>>(c: Q, p: ParametrosBandeja, b: Busqueda): Q {
  if (p.tipo) c = c.eq('tipo', p.tipo)
  const { desde, hasta } = limitesDeFecha(p.fecha, p.desde, p.hasta)
  if (desde) c = c.gte('created_at', desde)
  if (hasta) c = c.lt('created_at', hasta)
  if (b.ids) {
    const partes = []
    if (b.ids.length > 0) partes.push(`usuario_id.in.(${b.ids.join(',')})`)
    if (b.numero !== null) partes.push(`numero.eq.${b.numero}`)
    c = c.or(partes.join(','))
  }
  return c
}

const SIN_CONTEOS: Conteos = { por_resolver: 0, abiertas: 0, resueltas: 0, todas: 0 }

/**
 * Pide al servidor solo la página que se ve: los filtros, el orden y el conteo los hace la base de datos, así que
 * funciona igual con diez casos que con diez mil. Además cuenta cuántos casos habría en cada pestaña con los mismos
 * filtros. Lanza un error si la consulta falla.
 */
export async function consultarBandeja(p: ParametrosBandeja): Promise<ResultadoBandeja> {
  const busqueda = await resolverBusqueda(p.q)
  if (busqueda.sinResultados) return { filas: [], total: 0, conteos: SIN_CONTEOS }

  let c = supabase.from('anomalias').select(COLUMNAS, { count: 'exact' })
  const estados = FILTROS.find((f) => f.valor === p.filtro)?.estados ?? null
  if (estados) c = c.in('estado', estados)
  c = filtrar(c, p, busqueda)

  // Siempre se desempata por número de caso para que una página no repita ni se salte casos.
  if (p.orden === 'prioridad') {
    // Lo que concluyó la IA, de mayor a menor riesgo (sospechosa, requiere revisión, aceptable, sin clasificar), y luego lo más antiguo.
    c = c.order('justificaciones(clasificacion_ia)', { ascending: false, nullsFirst: false }).order('created_at', { ascending: true })
  } else if (p.orden === 'vencer') {
    c = c.order('fecha_vencimiento', { ascending: true })
  } else {
    c = c.order('created_at', { ascending: p.orden === 'antiguas' })
  }
  c = c.order('numero', { ascending: p.orden === 'antiguas' || p.orden === 'prioridad' || p.orden === 'vencer' })

  const desdeFila = (p.pagina - 1) * POR_PAGINA
  // Las otras pestañas se cuentan aparte (solo el número, sin traer filas); la activa ya trae su total.
  const otras = FILTROS.filter((f) => f.valor !== p.filtro).map(async (f) => {
    let q = supabase.from('anomalias').select('id', { count: 'exact', head: true })
    if (f.estados) q = q.in('estado', f.estados)
    const r = await filtrar(q, p, busqueda)
    if (r.error) throw r.error
    return [f.valor, r.count ?? 0] as const
  })
  const [r, ...cuentas] = await Promise.all([c.range(desdeFila, desdeFila + POR_PAGINA - 1), ...otras])
  if (r.error) throw r.error
  const filas = (r.data ?? []) as unknown as FilaAnomalia[]
  const total = r.count ?? filas.length
  return { filas, total, conteos: { ...SIN_CONTEOS, ...Object.fromEntries(cuentas), [p.filtro]: total } }
}

/** Los dos números del encabezado, que no dependen de los filtros: cuántos casos esperan al administrador y cuántos hay en total. */
export async function contarBandeja(): Promise<{ porResolver: number; total: number }> {
  const [a, b] = await Promise.all([
    supabase.from('anomalias').select('id', { count: 'exact', head: true }).in('estado', ESTADOS_POR_RESOLVER),
    supabase.from('anomalias').select('id', { count: 'exact', head: true }),
  ])
  if (a.error) throw a.error
  if (b.error) throw b.error
  return { porResolver: a.count ?? 0, total: b.count ?? 0 }
}
