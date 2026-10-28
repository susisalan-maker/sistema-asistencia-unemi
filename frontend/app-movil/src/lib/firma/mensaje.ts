import * as Crypto from 'expo-crypto'

/**
 * Lo que firma el celular, letra por letra igual a lo que arma el servidor (backend `app/firma_dispositivo.py`,
 * `mensaje_de_marcacion`). Si uno cambia, el otro deja de coincidir: las dos pruebas comparten un caso de referencia.
 */
export const VERSION_MENSAJE = 'asistencia-unemi/marca/v1'
const CONTEXTO_DESAFIO = 'asistencia-unemi/clave/v1'

export interface DatosAFirmar {
  usuario_id: string
  id: string
  tipo: string
  /** ISO 8601, tal como se enviará. */
  fecha_hora: string
  latitud: number
  longitud: number
  dispositivo_id: string
  selfie_b64: string
}

export async function mensajeDeMarcacion(d: DatosAFirmar): Promise<string> {
  const ms = Date.parse(d.fecha_hora)
  if (Number.isNaN(ms)) throw new Error('La hora de la marcación no es válida')
  // La foto va resumida: así la firma la cubre sin llevar la imagen dentro.
  const selfie = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, d.selfie_b64, { encoding: Crypto.CryptoEncoding.HEX })
  return [VERSION_MENSAJE, d.usuario_id, d.id, d.tipo, String(ms), d.latitud.toFixed(6), d.longitud.toFixed(6), d.dispositivo_id, selfie].join('\n')
}

/**
 * Desafío (base64 de 32 bytes) que se pone en la prueba de hardware de la clave: la liga a ESTA cuenta y ESTE celular. El
 * servidor calcula el mismo (`desafio_de_clave`), así que no hace falta pedírselo.
 */
export async function desafioDeClave(usuarioId: string, dispositivoId: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${CONTEXTO_DESAFIO}|${usuarioId}|${dispositivoId}`, {
    encoding: Crypto.CryptoEncoding.BASE64,
  })
}
