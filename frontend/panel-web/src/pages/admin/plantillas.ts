/** Las partes que puede tener un reporte. Cada plantilla elige cuáles se ven. */
export type SeccionReporte = 'resumen' | 'indicadores' | 'estado' | 'tendencia' | 'tipo' | 'comparativo' | 'sede' | 'hora' | 'patrones' | 'tabla'

export interface Plantilla {
  id: string
  nombre: string
  /** El nombre corto con el que sale en las pestañas. */
  corto: string
  descripcion: string
  secciones: SeccionReporte[]
  /** Las tarjetas de indicadores que muestra (si lleva `indicadores`). */
  indicadores?: ('anomalias' | 'aTiempo' | 'puntualidad' | 'resolucion' | 'rechazo' | 'porResolver')[]
  /** Filtro de tipo con el que abre la tabla histórica. */
  tipo?: string
  /** Partes que salen plegadas bajo «Más análisis» en vez de abiertas. */
  masAnalisis?: SeccionReporte[]
}

/**
 * Plantillas listas para entregar: en vez de armar filtros sueltos, se elige para qué es el reporte. Todas respetan el periodo y la sede
 * elegidos; la plantilla solo decide qué partes se ven. La primera es la de siempre.
 */
export const PLANTILLAS: Plantilla[] = [
  {
    id: 'resumen', nombre: 'Resumen del periodo', corto: 'Resumen', descripcion: 'Para Talento Humano: cifras y resumen',
    secciones: ['resumen', 'indicadores', 'estado', 'tendencia', 'tipo', 'comparativo', 'hora', 'patrones', 'tabla'],
    indicadores: ['anomalias', 'aTiempo', 'puntualidad', 'resolucion'], masAnalisis: ['comparativo', 'hora', 'patrones'],
  },
  {
    id: 'sedes', nombre: 'Asistencia por sede', corto: 'Sede contra sede', descripcion: 'Compara sedes entre sí y con el periodo anterior',
    secciones: ['comparativo', 'sede', 'hora', 'tabla'],
  },
  {
    id: 'recurrentes', nombre: 'Casos recurrentes', corto: 'Casos recurrentes', descripcion: 'Personas con patrones a revisar',
    secciones: ['patrones', 'tabla'],
  },
  {
    id: 'biometrica', nombre: 'Calidad biométrica', corto: 'Calidad biométrica', descripcion: 'Rechazo facial y verificaciones fallidas',
    secciones: ['indicadores', 'tipo', 'tabla'], indicadores: ['rechazo', 'anomalias'], tipo: 'verificacion_fallida',
  },
  {
    id: 'plazos', nombre: 'Cumplimiento de plazos', corto: 'Plazos', descripcion: 'Justificaciones a tiempo y tiempos de revisión',
    secciones: ['indicadores', 'estado', 'tabla'], indicadores: ['aTiempo', 'resolucion', 'porResolver'],
  },
]

export const PLANTILLA_INICIAL = PLANTILLAS[0]!
export const plantillaDe = (id: string | null): Plantilla => PLANTILLAS.find((p) => p.id === id) ?? PLANTILLA_INICIAL
