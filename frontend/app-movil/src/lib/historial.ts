import { api } from './api'
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

export const cargarHistorial = (dias = 7) => api<Historial>(`/marcaciones/historial?dias=${dias}`)
