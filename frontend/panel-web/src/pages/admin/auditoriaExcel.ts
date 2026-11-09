import { MAXIMO_EXPORTAR, type AccionAuditoria } from './auditoriaDatos'
import { describirAccion } from './auditoriaFrases'
import { EVENTOS, nombreDelRegistro, singularDeEntidad } from './auditoriaTipos'
import { fechaHoraCompleta } from './reportesExportar'
import { crearXlsx, type Celda, type Hoja } from './xlsx'

/** Cómo van las filas del Excel: una por cada dato cambiado, o una por cada acción (como se ve en pantalla). */
export type ModoFilas = 'datos' | 'acciones'

export const TEXTO_MODO: Record<ModoFilas, string> = { datos: 'Una fila por dato cambiado', acciones: 'Una fila por acción' }

export interface EntradaExcel {
  acciones: AccionAuditoria[]
  nombres: ReadonlyMap<string, string>
  modo: ModoFilas
  /** «noviembre de 2026». */
  periodo: string
  /** Los filtros puestos, en palabras. */
  filtros: string[]
  /** Cuántas acciones había en total con esos filtros (puede ser más de las que vienen en `acciones`). */
  totalAcciones: number
  generado: Date
}

export interface ResultadoExcel { bytes: Uint8Array; filas: number; recortado: boolean }

const ENCABEZADO_DATOS = ['Fecha y hora', 'Realizado por', 'Qué se hizo', 'Evento', 'Registro afectado', 'Tipo de registro', 'Dato', 'Valor anterior', 'Valor nuevo', 'Motivo']
const ENCABEZADO_ACCIONES = ['Fecha y hora', 'Realizado por', 'Qué se hizo', 'Evento', 'Registro afectado', 'Tipo de registro', 'Datos cambiados', 'Detalle', 'Motivo']

/** El Excel de la bitácora: una hoja con las filas y otra con los datos de la descarga. Todo va como texto (nunca como fórmula). */
export function excelDeAuditoria(e: EntradaExcel): ResultadoExcel {
  const filas: Celda[][] = []
  for (const a of e.acciones) {
    const d = describirAccion(a, e.nombres)
    const comun = [fechaHoraCompleta(a.created_at), d.autor, d.texto, EVENTOS[a.evento]?.texto ?? a.evento, nombreDelRegistro(a.entidad, a.entidad_id, e.nombres), singularDeEntidad(a.entidad)]
    // Lo exportado (un reporte, la bitácora) no «cambia datos»: su dato es el formato y va en el texto.
    const motivo = a.motivo ?? ''
    if (e.modo === 'acciones') {
      filas.push([...comun, d.datos.length, d.datos.map((x) => `${x.dato}: ${x.antes} → ${x.despues}`).join('\n'), motivo])
    } else if (d.datos.length === 0) {
      filas.push([...comun, '', '', '', motivo])
    } else {
      for (const x of d.datos) filas.push([...comun, x.dato, x.antes, x.despues, motivo])
    }
  }
  const recortado = filas.length > MAXIMO_EXPORTAR || e.totalAcciones > e.acciones.length
  const lleva = filas.slice(0, MAXIMO_EXPORTAR)

  const informacion: Celda[][] = [
    ['Dato', 'Valor'],
    ['Qué es', 'Bitácora de auditoría del sistema (solo lectura: no se puede editar ni eliminar)'],
    ['Periodo', e.periodo],
    ['Filtros', e.filtros.length > 0 ? e.filtros.join(' · ') : 'Ninguno'],
    ['Cómo van las filas', TEXTO_MODO[e.modo]],
    ['Filas', lleva.length],
    ['Generado', fechaHoraCompleta(e.generado.toISOString())],
    ['Zona horaria', 'Hora de Ecuador'],
  ]
  if (recortado) informacion.push(['Aviso', `Hay más cambios de los que caben en el archivo (${MAXIMO_EXPORTAR}). Acota el periodo para descargar el resto.`])

  const hojas: Hoja[] = [
    {
      nombre: 'Auditoría',
      filas: [e.modo === 'datos' ? ENCABEZADO_DATOS : ENCABEZADO_ACCIONES, ...lleva],
      anchos: e.modo === 'datos' ? [17, 22, 56, 18, 28, 16, 28, 24, 24, 36] : [17, 22, 56, 18, 28, 16, 12, 60, 36],
    },
    { nombre: 'Datos de la descarga', filas: informacion, anchos: [22, 80] },
  ]
  return { bytes: crearXlsx(hojas, e.generado), filas: lleva.length, recortado }
}
