import { nombreDeTipo } from './anomaliasTipos'
import type { Columna, FilaBarra } from './GraficasReporte'
import { franjaDe, type AgregadoReporte, type Indicadores } from './reportesDatos'

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
