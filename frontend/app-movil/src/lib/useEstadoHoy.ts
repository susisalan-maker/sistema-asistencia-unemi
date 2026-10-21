import { useCallback, useState } from 'react'
import { ApiError, api } from './api'
import { idDispositivo } from './dispositivo'
import type { EstadoHoy } from './marcacion'

/** Las marcaciones de hoy, cuál toca y si este celular es el vinculado. `recargar` vuelve a pedirlo. */
export function useEstadoHoy() {
  const [estado, setEstado] = useState<EstadoHoy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      setEstado(await api<EstadoHoy>('/marcaciones/hoy', { headers: { 'X-Dispositivo-Id': await idDispositivo() } }))
    } catch (e) {
      // Si no es un error conocido de la API, se muestra el motivo técnico para poder diagnosticarlo.
      console.warn('No se pudo cargar la jornada de hoy', e)
      setError(e instanceof ApiError ? e.message : `No se pudo cargar tu jornada de hoy. (${e instanceof Error ? e.message : String(e)})`)
    } finally {
      setCargando(false)
    }
  }, [])

  /** Para el botón «Reintentar»: muestra que está cargando en vez de dejar el error anterior en pantalla. */
  const reintentar = useCallback(async () => {
    setCargando(true)
    await recargar()
  }, [recargar])

  return { estado, error, cargando, recargar, reintentar }
}

/** Vincula este celular a la cuenta. Devuelve null si salió bien o el mensaje de error. */
export async function vincularEsteDispositivo(): Promise<string | null> {
  try {
    await api('/dispositivo/vincular', { method: 'POST', body: { dispositivo_id: await idDispositivo() } })
    return null
  } catch (e) {
    return e instanceof ApiError ? e.message : 'No se pudo vincular el celular.'
  }
}
