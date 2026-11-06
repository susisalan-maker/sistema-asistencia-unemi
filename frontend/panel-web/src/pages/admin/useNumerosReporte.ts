import { useEffect, useMemo, useState } from 'react'
import { calcularIndicadores, consultarAgregado, type AgregadoReporte, type Indicadores } from './reportesDatos'
import { periodoAnterior, type Rango } from './reportesPeriodo'

/**
 * Los números del periodo (y los del periodo anterior, para comparar) que cuenta la base. Solo se vuelven a pedir si cambia el rango
 * o la sede. Si falla el periodo anterior, los números salen igual, sin comparación.
 */
export function useNumerosReporte(rango: Rango, sedeId: string, omitir: boolean) {
  const [numeros, setNumeros] = useState<{ actual: AgregadoReporte; anterior: AgregadoReporte | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (omitir) return
    let vigente = true
    setNumeros(null)
    setError(null)
    Promise.allSettled([consultarAgregado(rango, sedeId), consultarAgregado(periodoAnterior(rango), sedeId)]).then(([actual, anterior]) => {
      if (!vigente) return
      if (actual.status === 'rejected') { setError('No se pudieron cargar los números del reporte'); return }
      setNumeros({ actual: actual.value, anterior: anterior.status === 'fulfilled' ? anterior.value : null })
    })
    return () => { vigente = false }
  }, [rango, sedeId, omitir, reintento])
  const indicadores: Indicadores | null = useMemo(() => (numeros ? calcularIndicadores(numeros.actual, numeros.anterior) : null), [numeros])
  return { numeros, indicadores, error, reintentar: () => setReintento((n) => n + 1) }
}
