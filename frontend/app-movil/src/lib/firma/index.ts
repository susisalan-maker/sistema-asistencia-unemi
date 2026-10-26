import { Platform } from 'react-native'
import nativo from '../../../modules/firma-dispositivo'
import { ApiError, api } from '../api'
import { desafioDeClave, mensajeDeMarcacion, type DatosAFirmar } from './mensaje'

/**
 * Firma de las marcaciones sin conexión con una clave del chip de seguridad del celular (Android Keystore / iOS Secure
 * Enclave). Explicación completa en docs/logica-negocio.md, «Firma de la marcación sin conexión», y en el backend
 * `app/firma_dispositivo.py`.
 *
 * En una frase: la clave privada se crea dentro del chip y no se puede sacar (ni con root ni con el modo desarrollador); cada
 * marcación sin conexión se firma al hacerla, y el servidor comprueba la firma con la clave pública que el celular registró
 * al vincularse. Si alguien cambia lo guardado (hora, lugar, foto…) antes de que se envíe, la firma deja de valer.
 *
 * Esta carpeta solo firma lo que va a la cola sin conexión. Marcar en línea no usa la firma: ahí la hora la pone el servidor.
 *
 * Sin el módulo nativo (Expo Go, web) nada de esto ocurre y la app funciona como antes; el servidor acepta marcaciones sin
 * firma de las cuentas que nunca registraron una clave.
 */

/** Un error al firmar con una clave que sí existe: no se guarda la marcación, para no mandar una que el servidor rechazaría. */
export class ErrorDeFirma extends Error {
  constructor(message: string) {
    super(message)
    Object.setPrototypeOf(this, ErrorDeFirma.prototype)
    this.name = 'ErrorDeFirma'
  }
}

/** Cada persona tiene su propia clave en el celular (un celular compartido no mezcla las de dos cuentas). */
const aliasDe = (usuarioId: string) => `asistencia.marca.${usuarioId}`

/** ¿Este celular puede firmar? (La compilación trae el módulo y el chip de seguridad existe.) */
export function puedeFirmar(): boolean {
  try {
    return !!nativo && nativo.soportado()
  } catch {
    return false
  }
}

/**
 * Firma la marcación. Devuelve null si este celular no firma o aún no tiene clave (se guarda sin firma y el servidor decide);
 * lanza `ErrorDeFirma` si hay clave pero la firma falló.
 */
export async function firmarMarcacion(usuarioId: string, datos: Omit<DatosAFirmar, 'usuario_id'>): Promise<string | null> {
  if (!puedeFirmar() || !nativo) return null
  const alias = aliasDe(usuarioId)
  if (!nativo.existeClave(alias)) return null
  try {
    return await nativo.firmarAsync(alias, await mensajeDeMarcacion({ ...datos, usuario_id: usuarioId }))
  } catch (e) {
    throw new ErrorDeFirma(`No se pudo firmar la marcación con la seguridad de tu celular. ${e instanceof Error ? e.message : ''}`.trim())
  }
}

export type EstadoClave =
  /** Este celular no firma (Expo Go, web, simulador): nada que hacer. */
  | 'no_disponible'
  /** La clave del celular está registrada en el servidor. */
  | 'registrada'
  /** La cuenta ya tiene otra clave registrada (otro celular, o la app se reinstaló): lo resuelve Talento Humano. */
  | 'distinta'
  /** No se pudo ahora (sin red, servidor); se vuelve a intentar la próxima vez. */
  | 'error'

export interface ResultadoClave {
  estado: EstadoClave
  mensaje?: string
}

export const MENSAJE_CLAVE_DISTINTA =
  'La clave de seguridad de este celular no es la que tu cuenta tiene registrada (¿reinstalaste la app?). ' +
  'Puedes marcar con internet, pero las marcaciones sin conexión se rechazarán. Pide a Talento Humano que reinicie tu celular.'

// Los intentos que el servidor rechazó, para no insistir en cada pantalla durante la misma ejecución de la app.
const rechazadas = new Set<string>()

/** Para las pruebas. */
export function olvidarRechazos() {
  rechazadas.clear()
}

/**
 * Deja la clave de este celular registrada en el servidor. Se llama cada vez que la app consulta su jornada y el celular es
 * el vinculado; es barata cuando todo está en orden (compara la clave local con la que dice el servidor y no hace nada más):
 *
 *   - el servidor ya tiene ESTA clave                       → listo.
 *   - el servidor no tiene ninguna                           → se crea la clave si falta y se registra.
 *   - el servidor tiene otra (reinstalación / otro celular)  → se intenta registrar la de este; si el servidor no lo permite
 *     (solo lo hace con la prueba de hardware de un celular sin modificar), se avisa a la persona.
 */
export async function sincronizarClave(args: {
  usuarioId: string
  dispositivoId: string
  /** Lo que el servidor dice tener (`clave_publica` de GET /marcaciones/hoy) o null. */
  clavePublicaServidor: string | null
}): Promise<ResultadoClave> {
  if (!puedeFirmar() || !nativo) return { estado: 'no_disponible' }
  const { usuarioId, dispositivoId, clavePublicaServidor: servidor } = args
  const alias = aliasDe(usuarioId)
  try {
    let local = nativo.existeClave(alias) ? nativo.clavePublica(alias) : null
    if (local && local === servidor) return { estado: 'registrada' }

    // «Ya lo intenté con esta clave y el servidor dijo que no»: la huella incluye la clave local, así que si cambia se reintenta.
    const huella = (clave: string | null) => `${usuarioId}|${dispositivoId}|${servidor ?? ''}|${clave ?? ''}`
    if (servidor && local && rechazadas.has(huella(local))) return { estado: 'distinta', mensaje: MENSAJE_CLAVE_DISTINTA }

    let cadena: string[] | null | undefined
    if (!local) {
      const creada = await nativo.crearClaveAsync(alias, await desafioDeClave(usuarioId, dispositivoId))
      local = creada.clavePublica
      cadena = creada.cadena
    } else {
      cadena = nativo.cadena(alias)
    }

    try {
      await api('/dispositivo/clave', {
        method: 'POST',
        body: {
          dispositivo_id: dispositivoId,
          clave_publica: local,
          plataforma: Platform.OS === 'ios' ? 'ios' : 'android',
          ...(cadena && cadena.length > 0 ? { cadena } : {}),
        },
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && servidor) {
        rechazadas.add(huella(local))
        return { estado: 'distinta', mensaje: MENSAJE_CLAVE_DISTINTA }
      }
      throw e
    }
    return { estado: 'registrada' }
  } catch (e) {
    // Sin red u otro fallo pasajero: no molesta a la persona, se intenta la próxima vez.
    if (!(e instanceof ApiError && e.status === 0)) console.warn('No se pudo registrar la clave de seguridad del celular', e)
    return { estado: 'error', mensaje: e instanceof Error ? e.message : undefined }
  }
}
