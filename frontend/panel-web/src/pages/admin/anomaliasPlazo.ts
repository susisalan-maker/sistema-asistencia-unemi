import type { FilaAnomalia } from './anomaliasTipos'

/** «5 min», «3 h», «2 d»: lo más grande que quepa, redondeado hacia abajo (mínimo «1 min»). */
export function tiempoCorto(ms: number): string {
  const min = Math.max(1, Math.floor(Math.abs(ms) / 60_000))
  if (min < 60) return `${min} min`
  const horas = Math.floor(min / 60)
  if (horas < 24) return `${horas} h`
  return `${Math.floor(horas / 24)} d`
}

/** Cuánto pasó desde que se detectó el caso: «hace 3 h». */
export function haceCuanto(iso: string, ahora: Date): string {
  return `hace ${tiempoCorto(ahora.getTime() - new Date(iso).getTime())}`
}

/** Pocas horas para que la persona justifique: se avisa en ámbar. */
const POCO_TIEMPO_MS = 6 * 3_600_000

export interface Plazo { texto: string; tono: 'neutro' | 'aviso' | 'error' }

/**
 * El plazo de la persona para explicar un caso, solo donde importa: mientras se espera a la persona («Vence en 5 h»,
 * en ámbar si queda poco) y en los que se pasó sin justificar («Venció hace 2 d», en rojo). En los demás no hay plazo corriendo.
 */
export function plazoDe(f: Pick<FilaAnomalia, 'estado' | 'fecha_vencimiento'>, ahora: Date): Plazo | null {
  if (!f.fecha_vencimiento) return null
  const resta = new Date(f.fecha_vencimiento).getTime() - ahora.getTime()
  if (f.estado === 'sin_justificar') return { texto: `Venció hace ${tiempoCorto(resta)}`, tono: 'error' }
  if (f.estado !== 'pendiente') return null
  if (resta <= 0) return { texto: 'Plazo vencido', tono: 'error' }
  return { texto: `Vence en ${tiempoCorto(resta)}`, tono: resta < POCO_TIEMPO_MS ? 'aviso' : 'neutro' }
}

/** Color del texto del plazo según su tono. */
export const TONO_PLAZO = { neutro: 'text-texto-suave', aviso: 'text-aviso', error: 'text-error' } as const
