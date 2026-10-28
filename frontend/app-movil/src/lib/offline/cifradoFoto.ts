import { gcm } from '@noble/ciphers/aes.js'
import { getRandomBytes } from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

/**
 * Cifrado de la selfie guardada en el celular mientras la marcación espera conexión.
 *
 * Qué hace: la foto se guarda en SQLite cifrada con AES-256-GCM. La clave (256 bits, aleatoria, una por instalación) vive en
 * `expo-secure-store`, que en Android la protege con el Keystore y en iOS con el Keychain: no está en la base de datos ni
 * en ningún archivo común. Cada foto usa su propio nonce de 96 bits y el id de la marcación va como dato autenticado, así que
 * (1) dos fotos iguales no dan el mismo texto cifrado, (2) cualquier cambio a lo guardado se detecta al descifrar y (3) una
 * foto no se puede pasar a otra marcación. Se descifra solo en memoria, justo antes de enviarla.
 *
 * Qué protege: lo que hay en disco (copia de la base, celular perdido, archivos leídos desde otra app o desde un
 * computador sin acceso root). Qué NO protege: un celular con root donde alguien enganche la app mientras corre (ahí la
 * foto está descifrada en memoria, como en cualquier app). Ese caso lo cubren la firma de la marcación y la verificación del
 * servidor, no este cifrado. Explicación completa en docs/logica-negocio.md, «Cifrado de la foto en el celular».
 *
 * La firma de la marcación (lib/firma) se calcula sobre la foto SIN cifrar y esta se descifra antes de enviar. Se cifra el texto
 * base64 tal cual (no los bytes de la imagen), así que al descifrar sale EXACTAMENTE la misma cadena: el servidor recibe lo
 * mismo de siempre y la firma sigue valiendo.
 */

/** Todo texto cifrado empieza así. El base64 no usa «:», por lo que una foto sin cifrar (de una versión anterior) no se confunde. */
export const PREFIJO = 'fc1:'
export const CLAVE_EN_SECURE_STORE = 'asistencia.foto.clave.v1'
const LONGITUD_CLAVE = 32
const LONGITUD_NONCE = 12

export class ErrorDeCifrado extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ErrorDeCifrado.prototype)
    this.name = 'ErrorDeCifrado'
  }
}

// ── base64 ⇄ bytes (sin depender de atob/btoa, que no existen en todos los motores) ──────────────────────────────────
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const INVERSO: Record<string, number> = Object.fromEntries([...ALFABETO].map((c, i) => [c, i]))

export function bytesABase64(b: Uint8Array): string {
  const trozos: string[] = []
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    trozos.push(
      ALFABETO[(n >> 18) & 63] + ALFABETO[(n >> 12) & 63] +
      (i + 1 < b.length ? ALFABETO[(n >> 6) & 63] : '=') + (i + 2 < b.length ? ALFABETO[n & 63] : '='),
    )
  }
  return trozos.join('')
}

export function base64ABytes(texto: string): Uint8Array {
  const limpio = texto.replace(/[\r\n\s]/g, '')
  if (limpio.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(limpio)) throw new ErrorDeCifrado('Texto base64 inválido')
  const relleno = limpio.endsWith('==') ? 2 : limpio.endsWith('=') ? 1 : 0
  const salida = new Uint8Array((limpio.length / 4) * 3 - relleno)
  let k = 0
  for (let i = 0; i < limpio.length; i += 4) {
    const n = (INVERSO[limpio[i]] << 18) | (INVERSO[limpio[i + 1]] << 12) | ((INVERSO[limpio[i + 2]] ?? 0) << 6) | (INVERSO[limpio[i + 3]] ?? 0)
    if (k < salida.length) salida[k++] = (n >> 16) & 255
    if (k < salida.length) salida[k++] = (n >> 8) & 255
    if (k < salida.length) salida[k++] = n & 255
  }
  return salida
}

// ── la clave ─────────────────────────────────────────────────────────────────────────────────────────────────────────
let clave: Promise<Uint8Array> | null = null

/** La clave de este celular: la lee del almacén seguro o, la primera vez, la crea y la guarda ahí. Nunca sale de ese almacén. */
function obtenerClave(): Promise<Uint8Array> {
  clave ??= (async () => {
    if (!(await SecureStore.isAvailableAsync())) throw new ErrorDeCifrado('Este dispositivo no tiene almacenamiento seguro para cifrar la foto')
    const opciones = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
    const guardada = await SecureStore.getItemAsync(CLAVE_EN_SECURE_STORE, opciones)
    if (guardada) {
      const bytes = base64ABytes(guardada)
      if (bytes.length !== LONGITUD_CLAVE) throw new ErrorDeCifrado('La clave de cifrado guardada está dañada')
      return bytes
    }
    const nueva = getRandomBytes(LONGITUD_CLAVE)
    await SecureStore.setItemAsync(CLAVE_EN_SECURE_STORE, bytesABase64(nueva), opciones)
    return nueva
  })().catch((e) => {
    clave = null   // si falló, el próximo intento vuelve a probar
    throw e instanceof ErrorDeCifrado ? e : new ErrorDeCifrado(`No se pudo obtener la clave de cifrado: ${e instanceof Error ? e.message : String(e)}`)
  })
  return clave
}

/** Solo para las pruebas: olvida la clave en memoria (la de SecureStore no se toca). */
export function olvidarClaveEnMemoria() {
  clave = null
}

// ── cifrar / descifrar ───────────────────────────────────────────────────────────────────────────────────────────────
const aBytes = (s: string) => new TextEncoder().encode(s)

export function estaCifrada(texto: string): boolean {
  return texto.startsWith(PREFIJO)
}

/**
 * Cifra la foto (la cadena base64 de la selfie). `id` es el de la marcación y queda atado al texto cifrado.
 * Devuelve `fc1:` + base64(nonce ‖ texto cifrado ‖ etiqueta de autenticación). Lanza `ErrorDeCifrado` si no se pudo.
 */
export async function cifrarFoto(foto: string, id: string): Promise<string> {
  const k = await obtenerClave()
  try {
    const nonce = getRandomBytes(LONGITUD_NONCE)
    const cifrado = gcm(k, nonce, aBytes(id)).encrypt(aBytes(foto))
    const salida = new Uint8Array(nonce.length + cifrado.length)
    salida.set(nonce, 0)
    salida.set(cifrado, nonce.length)
    return PREFIJO + bytesABase64(salida)
  } catch (e) {
    throw e instanceof ErrorDeCifrado ? e : new ErrorDeCifrado(`No se pudo cifrar la foto: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * Descifra la foto y devuelve el mismo base64 que se cifró. Lanza `ErrorDeCifrado` si el texto fue alterado, si es de otra
 * marcación o si la clave no corresponde.
 */
export async function descifrarFoto(texto: string, id: string): Promise<string> {
  if (!estaCifrada(texto)) throw new ErrorDeCifrado('La foto guardada no está cifrada')
  const k = await obtenerClave()
  try {
    const datos = base64ABytes(texto.slice(PREFIJO.length))
    if (datos.length < LONGITUD_NONCE + 16) throw new Error('texto demasiado corto')
    const claro = gcm(k, datos.slice(0, LONGITUD_NONCE), aBytes(id)).decrypt(datos.slice(LONGITUD_NONCE))
    return new TextDecoder().decode(claro)
  } catch (e) {
    throw new ErrorDeCifrado('La foto guardada no se pudo descifrar (fue alterada o no corresponde a esta marcación)')
  }
}
