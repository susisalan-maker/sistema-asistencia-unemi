import { supabase } from '../../lib/supabase'
import { TIPOS_MARCACION, fechaHora } from './anomaliasTipos'

// ---------------------------------------------------------------------------------------------------------------------
// «Hoy en vivo» y «Requiere atención»: los calcula la base (funciones `estado_hoy` y `atencion_hoy`, migración 0016).
// Nada de esto mira la ubicación ni si alguien tiene la app abierta: solo marcaciones, jornadas, feriados y casos.
// ---------------------------------------------------------------------------------------------------------------------

export type EstadoPersona = 'en_jornada' | 'en_almuerzo' | 'salio' | 'por_llegar' | 'sin_ingreso'

/** Los estados, en el orden en que se muestran, con su texto y el color de su marca. */
export const ESTADOS_HOY: { valor: EstadoPersona; texto: string; color: string }[] = [
  { valor: 'en_jornada', texto: 'En jornada', color: 'bg-ok' },
  { valor: 'en_almuerzo', texto: 'En almuerzo', color: 'bg-aviso' },
  { valor: 'salio', texto: 'Ya salieron', color: 'bg-marino-suave' },
  { valor: 'por_llegar', texto: 'Aún no es su hora', color: 'bg-etiqueta' },
  { valor: 'sin_ingreso', texto: 'Sin ingreso', color: 'bg-error' },
]

export interface SedeHoy {
  sede_id: string
  sede: string
  esperadas: number
  presentes: number
  salieron: number
  por_llegar: number
  sin_ingreso: number
}

export interface PersonaSinIngreso {
  usuario_id: string
  nombre: string
  sede: string | null
  /** «08:00» */
  jornada_inicio: string
  minutos_retraso: number
  /** Lo último que marcó en cualquier día (puede ser de otro día); null si nunca marcó. */
  ultima: { tipo: string; fecha_hora: string } | null
}

export interface EstadoHoy {
  ahora: string
  /** El día de hoy en hora de Ecuador, «2026-11-05». */
  hoy: string
  /** Nombre del feriado de hoy, si lo es. */
  feriado: string | null
  esperadas: number
  por_estado: Record<EstadoPersona, number>
  por_sede: SedeHoy[]
  faltan: PersonaSinIngreso[]
}

export interface Atencion {
  plazo_revision_h: number
  revision: { total: number; vencidos: number; por_vencer: number; /** Números de caso («A-12») que vencen en menos de 6 h (hasta 5). */ por_vencer_casos: string[] }
  sin_justificar: number
  sospechosas: number
  rostro: { usuario_id: string; nombre: string; intentos: number }[]
  sin_celular: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const texto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [])

/** Lo que devuelve la base, limpio y con todos los campos (nunca se confía en que llegue completo). */
export function leerEstadoHoy(crudo: unknown): EstadoHoy {
  const r = objeto(crudo)
  const e = objeto(r.por_estado)
  return {
    ahora: texto(r.ahora) ?? new Date().toISOString(),
    hoy: texto(r.hoy) ?? '',
    feriado: texto(r.feriado),
    esperadas: num(r.esperadas),
    por_estado: { en_jornada: num(e.en_jornada), en_almuerzo: num(e.en_almuerzo), salio: num(e.salio), por_llegar: num(e.por_llegar), sin_ingreso: num(e.sin_ingreso) },
    por_sede: lista(r.por_sede).map((x) => ({
      sede_id: String(x.sede_id ?? ''), sede: texto(x.sede) ?? 'Sin sede', esperadas: num(x.esperadas), presentes: num(x.presentes),
      salieron: num(x.salieron), por_llegar: num(x.por_llegar), sin_ingreso: num(x.sin_ingreso),
    })),
    faltan: lista(r.faltan).map((x) => {
      const u = objeto(x.ultima)
      return {
        usuario_id: String(x.usuario_id ?? ''), nombre: texto(x.nombre) ?? 'Persona sin nombre', sede: texto(x.sede),
        jornada_inicio: texto(x.jornada_inicio) ?? '', minutos_retraso: num(x.minutos_retraso),
        ultima: texto(u.tipo) && texto(u.fecha_hora) ? { tipo: String(u.tipo), fecha_hora: String(u.fecha_hora) } : null,
      }
    }),
  }
}

export function leerAtencion(crudo: unknown): Atencion {
  const r = objeto(crudo)
  const rev = objeto(r.revision)
  return {
    plazo_revision_h: num(r.plazo_revision_h) || 48,
    revision: {
      total: num(rev.total), vencidos: num(rev.vencidos), por_vencer: num(rev.por_vencer),
      por_vencer_casos: Array.isArray(rev.por_vencer_casos) ? rev.por_vencer_casos.filter((c): c is string => typeof c === 'string') : [],
    },
    sin_justificar: num(r.sin_justificar),
    sospechosas: num(r.sospechosas),
    rostro: lista(r.rostro).map((x) => ({ usuario_id: String(x.usuario_id ?? ''), nombre: texto(x.nombre) ?? 'Persona sin nombre', intentos: num(x.intentos) })),
    sin_celular: num(r.sin_celular),
  }
}

/** Pide a la base cómo está hoy cada persona. Lanza un error si falla. */
export async function consultarEstadoHoy(): Promise<EstadoHoy> {
  const { data, error } = await supabase.rpc('estado_hoy')
  if (error) throw error
  return leerEstadoHoy(data)
}

/** Pide a la base lo que necesita al administrador. Lanza un error si falla. */
export async function consultarAtencion(): Promise<Atencion> {
  const { data, error } = await supabase.rpc('atencion_hoy')
  if (error) throw error
  return leerAtencion(data)
}

// ---------------------------------------------------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------------------------------------------------

const ZONA = 'America/Guayaquil'

/** «08:05», en hora de Ecuador. */
export function horaEcuador(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso))
  return `${partes.find((p) => p.type === 'hour')?.value ?? ''}:${partes.find((p) => p.type === 'minute')?.value ?? ''}`
}

/** El día de un instante en hora de Ecuador, «2026-11-05». */
export function diaEcuador(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')}`
}

const diaAnterior = (dia: string): string => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** «Ayer 17:02 · Salida»: lo último que marcó una persona, con el día en palabras si es de hoy o de ayer. */
export function textoUltimaMarcacion(u: PersonaSinIngreso['ultima'], hoy: string): string {
  if (!u) return 'Nunca ha marcado'
  const dia = diaEcuador(u.fecha_hora)
  const cuando = dia === hoy ? `Hoy ${horaEcuador(u.fecha_hora)}` : dia === diaAnterior(hoy) ? `Ayer ${horaEcuador(u.fecha_hora)}` : fechaHora(u.fecha_hora)
  return `${cuando} · ${TIPOS_MARCACION[u.tipo] ?? u.tipo}`
}

/** «25 min», «1 h 30 min», «2 h». */
export function textoRetraso(min: number): string {
  const m = Math.max(0, Math.floor(min))
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto === 0 ? `${h} h` : `${h} h ${resto} min`
}

/** Más de dos horas sin ingresar se marca en rojo; menos, en ámbar. */
export const RETRASO_GRAVE_MIN = 120

/** «hace 8 s», «hace 2 min»: cuánto pasó desde que se actualizó la pantalla. */
export function textoHace(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `hace ${s} s`
  return `hace ${Math.floor(s / 60)} min`
}
