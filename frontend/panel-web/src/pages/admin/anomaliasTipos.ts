export type EstadoAnomalia = 'pendiente' | 'en_revision' | 'justificada' | 'rechazada' | 'sin_justificar'
export type Decision = 'aprobada' | 'rechazada' | 'escalada'

export interface PersonaAnomalia { nombres: string; apellidos: string; email: string }

export type ClasificacionIA = 'aceptable' | 'requiere_revision' | 'sospechosa'

export interface FilaAnomalia {
  id: string
  numero: number
  tipo: string
  estado: EstadoAnomalia
  detalle: string | null
  created_at: string
  usuarios: PersonaAnomalia | null
  /** Solo lo necesario para la bandeja: lo que concluyó la IA (puede venir como objeto o como lista de uno). */
  justificaciones?: { clasificacion_ia: ClasificacionIA | null } | { clasificacion_ia: ClasificacionIA | null }[] | null
}

export interface MarcacionAnomalia {
  tipo: string
  fecha_hora: string
  latitud: number
  longitud: number
  precision_m: number | null
  origen: 'app' | 'web'
  motivo_contingencia: string | null
  verificacion: 'verificada' | 'pendiente' | 'fallida'
  similitud_score: number | null
  sedes: { nombre: string } | null
}

export interface MensajeCaso { emisor: 'usuario' | 'asistente'; contenido: string; created_at: string }

export interface JustificacionCaso {
  resumen_ia: string | null
  clasificacion_ia: ClasificacionIA | null
  confianza_ia: number | null
  decision_final: Decision | null
  /** Vacío con una decisión final = aprobada automáticamente por el sistema. */
  revisado_por: string | null
  comentario_admin: string | null
  fecha_decision: string | null
  mensajes_chat: MensajeCaso[] | null
}

export interface DetalleAnomalia extends FilaAnomalia {
  intentos_fallidos: number
  fecha_vencimiento: string
  descripcion_ia: string | null
  marcaciones: MarcacionAnomalia | null
  /** PostgREST devuelve un objeto (relación 1 a 1) o una lista según cómo lo infiera: se aceptan ambos. */
  justificaciones: JustificacionCaso | JustificacionCaso[] | null
}

const TIPOS: Record<string, string> = {
  fuera_geocerca: 'Marcación fuera de la zona',
  sin_ingreso: 'Sin ingreso',
  sin_salida: 'Sin salida',
  sin_regreso_almuerzo: 'Sin regreso del almuerzo',
  almuerzo_excedido: 'Almuerzo excedido',
  fuera_horario: 'Fuera de horario',
  duplicada: 'Marcación duplicada o fuera de orden',
  verificacion_fallida: 'Verificación facial fallida',
  desplazamiento_inusual: 'Desplazamiento inusual',
  uso_recurrente_web: 'Uso recurrente de la marcación web',
  dia_no_laborable: 'Marcación en día no laborable',
}
export const nombreDeTipo = (tipo: string) => TIPOS[tipo] ?? tipo
export const TIPOS_ANOMALIA = Object.entries(TIPOS).map(([valor, texto]) => ({ valor, texto }))

export const ESTADOS: Record<EstadoAnomalia, { texto: string; tono: 'ok' | 'aviso' | 'neutro' | 'error' }> = {
  pendiente: { texto: 'Esperando a la persona', tono: 'neutro' },
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  justificada: { texto: 'Justificada', tono: 'ok' },
  rechazada: { texto: 'Rechazada', tono: 'error' },
  sin_justificar: { texto: 'Sin justificar', tono: 'error' },
}

/** El administrador solo decide casos que ya llegaron a su bandeja (lo exige también la base de datos). */
export const puedeDecidir = (estado: EstadoAnomalia) => estado === 'en_revision' || estado === 'sin_justificar'
export const ESTADOS_POR_RESOLVER: EstadoAnomalia[] = ['en_revision', 'sin_justificar']

export type FiltroEstado = 'por_resolver' | 'abiertas' | 'resueltas' | 'todas'
export const FILTROS: { valor: FiltroEstado; texto: string; estados: EstadoAnomalia[] | null }[] = [
  { valor: 'por_resolver', texto: 'Por resolver', estados: ESTADOS_POR_RESOLVER },
  { valor: 'abiertas', texto: 'Esperando a la persona', estados: ['pendiente'] },
  { valor: 'resueltas', texto: 'Resueltas', estados: ['justificada', 'rechazada'] },
  { valor: 'todas', texto: 'Todas', estados: null },
]

const ZONA = 'America/Guayaquil'
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

/** «3 sep · 08:14», siempre en hora de Ecuador. */
export function fechaHora(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${Number(v('day'))} ${MESES[Number(v('month')) - 1]} · ${v('hour')}:${v('minute')}`
}

export const caso = (numero: number) => `A-${numero}`

export const nombreDe = (p: PersonaAnomalia | null) => (p ? `${p.nombres} ${p.apellidos}`.trim() : 'Persona desconocida')

export const CLASIFICACIONES_IA: Record<ClasificacionIA, { texto: string; tono: 'ok' | 'aviso' | 'error' }> = {
  aceptable: { texto: 'IA: aceptable', tono: 'ok' },
  requiere_revision: { texto: 'IA: requiere revisión', tono: 'aviso' },
  sospechosa: { texto: 'IA: sospechosa', tono: 'error' },
}

/** Lo que concluyó la IA sobre la justificación de una fila de la bandeja (o null si no hay). */
export function clasificacionDe(f: Pick<FilaAnomalia, 'justificaciones'>): ClasificacionIA | null {
  const j = f.justificaciones
  return ((Array.isArray(j) ? j[0] : j)?.clasificacion_ia) ?? null
}

/** La justificación de un caso, sea cual sea la forma en que la devuelva la consulta. */
export function justificacionDe(d: Pick<DetalleAnomalia, 'justificaciones'>): JustificacionCaso | null {
  const j = d.justificaciones
  return (Array.isArray(j) ? j[0] : j) ?? null
}

export const TIPOS_MARCACION: Record<string, string> = {
  ingreso: 'Ingreso', salida_almuerzo: 'Salida a almuerzo', entrada_almuerzo: 'Regreso de almuerzo', salida: 'Salida',
}

export const MOTIVOS_CONTINGENCIA: Record<string, string> = {
  celular_perdido: 'celular perdido', celular_robado: 'celular robado', celular_olvidado: 'celular olvidado',
  celular_danado: 'celular dañado', sin_bateria: 'sin batería', otro: 'otro motivo',
}

/** Mensajes de error de `decidir_anomalia()` explicados para quien administra. */
export function errorDeDecision(mensaje: string): string {
  const m = mensaje.toLowerCase()
  if (m.includes('solo un administrador')) return 'Solo un administrador puede decidir un caso.'
  if (m.includes('ya está resuelto') || m.includes('aún espera')) return 'Este caso ya fue resuelto o todavía espera la justificación de la persona. Actualiza la página.'
  if (m.includes('no encontrada')) return 'No se encontró el caso.'
  if (m.includes('comentario')) return 'Para rechazar un caso hay que escribir un comentario.'
  return 'No se pudo guardar la decisión. Inténtalo de nuevo.'
}
