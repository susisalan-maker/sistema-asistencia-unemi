import type { Plantilla, SeccionReporte } from './plantillas'

export type FormatoExportar = 'pdf' | 'xlsx' | 'csv'

/** Las partes que se pueden poner (o quitar) al exportar un reporte. */
export type SeccionExport = 'resumen' | 'indicadores' | 'estado' | 'graficas' | 'comparativo' | 'hora' | 'patrones' | 'tabla'

export const SECCIONES_EXPORT: { id: SeccionExport; texto: string; detalle: string }[] = [
  { id: 'resumen', texto: 'Resumen redactado por IA', detalle: '1 párrafo' },
  { id: 'indicadores', texto: 'Indicadores del periodo', detalle: 'las cifras clave' },
  { id: 'estado', texto: 'Cómo va cada caso', detalle: 'por estado' },
  { id: 'graficas', texto: 'Tendencia, tipo y sede', detalle: '3 gráficas' },
  { id: 'comparativo', texto: 'Sede contra sede', detalle: 'tabla comparativa' },
  { id: 'hora', texto: 'Anomalías por hora del día', detalle: '1 gráfica' },
  { id: 'patrones', texto: 'Patrones a revisar', detalle: 'personas con 3 o más casos' },
  { id: 'tabla', texto: 'Tabla de casos', detalle: 'todos los casos del periodo' },
]

export const textoDeSeccion = (id: SeccionExport): string => SECCIONES_EXPORT.find((s) => s.id === id)?.texto ?? id

const DE_PLANTILLA: Record<SeccionReporte, SeccionExport> = {
  resumen: 'resumen', indicadores: 'indicadores', estado: 'estado', tendencia: 'graficas', tipo: 'graficas', sede: 'graficas',
  comparativo: 'comparativo', hora: 'hora', patrones: 'patrones', tabla: 'tabla',
}

/**
 * Lo que viene marcado al abrir el cuadro: lo que se está viendo. En «Casos del periodo», la tabla; en una plantilla, sus partes
 * (menos las que van plegadas bajo «Más análisis», que se piden a propósito).
 */
export function seccionesPorOmision(plantilla: Plantilla, vista: 'resumen' | 'casos'): SeccionExport[] {
  if (vista === 'casos') return ['tabla']
  const plegadas = new Set(plantilla.masAnalisis ?? [])
  const marcadas = new Set(plantilla.secciones.filter((s) => !plegadas.has(s)).map((s) => DE_PLANTILLA[s]))
  return SECCIONES_EXPORT.map((s) => s.id).filter((id) => marcadas.has(id))
}

export const PRESETS: { id: string; texto: string; secciones: SeccionExport[] | 'todo' | 'nada' }[] = [
  { id: 'todo', texto: 'Todo', secciones: 'todo' },
  { id: 'cifras', texto: 'Solo cifras y gráficas', secciones: ['indicadores', 'estado', 'graficas', 'comparativo', 'hora'] },
  { id: 'tabla', texto: 'Solo la tabla de casos', secciones: ['tabla'] },
  { id: 'nada', texto: 'Quitar todo', secciones: 'nada' },
]

/** Resumen en una línea de lo que se va a descargar. */
export function textoDescarga(formato: FormatoExportar, secciones: readonly SeccionExport[]): string {
  if (formato === 'csv') return 'Se descargará: CSV · solo la tabla de casos'
  const nombre = formato === 'pdf' ? 'PDF' : 'Excel'
  return `Se descargará: ${nombre} · ${secciones.length} ${secciones.length === 1 ? 'sección' : 'secciones'}`
}
