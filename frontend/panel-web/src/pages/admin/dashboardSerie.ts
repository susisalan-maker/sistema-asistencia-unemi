import { diasEntre, periodoAnterior, type Rango } from './reportesPeriodo'
import type { AgregadoReporte } from './reportesDatos'

// ---------------------------------------------------------------------------------------------------------------------
// «Anomalías por día»: el periodo elegido frente al anterior, columna contra columna. Hasta 14 días va una columna por día;
// más largo, por bloques de 7 días contados desde el primer día del periodo (así cada bloque se compara con el suyo del anterior).
// ---------------------------------------------------------------------------------------------------------------------

export interface ColumnaComparada {
  clave: string
  etiqueta: string
  actual: number
  /** null si no se pudo pedir el periodo anterior. */
  anterior: number | null
  /** «Jueves 5 de noviembre», «Semana del 2 nov». */
  titulo: string
  /** Cómo se nombra en una frase: «el jueves», «la semana del 2 nov». */
  enFrase: string
}

export const DIAS_POR_DIA = 14
const SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const diaSemana = (dia: string) => SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]
const corto = (dia: string) => `${Number(dia.slice(8, 10))} ${MES_CORTO[Number(dia.slice(5, 7)) - 1]}`
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function serieComparada(actual: AgregadoReporte, anterior: AgregadoReporte | null, rango: Rango): { columnas: ColumnaComparada[]; unidad: 'dia' | 'semana' } {
  const dias = diasEntre(rango)
  const diasAntes = diasEntre(periodoAnterior(rango))
  const total = new Map(actual.por_dia.map((d) => [d.dia, d.total]))
  const totalAntes = new Map((anterior?.por_dia ?? []).map((d) => [d.dia, d.total]))
  const sumar = (lista: string[], mapa: Map<string, number>) => lista.reduce((n, d) => n + (mapa.get(d) ?? 0), 0)

  if (dias.length <= DIAS_POR_DIA) {
    const columnas = dias.map((dia, i) => ({
      clave: dia,
      etiqueta: dias.length <= 7 ? mayuscula(diaSemana(dia)).slice(0, 3) : String(Number(dia.slice(8, 10))),
      actual: total.get(dia) ?? 0,
      anterior: anterior ? totalAntes.get(diasAntes[i] ?? '') ?? 0 : null,
      titulo: `${mayuscula(diaSemana(dia))} ${Number(dia.slice(8, 10))} de ${MES_LARGO[Number(dia.slice(5, 7)) - 1]}`,
      enFrase: dias.length <= 7 ? `el ${diaSemana(dia)}` : `el ${Number(dia.slice(8, 10))} de ${MES_LARGO[Number(dia.slice(5, 7)) - 1]}`,
    }))
    return { columnas, unidad: 'dia' }
  }

  const columnas: ColumnaComparada[] = []
  for (let i = 0; i < dias.length; i += 7) {
    const bloque = dias.slice(i, i + 7)
    const bloqueAntes = diasAntes.slice(i, i + 7)
    columnas.push({
      clave: bloque[0],
      etiqueta: corto(bloque[0]),
      actual: sumar(bloque, total),
      anterior: anterior ? sumar(bloqueAntes, totalAntes) : null,
      titulo: `Semana del ${corto(bloque[0])}`,
      enFrase: `la semana del ${corto(bloque[0])}`,
    })
  }
  return { columnas, unidad: 'semana' }
}

/** La columna con más casos, o null si no hubo ninguno. */
export function picoDe(columnas: ColumnaComparada[]): ColumnaComparada | null {
  return columnas.reduce<ColumnaComparada | null>((m, c) => (c.actual > (m?.actual ?? 0) ? c : m), null)
}
