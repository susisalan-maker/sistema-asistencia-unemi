import { useCallback, useState } from 'react'
import { listarAnomalias } from './anomalias'

/** Cuántas anomalías puede justificar la persona ahora. Si no se puede saber, 0: es un aviso, no debe estorbar. */
export function useAnomaliasPendientes() {
  const [cantidad, setCantidad] = useState(0)
  const recargar = useCallback(async () => {
    try {
      const lista = await listarAnomalias()
      setCantidad(Array.isArray(lista) ? lista.filter((a) => a.puede_justificar).length : 0)
    } catch {
      setCantidad(0)
    }
  }, [])
  return { cantidad, recargar }
}
