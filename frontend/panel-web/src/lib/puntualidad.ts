import type { MarcacionResumen } from './marcacion'

export interface MarcaDeHistorial extends MarcacionResumen {
  /** Bloque o, si no tiene, la sede. */
  lugar: string | null
  anomalia: { tipo: string; estado: string } | null
}
export interface Historial {
  dias: { fecha: string; marcaciones: MarcaDeHistorial[] }[]
  total: number
}

/** Porcentaje de ingresos sin la observación «fuera de horario». `null` si todavía no hay ingresos que medir. */
export function puntualidad(historial: Historial | null): number | null {
  if (!historial) return null
  const ingresos = historial.dias.flatMap((d) => d.marcaciones).filter((m) => m.tipo === 'ingreso')
  if (ingresos.length === 0) return null
  const puntuales = ingresos.filter((m) => m.anomalia?.tipo !== 'fuera_horario').length
  return Math.round((puntuales / ingresos.length) * 100)
}
