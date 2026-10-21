/** Parámetros globales que el administrador puede ajustar (tabla `configuracion`, una sola fila). */
export const CLAVES = [
  'tolerancia_min', 'almuerzo_max_min', 'plazo_justificacion_h', 'plazo_revision_h', 'velocidad_max_kmh', 'max_marcaciones_web_30d',
] as const
export type ClaveConfig = (typeof CLAVES)[number]
export type ValoresConfig = Record<ClaveConfig, number>

export interface FilaConfig extends ValoresConfig {
  updated_at: string | null
  updated_by: string | null
}

export interface Parametro {
  clave: ClaveConfig
  titulo: string
  ayuda: string
  unidad: string
  /** Los mismos topes que acepta la base; los máximos son solo de sentido común para evitar errores de dedo. */
  min: number
  max: number
  /** Valor de fábrica (el de la migración inicial). */
  defecto: number
  /** Las horas se muestran también en días. */
  enHoras?: boolean
}

export interface Grupo {
  id: string
  titulo: string
  detalle: string
  parametros: Parametro[]
}

export const GRUPOS: Grupo[] = [
  {
    id: 'puntualidad', titulo: 'Puntualidad', detalle: 'Cuánto se perdona antes de generar una anomalía de horario.',
    parametros: [{
      clave: 'tolerancia_min', titulo: 'Tolerancia de puntualidad', unidad: 'min', min: 0, max: 120, defecto: 10,
      ayuda: 'Minutos de gracia en el ingreso, en la salida y en el regreso del almuerzo. Pasado ese margen se crea la anomalía «Fuera de horario» o «Almuerzo excedido».',
    }],
  },
  {
    id: 'almuerzo', titulo: 'Almuerzo', detalle: 'Cuánto tiempo puede durar la pausa del almuerzo.',
    parametros: [{
      clave: 'almuerzo_max_min', titulo: 'Duración máxima del almuerzo', unidad: 'min', min: 15, max: 180, defecto: 60,
      ayuda: 'Tiempo entre la salida a almorzar y el regreso. Se le suma la tolerancia de puntualidad antes de marcar «Almuerzo excedido».',
    }],
  },
  {
    id: 'justificaciones', titulo: 'Justificaciones', detalle: 'Plazos para explicar y para resolver una anomalía.',
    parametros: [
      {
        clave: 'plazo_justificacion_h', titulo: 'Plazo para justificar', unidad: 'h', min: 1, max: 720, defecto: 48, enHoras: true,
        ayuda: 'Tiempo que tiene la persona para explicar una anomalía. Pasado el plazo queda «Sin justificar». Solo cuenta para las anomalías nuevas: las que ya existen conservan su vencimiento.',
      },
      {
        clave: 'plazo_revision_h', titulo: 'Plazo de revisión', unidad: 'h', min: 1, max: 720, defecto: 48, enHoras: true,
        ayuda: 'Tiempo objetivo de Talento Humano para resolver un caso. Es el plazo que ve la persona en la app después de enviar su explicación.',
      },
    ],
  },
  {
    id: 'seguridad', titulo: 'Seguridad de la marcación', detalle: 'Límites para detectar movimientos y usos poco creíbles.',
    parametros: [
      {
        clave: 'velocidad_max_kmh', titulo: 'Velocidad máxima creíble', unidad: 'km/h', min: 30, max: 400, defecto: 120,
        ayuda: 'Si entre dos marcaciones seguidas la persona «viajó» más rápido que esto, se crea la anomalía «Desplazamiento inusual».',
      },
      {
        clave: 'max_marcaciones_web_30d', titulo: 'Marcaciones web permitidas', unidad: 'en 30 días', min: 1, max: 30, defecto: 3,
        ayuda: 'La marcación web es solo de contingencia. Al superar este número en 30 días se crea la anomalía «Uso recurrente de web».',
      },
    ],
  },
]

export const PARAMETROS: Parametro[] = GRUPOS.flatMap((g) => g.parametros)
export const porClave = (clave: ClaveConfig): Parametro => PARAMETROS.find((p) => p.clave === clave)!

export const valoresDeFabrica = (): ValoresConfig =>
  Object.fromEntries(PARAMETROS.map((p) => [p.clave, p.defecto])) as ValoresConfig

/** 48 → «2 días»; 36 → «1 día 12 h»; 5 → «5 h». */
export function horasATexto(horas: number): string {
  if (!Number.isFinite(horas) || horas < 0) return ''
  const dias = Math.floor(horas / 24)
  const resto = horas % 24
  if (dias === 0) return `${resto} h`
  const d = `${dias} ${dias === 1 ? 'día' : 'días'}`
  return resto === 0 ? d : `${d} ${resto} h`
}

/** Texto escrito → entero, o null si no es un número entero. */
export function aEntero(texto: string): number | null {
  const t = texto.trim()
  return /^\d{1,5}$/.test(t) ? Number(t) : null
}

/** Mensaje de error de un valor escrito, o null si es válido. */
export function errorDeValor(p: Parametro, texto: string): string | null {
  const n = aEntero(texto)
  if (n === null || n < p.min || n > p.max) return `Escribe un número entero entre ${p.min} y ${p.max}`
  return null
}

export function erroresDe(textos: Record<ClaveConfig, string>): Partial<Record<ClaveConfig, string>> {
  const r: Partial<Record<ClaveConfig, string>> = {}
  for (const p of PARAMETROS) {
    const e = errorDeValor(p, textos[p.clave])
    if (e) r[p.clave] = e
  }
  return r
}

export interface Cambio { clave: ClaveConfig; titulo: string; antes: number; despues: number; unidad: string }

/** Lo que cambió respecto de lo guardado (solo valores ya válidos). */
export function cambiosDe(guardado: ValoresConfig, textos: Record<ClaveConfig, string>): Cambio[] {
  const lista: Cambio[] = []
  for (const p of PARAMETROS) {
    const n = aEntero(textos[p.clave])
    if (n !== null && n !== guardado[p.clave]) lista.push({ clave: p.clave, titulo: p.titulo, antes: guardado[p.clave], despues: n, unidad: p.unidad })
  }
  return lista
}
