export type TipoMarcacion = 'ingreso' | 'salida_almuerzo' | 'entrada_almuerzo' | 'salida'

/** En el orden en que se hacen durante la jornada. */
export const TIPOS: { tipo: TipoMarcacion; nombre: string; verbo: string }[] = [
  { tipo: 'ingreso', nombre: 'Ingreso', verbo: 'Marcar ingreso' },
  { tipo: 'salida_almuerzo', nombre: 'Salida a almorzar', verbo: 'Marcar salida a almorzar' },
  { tipo: 'entrada_almuerzo', nombre: 'Regreso del almuerzo', verbo: 'Marcar regreso del almuerzo' },
  { tipo: 'salida', nombre: 'Salida', verbo: 'Marcar salida' },
]

export const nombreDeTipo = (tipo: string) => TIPOS.find((t) => t.tipo === tipo)?.nombre ?? tipo
/** «Ingreso registrado», «Salida registrada». */
export const registradoDe = (tipo: string) => `${nombreDeTipo(tipo)} ${tipo.startsWith('salida') ? 'registrada' : 'registrado'}`
/** «Ingreso guardado», «Salida guardada» (marcación hecha sin conexión, pendiente de enviar). */
export const guardadoDe = (tipo: string) => `${nombreDeTipo(tipo)} ${tipo.startsWith('salida') ? 'guardada' : 'guardado'}`
export const verboDeTipo = (tipo: string) => TIPOS.find((t) => t.tipo === tipo)?.verbo ?? 'Marcar'

export interface MarcacionResumen {
  id: string
  tipo: TipoMarcacion
  fecha_hora: string
  sede_id: string | null
  bloque_id: string | null
  origen: string
  verificacion: string
  /** Se hizo sin internet y se envió después. */
  sin_conexion?: boolean
  /** Solo en la app: sigue guardada en el celular, aún no llegó al servidor. */
  en_cola?: boolean
}

export interface EstadoHoy {
  fecha: string
  marcaciones: MarcacionResumen[]
  siguiente: TipoMarcacion | null
  /** La última marcación de todas (puede ser de un día anterior). */
  ultima: MarcacionResumen | null
  jornada: { inicio: string; fin: string } | null
  /** false si hoy no le toca trabajar (día fuera de su horario o feriado): el botón de marcar se deshabilita. */
  dia_laborable?: boolean
  motivo_no_laborable?: string | null
  /** Sus días de trabajo (1 = lunes … 7 = domingo); sirve para saber, sin internet, si el día de hoy le toca. */
  dias_laborables?: number[]
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
  verificacion_fallida: 'No pudimos confirmar tu rostro: una persona revisará la marcación.',
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


const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Hoy en Ecuador como 'AAAA-MM-DD'. */
export function hoyLocal(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
}

/** '2026-10-15' → 'Jueves, 15 de octubre' (como el encabezado del inicio). */
export function fechaConDia(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dia = DIAS[new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay()]!
  return `${dia[0]!.toUpperCase()}${dia.slice(1)}, ${d} de ${MESES_LARGOS[m! - 1]}`
}

/** '2026-10-15' → 'Hoy · 15 oct' o 'Lunes · 12 oct' (rótulo de cada día del historial). */
export function rotuloDeDia(iso: string, hoy: string = hoyLocal()): string {
  const [a, m, d] = iso.split('-').map(Number)
  const corto = `${d} ${MESES_CORTOS[m! - 1]}`
  if (iso === hoy) return `Hoy · ${corto}`
  const dia = DIAS[new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay()]!
  return `${dia[0]!.toUpperCase()}${dia.slice(1)} · ${corto}`
}

/** «Ayer 17:04», «Hoy 08:11» o «12 oct 17:04» para la tarjeta de última marcación. */
export function cuandoFue(iso: string, ahora: Date = new Date()): string {
  const local = new Date(new Date(iso).getTime() - 5 * 3_600_000).toISOString().slice(0, 10)
  const hoy = hoyLocal(ahora)
  const ayer = hoyLocal(new Date(ahora.getTime() - 86_400_000))
  const hora = horaLocal(iso)
  if (local === hoy) return `hoy ${hora}`
  if (local === ayer) return `ayer ${hora}`
  const [, m, d] = local.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m! - 1]} ${hora}`
}

/** ↓ para entrar (ingreso, regreso del almuerzo) y ↑ para salir. */
export const simboloDeTipo = (tipo: string) => (tipo === 'ingreso' || tipo === 'entrada_almuerzo' ? '↓' : '↑')
