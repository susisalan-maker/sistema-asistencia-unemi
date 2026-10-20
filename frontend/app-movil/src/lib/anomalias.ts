import { api } from './api'
import { horaLocal } from './marcacion'

export const TEXTO_MIN = 10
export const TEXTO_MAX = 1000

export type EstadoAnomalia = 'pendiente' | 'en_revision' | 'justificada' | 'rechazada' | 'sin_justificar'

export interface Anomalia {
  id: string
  caso: string
  tipo: string
  estado: EstadoAnomalia
  detalle: string | null
  creada: string
  vence: string
  /** Pendiente y dentro del plazo: la decide el servidor, la app solo la respeta. */
  puede_justificar: boolean
}

export interface MensajeJustificacion {
  emisor: 'usuario' | 'asistente'
  contenido: string
  fecha: string
}

export interface AnomaliaDetalle extends Anomalia {
  mensajes: MensajeJustificacion[]
  decision: 'aprobada' | 'rechazada' | null
  comentario: string | null
}

const NOMBRES: Record<string, string> = {
  fuera_geocerca: 'Marcaste fuera de la zona',
  sin_ingreso: 'No marcaste ese día',
  sin_salida: 'Falta tu salida',
  sin_regreso_almuerzo: 'Falta el regreso del almuerzo',
  almuerzo_excedido: 'Almuerzo más largo de lo permitido',
  fuera_horario: 'Marcación fuera de tu horario',
  duplicada: 'Marcación repetida o fuera de orden',
  verificacion_fallida: 'No se pudo verificar tu rostro',
  desplazamiento_inusual: 'Desplazamiento inusual',
  uso_recurrente_web: 'Uso frecuente de la marcación web',
  dia_no_laborable: 'Marcaste en un día no laborable',
}
export const nombreDeAnomalia = (tipo: string) => NOMBRES[tipo] ?? 'Observación en tu asistencia'

export const ESTADOS: Record<EstadoAnomalia, { texto: string; tono: 'aviso' | 'ok' | 'error' | 'neutro' }> = {
  pendiente: { texto: 'Por justificar', tono: 'aviso' },
  en_revision: { texto: 'En revisión', tono: 'neutro' },
  justificada: { texto: 'Justificada', tono: 'ok' },
  rechazada: { texto: 'Rechazada', tono: 'error' },
  sin_justificar: { texto: 'Sin justificar', tono: 'error' },
}

/** Qué se le explica a la persona según el estado, en una frase. */
export function explicacionDeEstado(a: Pick<AnomaliaDetalle, 'estado' | 'puede_justificar'>): string {
  switch (a.estado) {
    case 'pendiente':
      return a.puede_justificar
        ? 'Cuéntanos qué pasó. Un administrador revisará tu explicación.'
        : 'El plazo para justificar terminó. El caso pasará a revisión del administrador.'
    case 'en_revision': return 'Tu explicación está en revisión del administrador.'
    case 'justificada': return 'Tu explicación fue aceptada.'
    case 'rechazada': return 'Tu explicación no fue aceptada.'
    case 'sin_justificar': return 'No se justificó a tiempo. El administrador revisará el caso.'
  }
}

/** Largo útil del texto (sin espacios a los lados) y qué falta, o null si ya sirve. */
export function problemaDeTexto(texto: string): string | null {
  const n = texto.trim().length
  if (n < TEXTO_MIN) return `Escribe al menos ${TEXTO_MIN} caracteres (llevas ${n}).`
  if (n > TEXTO_MAX) return `Es muy largo: máximo ${TEXTO_MAX} caracteres (llevas ${n}).`
  return null
}

/** '2026-10-15T13:05:00+00:00' → '15/10 08:05' en hora de Ecuador. */
export function fechaHoraLocal(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3_600_000)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${horaLocal(iso)}`
}

/** Tiempo que queda para justificar: «38 h», «2 h 15 min», «40 min»; null si ya venció. */
export function tiempoRestante(vence: string, ahora: Date = new Date()): string | null {
  const min = Math.floor((new Date(vence).getTime() - ahora.getTime()) / 60_000)
  if (min <= 0) return null
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return h >= 24 || m === 0 ? `${h} h` : `${h} h ${m} min`
}

export const listarAnomalias = () => api<Anomalia[]>('/anomalias')
export const obtenerAnomalia = (id: string) => api<AnomaliaDetalle>(`/anomalias/${id}`)
export const justificarAnomalia = (id: string, texto: string) =>
  api<AnomaliaDetalle>(`/anomalias/${id}/justificacion`, { method: 'POST', body: { texto: texto.trim() } })
