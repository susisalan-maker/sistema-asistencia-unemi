import { api } from './api'
import { horaLocal } from './marcacion'

export const TEXTO_MIN = 10
/** Las respuestas a la repregunta del asistente pueden ser cortas («sí», «no tengo»). */
export const RESPUESTA_MIN = 2
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
  /** Aprobada por el sistema (falta menor y explicación clara), sin que Talento Humano la revisara. */
  automatica: boolean
  comentario: string | null
  /** Horas que tiene el administrador para resolver el caso (de la configuración). */
  plazo_revision_h: number
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
  ubicacion_simulada: 'Ubicación simulada detectada',
}
export const nombreDeAnomalia = (tipo: string) => NOMBRES[tipo] ?? 'Observación en tu asistencia'

export const ESTADOS: Record<EstadoAnomalia, { texto: string; tono: 'aviso' | 'ok' | 'error' | 'neutro' }> = {
  pendiente: { texto: 'Abierto', tono: 'aviso' },
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  justificada: { texto: 'Justificada', tono: 'ok' },
  rechazada: { texto: 'Rechazada', tono: 'error' },
  sin_justificar: { texto: 'Sin justificar', tono: 'error' },
}

/** Largo útil del texto (sin espacios a los lados) y qué falta, o null si ya sirve. La primera explicación pide más que una respuesta. */
export function problemaDeTexto(texto: string, esRespuesta = false): string | null {
  const n = texto.trim().length
  const minimo = esRespuesta ? RESPUESTA_MIN : TEXTO_MIN
  if (n < minimo) return `Escribe al menos ${minimo} caracteres (llevas ${n}).`
  if (n > TEXTO_MAX) return `Es muy largo: máximo ${TEXTO_MAX} caracteres (llevas ${n}).`
  return null
}

/** Símbolo del círculo de la fila de «Anteriores». */
export const iconoDeAnomalia = (tipo: string) =>
  ({ fuera_geocerca: '◎', duplicada: '≡', desplazamiento_inusual: '◎' } as Record<string, string>)[tipo] ?? '!'

/** «Caso #A-12» */
export const textoCaso = (caso: string) => `Caso #${caso}`

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const aLocal = (iso: string) => new Date(new Date(iso).getTime() - 5 * 3_600_000)

/** '2026-08-26T…' → '26 ago' (día de Ecuador). */
export function fechaCorta(iso: string): string {
  const d = aLocal(iso)
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`
}

/** «Hoy · 08:20» si es de hoy en Ecuador; si no, «26 ago · 08:20». */
export function etiquetaDia(iso: string, ahora: Date = new Date()): string {
  const d = aLocal(iso)
  const hoy = new Date(ahora.getTime() - 5 * 3_600_000)
  const mismoDia = d.getUTCFullYear() === hoy.getUTCFullYear() && d.getUTCMonth() === hoy.getUTCMonth() && d.getUTCDate() === hoy.getUTCDate()
  return `${mismoDia ? 'Hoy' : fechaCorta(iso)} · ${horaLocal(iso)}`
}

/** Lo primero que dice el asistente en el chat: lo que detectó el sistema y la pregunta. */
export function mensajeInicial(a: Pick<Anomalia, 'tipo' | 'detalle'>): string {
  const detalle = a.detalle?.trim().replace(/[.\s]+$/, '')
  return detalle
    ? `Detectamos lo siguiente: ${detalle}. ¿Qué ocurrió?`
    : `Detectamos una observación en tu asistencia (${nombreDeAnomalia(a.tipo).toLowerCase()}). ¿Qué ocurrió?`
}

/** Cómo se despide el chat cuando ya no se puede escribir. */
export function cierreDeConversacion(estado: EstadoAnomalia): string {
  switch (estado) {
    case 'en_revision': return 'Conversación cerrada · el caso está en revisión'
    case 'justificada': return 'Conversación cerrada · el caso fue aceptado'
    case 'rechazada': return 'Conversación cerrada · el caso fue rechazado'
    case 'sin_justificar': return 'Conversación cerrada · el plazo para justificar terminó'
    case 'pendiente': return 'Conversación cerrada · el plazo para justificar terminó'
  }
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
