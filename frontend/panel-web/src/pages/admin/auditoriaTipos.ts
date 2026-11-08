import { horaCorta, textoDias } from '../../lib/horario'

/** Lo que registra la bitácora (enum `evento_bitacora` de la base) y cómo se muestra cada evento. */
export type EventoBitacora =
  | 'crear' | 'actualizar' | 'activar' | 'desactivar'
  | 'registrar_rostro' | 'resetear_rostro' | 'resetear_dispositivo' | 'decidir_caso' | 'exportar_reporte'

export const EVENTOS: Record<EventoBitacora, { texto: string; tono: 'ok' | 'aviso' | 'neutro' | 'error' }> = {
  crear: { texto: 'Crear', tono: 'ok' },
  actualizar: { texto: 'Actualizar', tono: 'neutro' },
  activar: { texto: 'Activar', tono: 'ok' },
  desactivar: { texto: 'Desactivar', tono: 'aviso' },
  registrar_rostro: { texto: 'Registrar rostro', tono: 'ok' },
  resetear_rostro: { texto: 'Resetear rostro', tono: 'aviso' },
  resetear_dispositivo: { texto: 'Resetear dispositivo', tono: 'aviso' },
  decidir_caso: { texto: 'Decidir caso', tono: 'neutro' },
  exportar_reporte: { texto: 'Exportar reporte', tono: 'neutro' },
}
export const LISTA_EVENTOS = (Object.keys(EVENTOS) as EventoBitacora[]).map((valor) => ({ valor, texto: EVENTOS[valor].texto }))
export const esEvento = (v: string | null | undefined): v is EventoBitacora => !!v && v in EVENTOS

/** Las tablas cuyos cambios llegan a la bitácora. `valor` es el nombre de la tabla, tal como lo guarda la base. */
export const ENTIDADES: { valor: string; texto: string; singular: string }[] = [
  { valor: 'sedes', texto: 'Sedes', singular: 'Sede' },
  { valor: 'bloques', texto: 'Bloques', singular: 'Bloque' },
  { valor: 'usuarios', texto: 'Usuarios', singular: 'Usuario' },
  { valor: 'configuracion', texto: 'Configuración', singular: 'Configuración' },
  { valor: 'anomalias', texto: 'Anomalías', singular: 'Anomalía' },
  { valor: 'feriados', texto: 'Feriados', singular: 'Feriado' },
  { valor: 'ia_claves', texto: 'Claves de IA', singular: 'Clave de IA' },
  { valor: 'reportes', texto: 'Reportes', singular: 'Reporte' },
]
export const esEntidad = (v: string | null | undefined): v is string => !!v && ENTIDADES.some((e) => e.valor === v)
export const singularDeEntidad = (valor: string) => ENTIDADES.find((e) => e.valor === valor)?.singular ?? humanizar(valor)

/** «radio_metros» → «Radio metros»: para un campo que todavía no tiene nombre propio. */
function humanizar(texto: string): string {
  const limpio = texto.replace(/_/g, ' ').trim()
  return limpio ? limpio[0]!.toUpperCase() + limpio.slice(1) : texto
}

const CAMPOS: Record<string, string> = {
  // Compartidos
  nombre: 'Nombre', nombres: 'Nombres', apellidos: 'Apellidos', email: 'Correo', rol: 'Rol', activo: 'Estado', activa: 'Estado',
  latitud: 'Latitud', longitud: 'Longitud', radio_metros: 'Radio (m)', sede_id: 'Sede',
  // Sedes
  permite_fuera_geocerca: 'Permite marcar fuera de la geocerca',
  // Usuarios
  jornada_inicio: 'Inicio de la jornada', jornada_fin: 'Fin de la jornada', dias_laborables: 'Días laborables',
  dispositivo_id: 'Celular vinculado', fecha_registro_rostro: 'Registro del rostro',
  fecha_consentimiento_biometrico: 'Consentimiento biométrico', clave_publica: 'Clave de firma del celular',
  clave_evidencia: 'Prueba de la clave del celular', clave_registrada_at: 'Fecha de la clave del celular',
  // Feriados
  fecha_inicio: 'Primer día', fecha_fin: 'Último día',
  // Parámetros del sistema
  plazo_justificacion_h: 'Plazo para justificar (h)', plazo_revision_h: 'Plazo de revisión (h)', tolerancia_min: 'Tolerancia (min)',
  almuerzo_max_min: 'Almuerzo máximo (min)', velocidad_max_kmh: 'Velocidad máxima (km/h)',
  max_marcaciones_web_30d: 'Marcaciones web en 30 días (máx.)', modelo_ia: 'Modelo de IA', ia_proveedor: 'Proveedor de IA',
  rostro_umbral: 'Umbral del rostro (marcación)', rostro_umbral_registro: 'Umbral del rostro (registro)', vida_umbral: 'Umbral de prueba de vida',
  giro_max_registro_frente: 'Giro máximo (registro, frente)', giro_max_registro_leve: 'Giro máximo (registro, leve)',
  giro_max_marcacion: 'Giro máximo (marcación)', brillo_min: 'Brillo mínimo', brillo_max: 'Brillo máximo', nitidez_min: 'Nitidez mínima',
  rostro_min_px: 'Tamaño mínimo del rostro (px)', foto_min_px: 'Tamaño mínimo de la foto (px)',
  max_horas_sin_conexion: 'Horas máximas sin conexión', precision_max_app_m: 'Precisión máxima en la app (m)',
  precision_max_web_m: 'Precisión máxima en la web (m)',
  // Claves de IA
  clave: 'Clave de API', modelo: 'Modelo', proveedor: 'Proveedor',
}

/** Nombre legible de un campo; `null` (crear una decisión, por ejemplo) no tiene campo. */
export function nombreDeCampo(campo: string | null, evento?: EventoBitacora): string {
  if (!campo) return evento === 'decidir_caso' ? 'Decisión' : '—'
  if (evento === 'exportar_reporte') return FORMATOS_EXPORTACION[campo] ?? campo.toUpperCase()   // aquí el «campo» es el formato del archivo
  return CAMPOS[campo] ?? humanizar(campo)
}

/** El formato del archivo con que se exportó un reporte, tal como lo guarda la bitácora. */
const FORMATOS_EXPORTACION: Record<string, string> = { pdf: 'PDF', csv: 'CSV', xlsx: 'Excel' }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const ZONA = 'America/Guayaquil'
const ES_FECHA_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** «3 sep 2026 · 08:14», siempre en hora de Ecuador. */
export function fechaHoraCompleta(iso: string): string {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year: 'numeric', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? ''
  return `${Number(v('day'))} ${MESES[Number(v('month')) - 1]} ${v('year')} · ${v('hour')}:${v('minute')}`
}

/** «2026-11-05» → «5 nov 2026» (un día suelto, sin zona horaria). */
function diaLargo(dia: string): string {
  return `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]} ${dia.slice(0, 4)}`
}

const DECISIONES: Record<string, string> = { aprobada: 'Aprobada', rechazada: 'Rechazada', escalada: 'Escalada' }
const ROLES: Record<string, string> = { usuario: 'Usuario', administrador: 'Administrador' }
/** Los valores de estos campos son llaves o pruebas largas: solo se dice que existen, nunca se muestran. */
const CAMPOS_SOLO_EXISTENCIA = new Set(['clave_publica', 'clave_evidencia'])

export interface ValorMostrado { texto: string; completo?: string }

/**
 * El valor de un campo como se lee en pantalla. `nombres` traduce un id a su nombre (la sede de un usuario, por ejemplo);
 * lo que no se puede traducir se muestra tal cual. Nada se interpreta como HTML.
 */
export function formatearValor(campo: string | null, valor: string | null, evento?: EventoBitacora, nombres?: ReadonlyMap<string, string>): ValorMostrado {
  if (valor === null || valor === '') return { texto: '—' }
  if (evento === 'decidir_caso') return { texto: DECISIONES[valor] ?? valor }
  if (campo && CAMPOS_SOLO_EXISTENCIA.has(campo)) return { texto: 'Registrada' }
  if (campo === 'activo' || campo === 'activa') {
    if (valor === 'true') return { texto: 'Activo' }
    if (valor === 'false') return { texto: 'Inactivo' }
  }
  if (valor === 'true') return { texto: 'Sí' }
  if (valor === 'false') return { texto: 'No' }
  if (campo === 'rol') return { texto: ROLES[valor] ?? valor }
  if (campo === 'jornada_inicio' || campo === 'jornada_fin') return { texto: /^\d{2}:\d{2}/.test(valor) ? horaCorta(valor) : valor }
  if (campo === 'dias_laborables') {
    try {
      const dias = JSON.parse(valor) as unknown
      if (Array.isArray(dias) && dias.length > 0 && dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 7)) return { texto: textoDias(dias as number[]) }
    } catch { /* no era una lista: se muestra tal cual */ }
    return { texto: valor }
  }
  if (campo === 'sede_id') {
    const nombre = nombres?.get(`sedes:${valor}`)
    if (nombre) return { texto: nombre }
  }
  if (campo === 'dispositivo_id' && valor.length > 22) return { texto: `${valor.slice(0, 22)}…`, completo: valor }
  if (ES_FECHA_HORA.test(valor) && !Number.isNaN(Date.parse(valor))) return { texto: fechaHoraCompleta(valor) }
  if (ES_FECHA.test(valor) && !Number.isNaN(Date.parse(valor))) return { texto: diaLargo(valor) }
  return { texto: valor }
}

/** Cómo se llama el registro afectado: su nombre si se pudo buscar; si no, las primeras letras de su identificador. */
export function nombreDelRegistro(entidad: string, id: string, nombres?: ReadonlyMap<string, string>): string {
  if (entidad === 'configuracion') return 'Parámetros del sistema'
  if (entidad === 'reportes') {
    // El «id» de un reporte es su periodo: «2026-11-01 a 2026-11-30».
    const [desde, hasta] = id.split(' a ')
    if (desde && hasta && ES_FECHA.test(desde) && ES_FECHA.test(hasta)) return desde === hasta ? diaLargo(desde) : `${diaLargo(desde)} a ${diaLargo(hasta)}`
    return id
  }
  const nombre = nombres?.get(`${entidad}:${id}`)
  if (nombre) return nombre
  return `Registro ${id.slice(0, 8)}`
}
