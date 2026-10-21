import { useCallback, useState } from 'react'
import { ApiError, api } from './api'
import { ErrorUbicacion, obtenerPosicion } from './ubicacion'

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
  | { fase: 'lista'; zona: Zona; precision_m: number | null; posicion: { latitud: number; longitud: number } }
  | { fase: 'error'; mensaje: string; abrirAjustes: boolean }

/** Mide la ubicación y pregunta al servidor si está dentro de la zona de su sede. Solo informa: marcar vuelve a validarlo. */
export function useZona() {
  const [estado, setEstado] = useState<EstadoZona>({ fase: 'buscando' })

  const medir = useCallback(async () => {
    setEstado({ fase: 'buscando' })
    try {
      const pos = await obtenerPosicion()
      const zona = await api<Zona>(`/marcaciones/zona?latitud=${pos.latitud}&longitud=${pos.longitud}`)
      setEstado({ fase: 'lista', zona, precision_m: pos.precision_m, posicion: { latitud: pos.latitud, longitud: pos.longitud } })
    } catch (e) {
      setEstado({
        fase: 'error',
        mensaje: e instanceof ErrorUbicacion || e instanceof ApiError ? e.message : 'No pudimos comprobar tu ubicación.',
        abrirAjustes: e instanceof ErrorUbicacion && e.abrirAjustes,
      })
    }
  }, [])

  return { estado, medir }
}
