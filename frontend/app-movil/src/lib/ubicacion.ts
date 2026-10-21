import * as Location from 'expo-location'

export interface Posicion {
  latitud: number
  longitud: number
  precision_m: number | null
  /** Cuándo se tomó (ms). Si pasa mucho tiempo, se vuelve a pedir antes de enviar. */
  tomadaEn: number
}

/** Falla con un mensaje listo para mostrar. `abrirAjustes` indica que solo se arregla desde los ajustes del celular. */
export class ErrorUbicacion extends Error {
  abrirAjustes: boolean
  constructor(mensaje: string, abrirAjustes = false) {
    super(mensaje)
    this.abrirAjustes = abrirAjustes
  }
}

const ESPERA_MAX_MS = 20_000
export const VIGENCIA_MS = 90_000

export async function obtenerPosicion(): Promise<Posicion> {
  const permiso = await Location.requestForegroundPermissionsAsync()
  if (permiso.status !== 'granted') {
    throw new ErrorUbicacion(
      'Necesitamos tu ubicación para comprobar que estás en tu sede. Actívala en los ajustes del celular.',
      !permiso.canAskAgain,
    )
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new ErrorUbicacion('Tu GPS está apagado. Enciéndelo e inténtalo de nuevo.')
  }
  let pos: Location.LocationObject
  let reloj: ReturnType<typeof setTimeout> | undefined
  try {
    pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('tiempo')), ESPERA_MAX_MS) }),
    ])
  } catch {
    throw new ErrorUbicacion('No pudimos obtener tu ubicación. Sal a un lugar abierto e inténtalo de nuevo.')
  } finally {
    clearTimeout(reloj)
  }
  return {
    latitud: pos.coords.latitude,
    longitud: pos.coords.longitude,
    precision_m: pos.coords.accuracy ?? null,
    tomadaEn: Date.now(),
  }
}
