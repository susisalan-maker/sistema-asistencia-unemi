import { useCallback, useEffect, useState } from 'react'
import { ApiError, api } from './api'
import type { EstadoHoy } from './marcacion'
import type { Historial } from './puntualidad'
import { ErrorUbicacion, obtenerPosicion, type Posicion } from './ubicacion'

export interface Zona {
  dentro: boolean
  sede: string
  lugar: string | null
  distancia_m: number | null
  radio_m: number | null
  /** Centro del lugar contra el que se midió, para dibujarlo en el mapa. */
  centro: { latitud: number; longitud: number } | null
  permite_fuera: boolean
}

export type EstadoZona =
  | { fase: 'buscando' }
  | { fase: 'lista'; zona: Zona; posicion: Posicion }
  | { fase: 'error'; mensaje: string }

/** Mide la ubicación del navegador y pregunta al servidor si está dentro de la zona de su sede. Marcar lo vuelve a validar. */
export function useZona() {
  const [estado, setEstado] = useState<EstadoZona>({ fase: 'buscando' })

  const medir = useCallback(async () => {
    setEstado({ fase: 'buscando' })
    try {
      const posicion = await obtenerPosicion()
      const zona = await api<Zona>(`/marcaciones/zona?latitud=${posicion.latitud}&longitud=${posicion.longitud}`)
      setEstado({ fase: 'lista', zona, posicion })
    } catch (e) {
      setEstado({
        fase: 'error',
        mensaje: e instanceof ErrorUbicacion || e instanceof ApiError ? e.message : 'No pudimos comprobar tu ubicación.',
      })
    }
  }, [])

  useEffect(() => { void medir() }, [medir])
  return { estado, medir }
}

/** Las marcaciones de hoy, cuál toca y la jornada. `recargar` vuelve a pedirlo. */
export function useEstadoHoy() {
  const [estado, setEstado] = useState<EstadoHoy | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(async () => {
    setError(null)
    try {
      setEstado(await api<EstadoHoy>('/marcaciones/hoy'))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu jornada de hoy.')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])
  return { estado, error, cargando, recargar }
}

/** Las marcaciones de los últimos `dias` días (30 por defecto: sirven para el historial reciente y la puntualidad). */
export function useHistorial(dias = 30) {
  const [historial, setHistorial] = useState<Historial | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    try {
      setHistorial(await api<Historial>(`/marcaciones/historial?dias=${dias}`))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu historial.')
    }
  }, [dias])

  useEffect(() => { setHistorial(null); void recargar() }, [recargar])
  return { historial, error, recargar }
}
