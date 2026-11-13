import { supabase } from '../../lib/supabase'
import { ejeDe } from './ejeGrafica'

// ---------------------------------------------------------------------------------------------------------------------
// «Ingresos a lo largo del día» y «Última marcación»: los calcula la base (función `ingresos_hoy`, migración 0021).
// Mismo criterio que `estado_hoy`: solo marcaciones, jornadas y feriados; nada de ubicación.
// ---------------------------------------------------------------------------------------------------------------------

export interface PuntoIngresos {
  /** Hora del día (0 a 24) en hora de Ecuador. */
  hora: number
  /** Personas cuya hora de ingreso ya había llegado a esa hora. */
  esperados: number
  /** Personas que ya habían marcado a esa hora; null si esa hora todavía no llega. */
  reales: number | null
}

export interface UltimaMarcacion {
  nombre: string
  sede: string
  tipo: string
  fecha_hora: string
  verificacion: string
  sin_conexion: boolean
}

export interface IngresosHoy {
  hoy: string
  /** La hora de ahora como número (13,08 = 13:05). */
  ahora_hora: number
  esperadas: number
  esperados_ahora: number
  reales_ahora: number
  puntos: PuntoIngresos[]
  ultima: UltimaMarcacion | null
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const texto = (v: unknown): string => (typeof v === 'string' ? v : '')
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

/** Lo que devuelve la base, limpio y con todos los campos (nunca se confía en que llegue completo). */
export function leerIngresosHoy(crudo: unknown): IngresosHoy {
  const r = objeto(crudo)
  const puntos = (Array.isArray(r.puntos) ? r.puntos : [])
    .map((p) => objeto(p))
    .map((p) => ({ hora: num(p.hora), esperados: num(p.esperados), reales: typeof p.reales === 'number' && Number.isFinite(p.reales) ? p.reales : null }))
    .filter((p) => p.hora >= 0 && p.hora <= 24)
    .sort((a, b) => a.hora - b.hora)
  const u = objeto(r.ultima)
  const hayUltima = texto(u.nombre) !== '' && texto(u.fecha_hora) !== ''
  return {
    hoy: texto(r.hoy),
    ahora_hora: num(r.ahora_hora),
    esperadas: num(r.esperadas),
    esperados_ahora: num(r.esperados_ahora),
    reales_ahora: num(r.reales_ahora),
    puntos,
    ultima: hayUltima
      ? { nombre: texto(u.nombre), sede: texto(u.sede), tipo: texto(u.tipo), fecha_hora: texto(u.fecha_hora), verificacion: texto(u.verificacion), sin_conexion: u.sin_conexion === true }
      : null,
  }
}

/** Pide a la base los ingresos de hoy. Lanza un error si falla. */
export async function consultarIngresosHoy(): Promise<IngresosHoy> {
  const { data, error } = await supabase.rpc('ingresos_hoy')
  if (error) throw error
  return leerIngresosHoy(data)
}

// ---------------------------------------------------------------------------------------------------------------------
// La forma de la gráfica
// ---------------------------------------------------------------------------------------------------------------------

export interface FormaIngresos {
  /** Hora donde empieza y termina el eje (enteras). */
  desde: number
  hasta: number
  /** Valor más alto del eje (el total de personas esperadas, redondeado hacia arriba). */
  tope: number
  /** Marcas del eje de la izquierda, de menor a mayor. */
  marcasY: number[]
  /** Marcas del eje de abajo (horas). */
  marcasX: number[]
  esperados: { x: number; y: number }[]
  /** La línea real: los puntos por hora ya pasados y el punto de «ahora». */
  reales: { x: number; y: number }[]
  ahora: { x: number; y: number }
}

/**
 * Las coordenadas (0 a 100) de las dos curvas. El eje de horas va desde una hora antes del primer ingreso esperado hasta una hora
 * después de que llega el último; el de personas, de 0 al total esperado. Devuelve null si no hay a quién esperar.
 */
export function formaIngresos(d: IngresosHoy): FormaIngresos | null {
  if (d.esperadas <= 0 || d.puntos.length === 0) return null
  const primero = d.puntos.find((p) => p.esperados > 0)?.hora ?? 7
  const completo = d.puntos.find((p) => p.esperados >= d.esperadas)?.hora ?? 17
  let desde = Math.max(0, primero - 1)
  let hasta = Math.min(24, Math.max(completo + 1, Math.ceil(d.ahora_hora) + 1))
  if (hasta - desde < 4) hasta = Math.min(24, desde + 4)
  if (hasta - desde < 4) desde = Math.max(0, hasta - 4)

  const { tope, marcas: marcasY } = ejeDe(d.esperadas)
  const X = (h: number) => ((h - desde) / (hasta - desde)) * 100
  const Y = (v: number) => (v / tope) * 100

  const enRango = d.puntos.filter((p) => p.hora >= desde && p.hora <= hasta)
  const esperados = enRango.map((p) => ({ x: X(p.hora), y: Y(p.esperados) }))
  const reales = enRango.filter((p) => p.reales !== null && p.hora <= d.ahora_hora).map((p) => ({ x: X(p.hora), y: Y(p.reales ?? 0) }))
  const ahoraX = Math.min(100, Math.max(0, X(d.ahora_hora)))
  const ahora = { x: ahoraX, y: Y(d.reales_ahora) }
  reales.push(ahora)

  const cadaX = hasta - desde > 8 ? 2 : 1
  const marcasX: number[] = []
  for (let h = desde; h <= hasta; h += cadaX) marcasX.push(h)
  return { desde, hasta, tope, marcasY, marcasX, esperados, reales, ahora }
}

/** «13:05» a partir de la hora como número (13,08). */
export function horaComoTexto(h: number): string {
  const total = Math.round(h * 60)
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
