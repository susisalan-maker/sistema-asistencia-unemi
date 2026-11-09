import { useCallback, useState } from 'react'
import { listarAnomalias } from './anomalias'
import { novedadesDeAvisos } from './avisosVistos'
import { useSincronizacion } from './offline/SincronizacionContext'

/**
 * Cuántas anomalías puede justificar la persona ahora y cuántos casos tienen un resultado que aún no vio.
 * Si no se puede saber, 0: es un aviso, no debe estorbar.
 */
export function useAnomaliasPendientes() {
  const { usuarioId } = useSincronizacion()
  const [cantidad, setCantidad] = useState(0)
  const [novedades, setNovedades] = useState(0)
  const recargar = useCallback(async () => {
    try {
      const lista = await listarAnomalias()
      const casos = Array.isArray(lista) ? lista : []
      setCantidad(casos.filter((a) => a.puede_justificar).length)
      setNovedades(usuarioId ? (await novedadesDeAvisos(usuarioId, casos)).size : 0)
    } catch {
      setCantidad(0)
      setNovedades(0)
    }
  }, [usuarioId])
  return { cantidad, novedades, recargar }
}
