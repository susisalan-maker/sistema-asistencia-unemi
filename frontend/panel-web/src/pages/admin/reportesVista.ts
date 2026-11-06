import { nombreDeTipo } from './anomaliasTipos'
import type { Columna, ColumnaDoble, FilaBarra } from './GraficasReporte'
import { franjaDe, type AgregadoReporte, type Indicadores } from './reportesDatos'
import { lunesDe } from './reportesPeriodo'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** Un número con coma decimal, como se escribe en Ecuador: 37,8. */
export const coma = (n: number) => String(n).replace('.', ',')

const plural = (n: number) => `${n} ${n === 1 ? 'caso' : 'casos'}`

/** «5 nov» a partir de «2026-11-05». */
const diaMes = (dia: string) => `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`

/** Lo que dice la tarjeta de total frente al periodo anterior: «−8 % frente al periodo anterior (50)». */
export function textoVariacion(ind: Pick<Indicadores, 'anterior' | 'variacionPct'>): string {
  if (ind.anterior === null) return 'Sin datos del periodo anterior'
  if (ind.anterior === 0) return 'Sin casos en el periodo anterior'
  const v = ind.variacionPct ?? 0
  if (v === 0) return `Igual que el periodo anterior (${ind.anterior})`
  return `${v > 0 ? '+' : '−'}${coma(Math.abs(v))} % frente al periodo anterior (${ind.anterior})`
}

/** «+1,2 pts frente al periodo anterior»: lo que cambió un porcentaje, en puntos. */
export function textoPuntos(pts: number | null): string {
  if (pts === null) return 'Sin datos del periodo anterior'
  if (pts === 0) return 'Igual que el periodo anterior'
  return `${pts > 0 ? '+' : '−'}${coma(Math.abs(pts))} pts frente al periodo anterior`
}

export const filasPorTipo = (a: AgregadoReporte): FilaBarra[] =>
  a.por_tipo.map((t) => ({ clave: t.tipo, texto: nombreDeTipo(t.tipo), total: t.total }))

export const filasPorSede = (a: AgregadoReporte): FilaBarra[] =>
  a.por_sede.map((s) => ({ clave: s.sede_id ?? 'sin-sede', texto: s.sede ?? 'Sin sede asignada', total: s.total }))

/** Una columna por cada día del periodo (también los días sin casos, para que se vea dónde hubo y dónde no). */
export function columnasPorDia(a: AgregadoReporte, dias: string[]): { columnas: Columna[]; resumen: string; cadaEtiqueta: number } {
  const total = new Map(a.por_dia.map((d) => [d.dia, d.total]))
  const columnas = dias.map((dia, i) => {
    const n = total.get(dia) ?? 0
    const etiqueta = i === 0 || dia.endsWith('-01') ? diaMes(dia) : String(Number(dia.slice(8, 10)))
    return { clave: dia, etiqueta, total: n, titulo: `${diaMes(dia)}: ${plural(n)}` }
  })
  const pico = columnas.reduce<Columna | null>((m, c) => (c.total > (m?.total ?? 0) ? c : m), null)
  const resumen = pico ? `Casos por día. El máximo fue ${plural(pico.total)} el ${diaMes(pico.clave)}.` : 'Casos por día: ninguno en el periodo.'
  return { columnas, resumen, cadaEtiqueta: Math.max(1, Math.ceil(dias.length / 6)) }
}

/** Una columna por cada hora del día (0 a 23), en hora de Ecuador. */
export function columnasPorHora(a: AgregadoReporte): { columnas: Columna[]; resumen: string; cadaEtiqueta: number } {
  const total = new Map(a.por_hora.map((h) => [h.hora, h.total]))
  const columnas = Array.from({ length: 24 }, (_, h) => {
    const n = total.get(h) ?? 0
    return { clave: String(h), etiqueta: `${h}h`, total: n, titulo: `${franjaDe(h)}: ${plural(n)}` }
  })
  const pico = columnas.reduce<Columna | null>((m, c) => (c.total > (m?.total ?? 0) ? c : m), null)
  const resumen = pico ? `Casos por hora del día. El máximo fue ${plural(pico.total)} entre las ${franjaDe(Number(pico.clave)).replace(' a ', ' y las ')}.` : 'Casos por hora del día: ninguno en el periodo.'
  return { columnas, resumen, cadaEtiqueta: 3 }
}

/** Hasta cuántos días la tendencia va día por día; más largo que eso, se agrupa por semana (de lunes a domingo). */
export const DIAS_TENDENCIA_POR_DIA = 14

const detectadas = (n: number) => `${n} ${n === 1 ? 'detectada' : 'detectadas'}`
const justificadas = (n: number) => `${n} ${n === 1 ? 'justificada' : 'justificadas'}`

/**
 * La tendencia del Dashboard: anomalías detectadas y, de ellas, las que terminaron justificadas. Hasta 14 días va una pareja de
 * columnas por día; en periodos más largos, por semana. La semana de las puntas puede estar incompleta (se cuenta lo que cae en el periodo).
 */
export function tendenciaDelPeriodo(a: AgregadoReporte, dias: string[]): { columnas: ColumnaDoble[]; resumen: string; granularidad: 'dia' | 'semana'; cadaEtiqueta: number } {
  const porDia = new Map(a.por_dia.map((d) => [d.dia, d]))
  const granularidad = dias.length <= DIAS_TENDENCIA_POR_DIA ? 'dia' : 'semana'
  let columnas: ColumnaDoble[]
  if (granularidad === 'dia') {
    columnas = dias.map((dia, i) => {
      const d = porDia.get(dia)
      const det = d?.total ?? 0
      const jus = d?.justificadas ?? 0
      return { clave: dia, etiqueta: i === 0 || dia.endsWith('-01') ? diaMes(dia) : String(Number(dia.slice(8, 10))), detectadas: det, justificadas: jus, titulo: `${diaMes(dia)}: ${detectadas(det)}, ${justificadas(jus)}` }
    })
  } else {
    const semanas = new Map<string, { det: number; jus: number }>()
    for (const dia of dias) {
      const lunes = lunesDe(dia)
      const acumulado = semanas.get(lunes) ?? { det: 0, jus: 0 }
      acumulado.det += porDia.get(dia)?.total ?? 0
      acumulado.jus += porDia.get(dia)?.justificadas ?? 0
      semanas.set(lunes, acumulado)
    }
    columnas = [...semanas].map(([lunes, v]) => ({
      clave: lunes, etiqueta: diaMes(lunes), detectadas: v.det, justificadas: v.jus, titulo: `Semana del ${diaMes(lunes)}: ${detectadas(v.det)}, ${justificadas(v.jus)}`,
    }))
  }
  const totalDet = columnas.reduce((n, c) => n + c.detectadas, 0)
  const totalJus = columnas.reduce((n, c) => n + c.justificadas, 0)
  const pico = columnas.reduce<ColumnaDoble | null>((m, c) => (c.detectadas > (m?.detectadas ?? 0) ? c : m), null)
  const unidad = granularidad === 'dia' ? 'día' : 'semana'
  const resumen = pico
    ? `Tendencia por ${unidad}: ${detectadas(totalDet)} y ${justificadas(totalJus)} en el periodo. El máximo fue ${detectadas(pico.detectadas)}: ${pico.titulo.split(':')[0].toLowerCase()}.`
    : `Tendencia por ${unidad}: ninguna anomalía en el periodo.`
  return { columnas, resumen, granularidad, cadaEtiqueta: Math.max(1, Math.ceil(columnas.length / 6)) }
}
