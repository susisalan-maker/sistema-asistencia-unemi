import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { api, ApiError } from './api'

/** Cuántos días seguidos se pueden exportar de una vez (unos 3 meses). Es el mismo límite del microservicio. */
export const MAX_DIAS_EXPORTACION = 93

export type FormatoExportacion = 'pdf' | 'xlsx'
export type PeriodoExportacion = '7' | '30' | 'mes_anterior' | 'personalizado'
export interface Rango { desde: string; hasta: string }

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const partes = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const aFecha = (iso: string) => { const [a, m, d] = partes(iso); return new Date(Date.UTC(a, m - 1, d)) }
const aIso = (f: Date) => f.toISOString().slice(0, 10)

/** Suma (o resta) días a un día 'AAAA-MM-DD' sin zonas horarias, para que nunca se corra un día. */
export const sumarDias = (iso: string, dias: number) => aIso(new Date(aFecha(iso).getTime() + dias * 86_400_000))

/** Cuántos días hay del primero al último, ambos incluidos. */
export const diasDelRango = (desde: string, hasta: string) => Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1

/** El rango de un período fijo, contando desde hoy (hora de Ecuador). Para «personalizado» no hay rango fijo. */
export function rangoDePeriodo(periodo: Exclude<PeriodoExportacion, 'personalizado'>, hoy: string): Rango {
  if (periodo === '7') return { desde: sumarDias(hoy, -6), hasta: hoy }
  if (periodo === '30') return { desde: sumarDias(hoy, -29), hasta: hoy }
  const [a, m] = partes(hoy)
  const primeroDeEsteMes = aIso(new Date(Date.UTC(a, m - 1, 1)))
  const ultimo = sumarDias(primeroDeEsteMes, -1)
  const [ua, um] = partes(ultimo)
  return { desde: aIso(new Date(Date.UTC(ua, um - 1, 1))), hasta: ultimo }
}

/** '2026-10-15' → '15 oct 2026'. */
export function fechaCorta(iso: string): string {
  const [a, m, d] = partes(iso)
  return `${d} ${MESES_CORTOS[m - 1]} ${a}`
}

/** '2026-10' → 'octubre 2026' (título del calendario). */
export function mesLargo(a: number, m: number): string {
  return `${MESES_LARGOS[m - 1]} ${a}`
}

/** '2026-10-15' → '15 de octubre' (lo que lee el lector de pantalla en cada día del calendario). */
export function diaDelMes(iso: string): string {
  const [, m, d] = partes(iso)
  return `${d} de ${MESES_LARGOS[m - 1]}`
}

/** Por qué un rango no se puede exportar; null si está bien. */
export function errorDeRango(desde: string | null, hasta: string | null, hoy: string): string | null {
  if (!desde || !hasta) return 'Elige el día inicial y el final.'
  if (hasta < desde) return 'La fecha final no puede ser anterior a la inicial.'
  if (hasta > hoy) return 'No puedes exportar fechas futuras.'
  if (diasDelRango(desde, hasta) > MAX_DIAS_EXPORTACION) return `Puedes exportar hasta ${MAX_DIAS_EXPORTACION} días seguidos (unos 3 meses).`
  return null
}

interface RespuestaExportacion { nombre: string; mime: string; contenido: string; total: number }
export interface ResultadoExportacion { total: number; compartido: boolean }

const UTI: Record<FormatoExportacion, string> = { pdf: 'com.adobe.pdf', xlsx: 'org.openxmlformats.spreadsheetml.sheet' }

/** Un fallo con mensaje ya pensado para la persona (no técnico). */
export class ErrorExportacion extends Error {}

/** Mensaje claro para la persona (sin jerga) cuando algo falla al exportar. */
export function mensajeDeErrorExportacion(e: unknown): string {
  if (e instanceof ErrorExportacion) return e.message
  if (e instanceof ApiError) {
    if (e.status === 0) return 'Para generar el archivo necesitas conexión a internet. Inténtalo de nuevo cuando la tengas.'
    return e.message
  }
  return 'No se pudo preparar el archivo. Inténtalo de nuevo.'
}

/**
 * Pide el archivo al microservicio, lo guarda en la carpeta temporal del celular y abre el menú de compartir.
 * Si no hay marcaciones en el período, no se comparte nada y se devuelve `total: 0`.
 */
export async function exportarMarcaciones(rango: Rango, formato: FormatoExportacion): Promise<ResultadoExportacion> {
  const r = await api<RespuestaExportacion>(
    `/marcaciones/exportar?desde=${rango.desde}&hasta=${rango.hasta}&formato=${formato}`,
    { esperaMaxMs: 30_000 },
  )
  if (r.total === 0) return { total: 0, compartido: false }
  if (!(await Sharing.isAvailableAsync())) throw new ErrorExportacion('Este celular no permite compartir archivos desde la app.')
  const archivo = new File(Paths.cache, r.nombre)
  archivo.create({ overwrite: true })
  await archivo.write(r.contenido, { encoding: 'base64' })
  await Sharing.shareAsync(archivo.uri, { mimeType: r.mime, UTI: UTI[formato], dialogTitle: 'Compartir mis marcaciones' })
  return { total: r.total, compartido: true }
}
