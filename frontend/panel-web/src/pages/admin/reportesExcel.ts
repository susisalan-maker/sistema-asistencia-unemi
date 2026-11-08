import { CLASIFICACIONES_IA, ESTADOS, nombreDeTipo, type EstadoAnomalia } from './anomaliasTipos'
import type { SeccionExport } from './exportarSecciones'
import type { PatronPersona } from './patrones'
import { resolucionDe, type AgregadoReporte, type FilaHistorico, type Indicadores } from './reportesDatos'
import { ENCABEZADOS_CSV, fechaHoraCompleta } from './reportesExportar'
import { coma, textoHoras } from './reportesVista'
import type { FilaSede } from './sedesComparar'
import { crearXlsx, type Celda, type Hoja } from './xlsx'

export interface DatosExcel {
  periodo: string
  sede: string
  /** Los filtros de la tabla («Tipo: …»), si hay. */
  filtros: string
  agregado: AgregadoReporte
  indicadores: Indicadores
  /** Sede contra sede, si se pudo calcular. */
  comparativo: FilaSede[] | null
  /** Qué partes lleva el archivo (las que se marcaron en el cuadro de exportar). */
  secciones: ReadonlySet<SeccionExport>
  /** El resumen redactado por la IA, o null si no hay. */
  resumen: string | null
  /** Patrones a revisar, si se pidieron. */
  patrones: PatronPersona[] | null
  filas: FilaHistorico[]
  total: number
  recortado: boolean
  generado: Date
}

const porcentaje = (n: number | null) => (n === null ? '—' : `${coma(n)} %`)
const parte = (n: number, total: number): Celda => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)

/** Las hojas del reporte, según las partes marcadas: resumen, estado, tipo, sede y día, hora, sede contra sede, patrones y los casos. */
export function hojasDelReporte(d: DatosExcel): Hoja[] {
  const { agregado: a, indicadores: i } = d
  const hojas: Hoja[] = []
  const lleva = (id: SeccionExport) => d.secciones.has(id)
  const nota = d.resumen && lleva('resumen') ? 'Resumen redactado por IA a partir de las cifras' : 'Sin resumen con IA'
  hojas.push({
    nombre: 'Resumen',
    anchos: [34, 22, 52],
    filas: [
      ['Reporte de anomalías', 'Dato', 'Comparación con el periodo anterior'],
      ['Periodo', d.periodo, null],
      ['Sede', d.sede, null],
      ...(d.filtros ? [['Filtros de la tabla', d.filtros, null] as Celda[]] : []),
      ['Generado', fechaHoraCompleta(d.generado.toISOString()), null],
      [null, null, null],
      ...(lleva('indicadores') ? [
        ['Anomalías del periodo', i.total, i.anterior === null ? 'Sin periodo anterior' : `Antes: ${i.anterior}${i.variacionPct === null ? '' : ` (${i.variacionPct > 0 ? '+' : ''}${coma(i.variacionPct)} %)`}`] as Celda[],
        ['Marcaciones del periodo', i.marcaciones, null] as Celda[],
        ['Justificadas a tiempo', porcentaje(i.aTiempoPct), i.evaluadas === 0 ? 'Sin plazos vencidos' : `${i.aTiempo} de ${i.evaluadas} casos evaluados`] as Celda[],
        ['Puntualidad', porcentaje(i.puntualidadPct), i.puntualidadPts === null ? '' : `${i.puntualidadPts > 0 ? '+' : ''}${coma(i.puntualidadPts)} puntos`] as Celda[],
        ['Tiempo medio de resolución', i.resolucionHoras === null ? '—' : textoHoras(i.resolucionHoras), i.resolucionHorasAntes === null ? '' : `Antes: ${textoHoras(i.resolucionHorasAntes)}`] as Celda[],
        ['Rechazo facial', porcentaje(i.rechazoPct), i.rechazoPts === null ? `${i.rechazoFallidas} fallidas` : `${i.rechazoFallidas} fallidas · ${i.rechazoPts > 0 ? '+' : ''}${coma(i.rechazoPts)} puntos`] as Celda[],
        [null, null, null] as Celda[],
      ] : []),
      [nota, null, null],
      ...(d.resumen && lleva('resumen') ? [[d.resumen, null, null] as Celda[]] : []),
      ['La IA solo sugiere: la decisión de cada caso es de una persona.', null, null],
    ],
  })

  if (lleva('estado')) {
    hojas.push({
      nombre: 'Por estado',
      filas: [
        ['Estado', 'Casos', '% del total'],
        ...(Object.keys(ESTADOS) as EstadoAnomalia[]).filter((e) => (a.por_estado[e] ?? 0) > 0)
          .map((e) => [ESTADOS[e].texto, a.por_estado[e] as number, parte(a.por_estado[e] as number, a.total)] as Celda[]),
      ],
    })
  }
  if (lleva('graficas')) {
    hojas.push({ nombre: 'Por tipo', filas: [['Tipo', 'Casos', '% del total'], ...a.por_tipo.map((t) => [nombreDeTipo(t.tipo), t.total, parte(t.total, a.total)] as Celda[])] })
    hojas.push({ nombre: 'Por sede', filas: [['Sede', 'Casos', '% del total'], ...a.por_sede.map((s) => [s.sede ?? 'Sin sede asignada', s.total, parte(s.total, a.total)] as Celda[])] })
    hojas.push({ nombre: 'Por día', filas: [['Día', 'Detectadas', 'Justificadas'], ...a.por_dia.map((x) => [x.dia, x.total, x.justificadas] as Celda[])] })
  }
  if (lleva('hora')) {
    hojas.push({ nombre: 'Por hora', filas: [['Hora (Ecuador)', 'Casos'], ...a.por_hora.map((x) => [`${String(x.hora).padStart(2, '0')}:00`, x.total] as Celda[])] })
  }

  if (lleva('comparativo') && d.comparativo && d.comparativo.length > 0) {
    hojas.push({
      nombre: 'Sede contra sede',
      filas: [
        ['Sede', 'Anomalías', 'Anomalías (periodo anterior)', 'Puntualidad (%)', 'Puntualidad (puntos de cambio)', 'Tiempo medio de resolución (h)', 'Rechazo facial (%)', 'Rechazo facial (puntos de cambio)'],
        ...d.comparativo.map((f) => [
          f.sede, f.ind.total, f.ind.anterior, f.ind.puntualidadPct, f.ind.puntualidadPts, f.ind.resolucionHoras, f.ind.rechazoPct, f.ind.rechazoPts,
        ] as Celda[]),
      ],
    })
  }

  if (lleva('patrones') && d.patrones) {
    hojas.push({
      nombre: 'Patrones a revisar',
      anchos: [30, 20, 18, 18, 30, 16],
      filas: [
        ['Persona', 'Sede', 'Casos (30 días)', 'Justificados', 'Tipo más frecuente', 'Veces'],
        ...d.patrones.map((p) => [p.nombre, p.sede, p.total, p.justificadas, nombreDeTipo(p.tipo), p.tipo_total] as Celda[]),
        ['Es para conversar o revisar con la persona, no para sancionar.'] as Celda[],
      ],
    })
  }

  if (lleva('tabla')) hojas.push({
    nombre: 'Casos',
    anchos: [9, 17, 28, 30, 18, 18, 28, 16, 17],
    filas: [
      ENCABEZADOS_CSV,
      ...d.filas.map((f) => [
        f.caso, fechaHoraCompleta(f.created_at), f.colaborador, nombreDeTipo(f.tipo), f.sede, ESTADOS[f.estado]?.texto ?? f.estado, resolucionDe(f),
        f.clasificacion_ia ? CLASIFICACIONES_IA[f.clasificacion_ia].texto.replace(/^IA: /, '') : '', fechaHoraCompleta(f.fecha_decision),
      ] as Celda[]),
      ...(d.recortado ? [[`Se muestran los primeros ${d.filas.length} de ${d.total} casos. Acota el periodo para exportar el resto.`] as Celda[]] : []),
    ],
  })
  return hojas
}

export const excelDelReporte = (d: DatosExcel): Uint8Array => crearXlsx(hojasDelReporte(d), d.generado)
