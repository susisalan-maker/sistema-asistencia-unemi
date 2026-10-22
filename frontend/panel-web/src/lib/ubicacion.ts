export interface Posicion {
  latitud: number
  longitud: number
  precision_m: number | null
  /** Cuándo se tomó (ms). Si pasa mucho tiempo, se vuelve a pedir antes de enviar. */
  tomadaEn: number
}

/** Falla con un mensaje listo para mostrar. */
export class ErrorUbicacion extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorUbicacion'
  }
}

const ESPERA_MAX_MS = 20_000
export const VIGENCIA_MS = 90_000

/** La ubicación del navegador. Pide permiso la primera vez; solo funciona en una conexión segura (https o localhost). */
export function obtenerPosicion(): Promise<Posicion> {
  return new Promise((resolver, rechazar) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      rechazar(new ErrorUbicacion('Tu navegador no permite obtener la ubicación. Prueba con Chrome, Edge, Firefox o Safari actualizados.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({
        latitud: p.coords.latitude,
        longitud: p.coords.longitude,
        precision_m: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        tomadaEn: Date.now(),
      }),
      (e) => rechazar(new ErrorUbicacion(
        e.code === e.PERMISSION_DENIED
          ? 'Bloqueaste la ubicación. Permítela desde el candado de la barra del navegador y vuelve a intentarlo.'
          : e.code === e.TIMEOUT
            ? 'No pudimos obtener tu ubicación a tiempo. Revisa que el GPS o la ubicación del equipo estén activos e inténtalo de nuevo.'
            : 'No pudimos obtener tu ubicación. Revisa que la ubicación del equipo esté activa e inténtalo de nuevo.',
      )),
      { enableHighAccuracy: true, timeout: ESPERA_MAX_MS, maximumAge: 0 },
    )
  })
}
