import { hoyEcuador, inicioDelDia, sumarDias } from './anomaliasConsulta'

/** Cómo se elige el periodo del reporte: una semana, un mes o un rango de fechas. */
export type Periodo = 'semana' | 'mes' | 'rango'
export const PERIODOS: { valor: Periodo; texto: string }[] = [
  { valor: 'semana', texto: 'Semana' },
  { valor: 'mes', texto: 'Mes' },
  { valor: 'rango', texto: 'Rango personalizado' },
]
export const PERIODO_INICIAL: Periodo = 'mes'

/** Un periodo en días de Ecuador, con los dos extremos incluidos: «2026-10-01» a «2026-10-31». */
export interface Rango { desde: string; hasta: string }

/** Lo más largo que puede ser un reporte: un año (con bisiesto). Más allá, el reporte deja de ser legible y se encarece. */
export const MAXIMO_DIAS = 366

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const esDia = (s: string | null | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s

const partes = (dia: string) => ({ a: Number(dia.slice(0, 4)), m: Number(dia.slice(5, 7)), d: Number(dia.slice(8, 10)) })

/** Cuántos días abarca el rango (los dos extremos cuentan). */
export function diasDelRango(r: Rango): number {
  return Math.round((Date.parse(`${r.hasta}T00:00:00Z`) - Date.parse(`${r.desde}T00:00:00Z`)) / 86_400_000) + 1
}

/** El lunes de la semana que contiene ese día (la semana va de lunes a domingo). */
export function lunesDe(dia: string): string {
  const diaSemana = new Date(`${dia}T00:00:00Z`).getUTCDay()   // 0 = domingo
  return sumarDias(dia, -((diaSemana + 6) % 7))
}

function ultimoDiaDelMes(a: number, m: number): number {
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

const aDia = (a: number, m: number, d: number) => `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/**
 * El periodo elegido como rango de días. `referencia` es cualquier día dentro de la semana o del mes (por omisión, hoy); en
 * «rango» se usan `desde` y `hasta` tal cual (si vienen al revés se acomodan; si faltan, el rango es el mes de la referencia).
 */
export function rangoDe(periodo: Periodo, referencia: string | null, desde: string | null, hasta: string | null, hoy: string = hoyEcuador()): Rango {
  const ref = esDia(referencia) ? referencia : hoy
  if (periodo === 'semana') {
    const lunes = lunesDe(ref)
    return { desde: lunes, hasta: sumarDias(lunes, 6) }
  }
  if (periodo === 'rango' && esDia(desde) && esDia(hasta)) {
    return desde <= hasta ? { desde, hasta } : { desde: hasta, hasta: desde }
  }
  const { a, m } = partes(ref)
  return { desde: aDia(a, m, 1), hasta: aDia(a, m, ultimoDiaDelMes(a, m)) }
}

/** El mismo número de días justo antes del rango: contra él se compara. */
export function periodoAnterior(r: Rango): Rango {
  const n = diasDelRango(r)
  return { desde: sumarDias(r.desde, -n), hasta: sumarDias(r.desde, -1) }
}

/** Un día del periodo anterior (o siguiente) al de la referencia: ±7 días en semana, ±1 mes en mes. */
export function moverReferencia(periodo: Exclude<Periodo, 'rango'>, referencia: string, sentido: 1 | -1): string {
  if (periodo === 'semana') return sumarDias(referencia, 7 * sentido)
  const { a, m } = partes(referencia)
  const nuevo = new Date(Date.UTC(a, m - 1 + sentido, 1))
  return aDia(nuevo.getUTCFullYear(), nuevo.getUTCMonth() + 1, 1)
}

/** Los límites para consultar la base: `desde` incluido y `hasta` excluido (el comienzo del día siguiente), en hora de Ecuador. */
export function limitesDelRango(r: Rango): { desde: string; hasta: string } {
  return { desde: inicioDelDia(r.desde), hasta: inicioDelDia(sumarDias(r.hasta, 1)) }
}

/** «5 nov 2026»; con `sinAnio` solo «5 nov». */
function diaCorto(dia: string, sinAnio = false): string {
  const { a, m, d } = partes(dia)
  return `${d} ${MESES[m - 1]}${sinAnio ? '' : ` ${a}`}`
}

/** «1 – 31 oct 2026», «28 sep – 4 oct 2026», «30 dic 2025 – 5 ene 2026» o «5 nov 2026». */
export function etiquetaDelRango(r: Rango): string {
  if (r.desde === r.hasta) return diaCorto(r.desde)
  const a = partes(r.desde)
  const b = partes(r.hasta)
  if (a.a !== b.a) return `${diaCorto(r.desde)} – ${diaCorto(r.hasta)}`
  if (a.m === b.m) return `${a.d} – ${b.d} ${MESES[b.m - 1]} ${b.a}`
  return `${diaCorto(r.desde, true)} – ${diaCorto(r.hasta)}`
}

/** «octubre de 2026» si el rango es un mes calendario completo; si no, lo mismo que `etiquetaDelRango`. */
export function nombreDelPeriodo(periodo: Periodo, r: Rango): string {
  const a = partes(r.desde)
  const b = partes(r.hasta)
  const mesCompleto = a.d === 1 && a.a === b.a && a.m === b.m && b.d === ultimoDiaDelMes(b.a, b.m)
  if (periodo !== 'semana' && mesCompleto) return `${MESES_LARGOS[a.m - 1]} de ${a.a}`
  return etiquetaDelRango(r)
}

/** Todos los días del rango, en orden. */
export function diasEntre(r: Rango): string[] {
  const dias: string[] = []
  for (let d = r.desde, n = 0; d <= r.hasta && n < MAXIMO_DIAS + 1; d = sumarDias(d, 1), n++) dias.push(d)
  return dias
}
