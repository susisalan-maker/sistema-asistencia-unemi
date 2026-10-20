import { ApiError, api } from './api'

/** Las fotos del registro, en orden. La primera es de frente; las otras, con un giro leve. */
export const PASOS_ROSTRO = [
  { titulo: 'De frente', instruccion: 'Mira de frente a la cámara, con el rostro centrado en la guía.' },
  { titulo: 'Un giro leve', instruccion: 'Gira un poco la cabeza hacia un lado, sin dejar de mirar a la cámara.' },
  { titulo: 'Hacia el otro lado', instruccion: 'Ahora gira un poco la cabeza hacia el otro lado.' },
] as const

export const CONSENTIMIENTO_ROSTRO =
  'Para verificar que eres tú al marcar tu asistencia, la app te tomará unas fotos y el sistema guardará, cifrada, ' +
  'una representación matemática de tu rostro (no las fotos). Se usa solo para verificar tu identidad al marcar. ' +
  'Talento Humano puede reiniciarla si cambias de apariencia o hubo un error, y se borra cuando tu cuenta se desactiva. ' +
  'Al continuar aceptas este tratamiento de tus datos biométricos (Ley Orgánica de Protección de Datos Personales).'

export type ResultadoRegistro = { ok: true } | { ok: false; mensaje: string; foto: number | null }

/** «Foto 2: La foto salió borrosa…» → 2. Null si el error no es de una foto concreta. */
export function fotoConProblema(mensaje: string): number | null {
  const m = /^Foto (\d+):/.exec(mensaje)
  return m ? Number(m[1]) : null
}

/** Manda el consentimiento y las fotos (base64). Las fotos solo viajan: el servidor no las guarda. */
export async function registrarRostro(fotosBase64: string[]): Promise<ResultadoRegistro> {
  try {
    await api('/rostro/registro', {
      method: 'POST',
      body: { consentimiento: true, fotos: fotosBase64 },
      esperaMaxMs: 45_000, // varias fotos por una red móvil
    })
    return { ok: true }
  } catch (e) {
    const mensaje = e instanceof ApiError ? e.message : 'No se pudo registrar tu rostro. Inténtalo de nuevo.'
    return { ok: false, mensaje, foto: fotoConProblema(mensaje) }
  }
}
