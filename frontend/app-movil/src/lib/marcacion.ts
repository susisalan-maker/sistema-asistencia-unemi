export type TipoMarcacion = 'ingreso' | 'salida_almuerzo' | 'entrada_almuerzo' | 'salida'

/** En el orden en que se hacen durante la jornada. */
export const TIPOS: { tipo: TipoMarcacion; nombre: string; verbo: string }[] = [
  { tipo: 'ingreso', nombre: 'Ingreso', verbo: 'Marcar ingreso' },
  { tipo: 'salida_almuerzo', nombre: 'Salida a almorzar', verbo: 'Marcar salida a almorzar' },
  { tipo: 'entrada_almuerzo', nombre: 'Regreso del almuerzo', verbo: 'Marcar regreso del almuerzo' },
  { tipo: 'salida', nombre: 'Salida', verbo: 'Marcar salida' },
]

export const nombreDeTipo = (tipo: string) => TIPOS.find((t) => t.tipo === tipo)?.nombre ?? tipo
export const verboDeTipo = (tipo: string) => TIPOS.find((t) => t.tipo === tipo)?.verbo ?? 'Marcar'

export interface MarcacionResumen {
  id: string
  tipo: TipoMarcacion
  fecha_hora: string
  sede_id: string | null
  bloque_id: string | null
  origen: string
  verificacion: string
}

export interface EstadoHoy {
  fecha: string
  marcaciones: MarcacionResumen[]
  siguiente: TipoMarcacion | null
  dispositivo: 'sin_vincular' | 'este' | 'otro'
  rostro_registrado: boolean
  /** false solo en desarrollo con la verificación simulada: entonces no se exige rostro para marcar. */
  rostro_requerido: boolean
}

export interface RespuestaMarcar {
  marcacion: MarcacionResumen
  anomalias: { tipo: string; detalle: string | null }[]
  reintento: boolean
}

/** Qué le decimos a la persona cuando la marcación se registró pero quedó una observación. */
const AVISO_ANOMALIA: Record<string, string> = {
  fuera_geocerca: 'Estás fuera de la zona de tu sede.',
  fuera_horario: 'La marcación quedó fuera de tu horario.',
  almuerzo_excedido: 'El almuerzo superó el tiempo permitido.',
  desplazamiento_inusual: 'El desplazamiento desde tu última marcación es inusual.',
  dia_no_laborable: 'Hoy no es un día laborable para ti.',
  uso_recurrente_web: 'Has usado la marcación web varias veces.',
}
export const avisoDeAnomalia = (tipo: string) => AVISO_ANOMALIA[tipo] ?? 'Quedó una observación para revisión.'

/** '2026-10-15T13:05:00+00:00' → '08:05' en hora de Ecuador (UTC-5 fijo, sin cambio de horario). */
export function horaLocal(iso: string): string {
  const ms = new Date(iso).getTime() - 5 * 3_600_000
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** '2026-10-15' → 'jueves, 15 de octubre'. Se calcula sin zona horaria para que no se corra un día. */
export function diaLargo(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dia = new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay()
  return `${dias[dia]}, ${d} de ${meses[m! - 1]}`
}
