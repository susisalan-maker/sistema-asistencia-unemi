import { useEffect, useState } from 'react'
import { calcularIndicadores, consultarAgregado, type Indicadores } from './reportesDatos'
import { periodoAnterior, type Rango } from './reportesPeriodo'
import type { Sede } from './useFiltrosPeriodo'

export interface FilaSede { sede_id: string; sede: string; ind: Indicadores }

/**
 * Los mismos indicadores del periodo, sede por sede, comparados con el periodo anterior. Reutiliza `reporte_anomalias` (una llamada por
 * sede y periodo): son pocas sedes. Si falla el periodo anterior de una sede, esa fila sale sin comparación; si falla el actual, se lanza el error.
 */
export async function consultarComparativoSedes(rango: Rango, sedes: Sede[]): Promise<FilaSede[]> {
  const antes = periodoAnterior(rango)
  const filas = await Promise.all(sedes.map(async (s) => {
    const [actual, anterior] = await Promise.allSettled([consultarAgregado(rango, s.id), consultarAgregado(antes, s.id)])
    if (actual.status === 'rejected') throw actual.reason
    return { sede_id: s.id, sede: s.nombre, ind: calcularIndicadores(actual.value, anterior.status === 'fulfilled' ? anterior.value : null) }
  }))
  return filas.sort((a, b) => b.ind.total - a.ind.total || a.sede.localeCompare(b.sede))
}

/** El comparativo solo tiene sentido con todas las sedes y al menos dos. `activo` = la pantalla lo va a mostrar. */
export function useComparativoSedes(rango: Rango, sedes: Sede[] | null, activo: boolean) {
  const [filas, setFilas] = useState<FilaSede[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  const hacen = activo && !!sedes && sedes.length >= 2
  useEffect(() => {
    if (!hacen || !sedes) return
    let vigente = true
    setFilas(null)
    setError(false)
    consultarComparativoSedes(rango, sedes)
      .then((r) => { if (vigente) setFilas(r) })
      .catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [rango, sedes, hacen, reintento])
  return { filas: hacen ? filas : null, error: hacen && error, reintentar: () => setReintento((n) => n + 1), hay: hacen }
}
