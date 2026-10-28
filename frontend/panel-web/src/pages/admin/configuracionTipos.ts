/** Parámetros globales que el administrador puede ajustar (tabla `configuracion`, una sola fila). */
export const CLAVES = [
  'tolerancia_min', 'almuerzo_max_min', 'plazo_justificacion_h', 'plazo_revision_h', 'velocidad_max_kmh', 'max_marcaciones_web_30d',
  'max_horas_sin_conexion', 'precision_max_app_m', 'precision_max_web_m',
] as const
/** Umbrales del reconocimiento facial (migración 0009): viven en la misma fila, en su propia pestaña. */
export const CLAVES_ROSTRO = [
  'rostro_umbral', 'rostro_umbral_registro', 'vida_umbral', 'giro_max_registro_frente', 'giro_max_registro_leve',
  'giro_max_marcacion', 'brillo_min', 'brillo_max', 'nitidez_min', 'rostro_min_px', 'foto_min_px',
] as const
export type ClaveConfig = (typeof CLAVES)[number] | (typeof CLAVES_ROSTRO)[number]
export type ValoresConfig = Record<ClaveConfig, number>
export type Seccion = 'reglas' | 'rostro'

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
  /** Cifras decimales que admite (0 = entero, el valor por omisión). */
  decimales?: number
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
      {
        clave: 'max_horas_sin_conexion', titulo: 'Plazo para enviar una marcación sin conexión', unidad: 'h', min: 1, max: 168, defecto: 48, enHoras: true,
        ayuda: 'Si la persona marca sin internet, la app la guarda y la envía cuando vuelve la señal. Pasado este plazo desde que marcó, el servidor ya no la acepta y la persona debe explicarlo desde Avisos. Un plazo más largo ayuda a quien trabaja en zonas sin cobertura; uno más corto da menos margen para marcar a destiempo.',
      },
      {
        clave: 'precision_max_app_m', titulo: 'Precisión mínima de la ubicación en la app', unidad: 'm', min: 5, max: 500, defecto: 50,
        ayuda: 'El celular informa cuánto se puede equivocar su GPS («±12 m»). Si informa más que este número, no se deja marcar y se le pide acercarse a una ventana o a un lugar abierto. Más bajo es más exigente; no lo pongas por encima del radio de tus bloques. 50 m es un valor provisional: mide en tus sedes y calibra con la guía docs/calibracion-precision-gps.md. No aplica a marcaciones sin conexión.',
      },
      {
        clave: 'precision_max_web_m', titulo: 'Precisión mínima de la ubicación en la web', unidad: 'm', min: 10, max: 2000, defecto: 200,
        ayuda: 'Lo mismo, pero para marcar desde el navegador. Un computador sin GPS ubica por la red (wifi/IP) y suele errar por decenas o cientos de metros, por eso este límite es más holgado que el de la app. 200 m es un valor provisional: calibra con la guía docs/calibracion-precision-gps.md.',
      },
    ],
  },
]

export const PARAMETROS: Parametro[] = GRUPOS.flatMap((g) => g.parametros)

const AYUDA_GIRO = 'Más alto tolera que la persona mire más de lado; más bajo la obliga a mirar de frente.'

/** Pestaña «Reconocimiento facial». Si la foto no cumple lo de «Calidad» o «Giro», se pide repetirla y no cuenta como intento fallido. */
export const GRUPOS_ROSTRO: Grupo[] = [
  {
    id: 'parecido', titulo: 'Parecido del rostro', detalle: 'Qué tan parecida debe ser la foto al rostro registrado.',
    parametros: [
      {
        clave: 'rostro_umbral', titulo: 'Parecido mínimo al marcar', unidad: '(0 a 1)', min: 0.1, max: 0.95, defecto: 0.4, decimales: 2,
        ayuda: 'Similitud mínima entre la selfie y el rostro registrado para aceptar la marcación. Más alto es más estricto: bloquea más suplantaciones, pero también rechaza más a la persona correcta. Cámbialo de a poco y prueba con varias personas.',
      },
      {
        clave: 'rostro_umbral_registro', titulo: 'Parecido mínimo en el registro', unidad: '(0 a 1)', min: 0.1, max: 0.95, defecto: 0.35, decimales: 2,
        ayuda: 'Similitud mínima entre las fotos del registro para aceptar que son de la misma persona. Evita registrar a otra persona por error; más alto exige fotos muy parecidas entre sí.',
      },
    ],
  },
  {
    id: 'vida', titulo: 'Detección de vida', detalle: 'Distingue un rostro real de una foto impresa o de una pantalla.',
    parametros: [{
      clave: 'vida_umbral', titulo: 'Probabilidad mínima de rostro real', unidad: '(0 a 1)', min: 0.05, max: 0.99, defecto: 0.5, decimales: 2,
      ayuda: 'Más alto es más estricto con fotos de fotos y pantallas, pero rechaza más selfies reales con poca luz. La detección se enciende o se apaga en el servidor (VIDA_ACTIVA); si está apagada, este valor no se usa.',
    }],
  },
  {
    id: 'giro', titulo: 'Giro de la cabeza', detalle: '0 es de frente; cerca de 0.5 es de perfil.',
    parametros: [
      {
        clave: 'giro_max_registro_frente', titulo: 'Giro máximo · foto de frente (registro)', unidad: '(0 a 1)', min: 0.05, max: 1, defecto: 0.3, decimales: 2,
        ayuda: `Primera foto del registro. ${AYUDA_GIRO}`,
      },
      {
        clave: 'giro_max_registro_leve', titulo: 'Giro máximo · fotos con giro (registro)', unidad: '(0 a 1)', min: 0.05, max: 1, defecto: 0.6, decimales: 2,
        ayuda: `Fotos 2 en adelante del registro, donde se pide girar un poco la cabeza. ${AYUDA_GIRO}`,
      },
      {
        clave: 'giro_max_marcacion', titulo: 'Giro máximo · selfie al marcar', unidad: '(0 a 1)', min: 0.05, max: 1, defecto: 0.4, decimales: 2,
        ayuda: `Selfie de cada marcación. ${AYUDA_GIRO}`,
      },
    ],
  },
  {
    id: 'calidad', titulo: 'Calidad de la foto', detalle: 'Luz, nitidez y tamaño mínimos para poder reconocer el rostro.',
    parametros: [
      {
        clave: 'brillo_min', titulo: 'Luz mínima', unidad: '(0 a 255)', min: 0, max: 254, defecto: 50,
        ayuda: 'Luz promedio del rostro. Por debajo de este valor se pide buscar un lugar más iluminado.',
      },
      {
        clave: 'brillo_max', titulo: 'Luz máxima', unidad: '(1 a 255)', min: 1, max: 255, defecto: 215,
        ayuda: 'Por encima de este valor se pide evitar el contraluz y los reflejos. Debe ser mayor que la luz mínima.',
      },
      {
        clave: 'nitidez_min', titulo: 'Nitidez mínima', unidad: 'puntos', min: 1, max: 1000, defecto: 40,
        ayuda: 'Más alto exige fotos más nítidas: una foto movida o desenfocada se rechaza y se pide repetirla.',
      },
      {
        clave: 'rostro_min_px', titulo: 'Tamaño mínimo del rostro', unidad: 'px', min: 40, max: 600, defecto: 90,
        ayuda: 'Lado menor del rostro en la foto original. Por debajo se pide acercarse a la cámara.',
      },
      {
        clave: 'foto_min_px', titulo: 'Tamaño mínimo de la foto', unidad: 'px', min: 100, max: 2000, defecto: 200,
        ayuda: 'Lado menor de la foto. Una imagen más pequeña se rechaza.',
      },
    ],
  },
]

export const PARAMETROS_ROSTRO: Parametro[] = GRUPOS_ROSTRO.flatMap((g) => g.parametros)
export const porClave = (clave: ClaveConfig): Parametro => [...PARAMETROS, ...PARAMETROS_ROSTRO].find((p) => p.clave === clave)!

export const valoresDeFabrica = (parametros: Parametro[] = PARAMETROS): ValoresConfig =>
  Object.fromEntries(parametros.map((p) => [p.clave, p.defecto])) as ValoresConfig

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

/** Texto escrito → número con hasta `decimales` cifras (acepta punto o coma), o null si no lo es. Con 0 decimales, solo enteros. */
export function aNumero(texto: string, decimales = 0): number | null {
  if (decimales === 0) return aEntero(texto)
  const m = new RegExp(`^(\\d{1,5})(?:[.,](\\d{1,${decimales}}))?$`).exec(texto.trim())
  return m ? Number(`${m[1]}.${m[2] ?? '0'}`) : null
}

const decimalesDe = (p: Parametro) => p.decimales ?? 0

/** Un valor como se muestra y se escribe: 0.4 → «0.40» si el parámetro lleva 2 decimales. */
export const valorATexto = (p: Parametro, v: number): string => (decimalesDe(p) > 0 ? Number(v).toFixed(decimalesDe(p)) : String(v))

/** Mensaje de error de un valor escrito, o null si es válido. */
export function errorDeValor(p: Parametro, texto: string): string | null {
  const d = decimalesDe(p)
  const n = aNumero(texto, d)
  if (n !== null && n >= p.min && n <= p.max) return null
  return d === 0
    ? `Escribe un número entero entre ${p.min} y ${p.max}`
    : `Escribe un número entre ${p.min.toFixed(d)} y ${p.max.toFixed(d)} (hasta ${d} decimales)`
}

type Textos = Partial<Record<ClaveConfig, string>>

export function erroresDe(textos: Textos, parametros: Parametro[] = PARAMETROS): Partial<Record<ClaveConfig, string>> {
  const r: Partial<Record<ClaveConfig, string>> = {}
  for (const p of parametros) {
    const e = errorDeValor(p, textos[p.clave] ?? '')
    if (e) r[p.clave] = e
  }
  // La luz mínima debe ser menor que la máxima (la base también lo exige).
  const min = textos.brillo_min, max = textos.brillo_max
  if (min !== undefined && max !== undefined && !r.brillo_min && !r.brillo_max && Number(min) >= Number(max) && parametros.some((p) => p.clave === 'brillo_max')) {
    r.brillo_max = 'Debe ser mayor que la luz mínima'
  }
  return r
}

export interface Cambio {
  clave: ClaveConfig; titulo: string; antes: number; despues: number; unidad: string
  /** Los mismos valores como se muestran (con sus decimales). */
  antesTexto: string; despuesTexto: string
}

/** Lo que cambió respecto de lo guardado (solo valores ya válidos). */
export function cambiosDe(guardado: Partial<ValoresConfig>, textos: Textos, parametros: Parametro[] = PARAMETROS): Cambio[] {
  const lista: Cambio[] = []
  for (const p of parametros) {
    const n = aNumero(textos[p.clave] ?? '', decimalesDe(p))
    const antes = guardado[p.clave]
    if (n !== null && antes !== undefined && n !== Number(antes)) {
      lista.push({ clave: p.clave, titulo: p.titulo, antes: Number(antes), despues: n, unidad: p.unidad, antesTexto: valorATexto(p, antes), despuesTexto: valorATexto(p, n) })
    }
  }
  return lista
}
