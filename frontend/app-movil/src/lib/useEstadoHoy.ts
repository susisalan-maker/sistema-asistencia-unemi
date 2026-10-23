import { useCallback, useMemo, useState } from 'react'
import { ApiError, api } from './api'
import { idDispositivo } from './dispositivo'
import { hoyLocal, type EstadoHoy } from './marcacion'
import { guardarEstadoHoy, leerEstadoHoy } from './offline/cacheEstado'
import { useSincronizacion } from './offline/SincronizacionContext'
import { aplicarPendientes } from './offline/reglasLocales'

/**
 * Las marcaciones de hoy, cuál toca y si este celular es el vinculado. `recargar` vuelve a pedirlo.
 * Sin internet se usa la copia de la última vez que se pudo consultar (`sinConexion` avisa), y se le suman las
 * marcaciones que siguen guardadas en el celular para saber cuál toca ahora.
 */
export function useEstadoHoy() {
  const { usuarioId, pendientes } = useSincronizacion()
  const [base, setBase] = useState<EstadoHoy | null>(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      const nuevo = await api<EstadoHoy>('/marcaciones/hoy', { headers: { 'X-Dispositivo-Id': await idDispositivo() } })
      setBase(nuevo)
      setSinConexion(false)
      if (usuarioId) void guardarEstadoHoy(usuarioId, nuevo)
    } catch (e) {
      // Sin red: lo último que se supo vale para poder marcar; sin esa copia no hay nada que mostrar.
      if (e instanceof ApiError && e.status === 0 && usuarioId) {
        const copia = await leerEstadoHoy(usuarioId)
        if (copia) {
          setBase(copia)
          setSinConexion(true)
          setCargando(false)
          return
        }
      }
      // Si no es un error conocido de la API, se muestra el motivo técnico para poder diagnosticarlo.
      console.warn('No se pudo cargar la jornada de hoy', e)
      setError(e instanceof ApiError ? e.message : `No se pudo cargar tu jornada de hoy. (${e instanceof Error ? e.message : String(e)})`)
    } finally {
      setCargando(false)
    }
  }, [usuarioId])

  // Con datos recién traídos del servidor, «hoy» es el día que él dice; con la copia guardada, es el de este celular
  // (la copia puede ser de ayer).
  const estado = useMemo(
    () => (base ? aplicarPendientes(base, pendientes, sinConexion ? hoyLocal() : base.fecha) : null),
    [base, pendientes, sinConexion],
  )

  /** Para el botón «Reintentar»: muestra que está cargando en vez de dejar el error anterior en pantalla. */
  const reintentar = useCallback(async () => {
    setCargando(true)
    await recargar()
  }, [recargar])

  return { estado, error, cargando, sinConexion, recargar, reintentar }
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
