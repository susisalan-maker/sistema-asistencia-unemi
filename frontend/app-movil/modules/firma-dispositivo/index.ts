import { requireOptionalNativeModule } from 'expo'

/** Dónde vive la clave: el chip de seguridad de Android (StrongBox, TEE), el Secure Enclave de iOS, o el software (sin protección de hardware). */
export type NivelClave = 'strongbox' | 'tee' | 'enclave' | 'software'

export interface ClaveCreada {
  /** Clave pública P-256 en formato SubjectPublicKeyInfo (DER), en base64. */
  clavePublica: string
  /** Android: los certificados (DER, base64) que el chip emite para esa clave, la clave primero. No hay en iOS ni si el celular no pudo emitirlos. */
  cadena?: string[]
  nivel: NivelClave
}

/**
 * Lo que expone el módulo nativo `FirmaDispositivo` (Kotlin en android/, Swift en ios/). La clave privada nace y vive dentro
 * del chip de seguridad del celular: nunca llega aquí. Todo funciona sin internet.
 */
export interface FirmaDispositivoNativa {
  /** ¿Tiene este celular dónde guardar la clave? (El Simulador de iOS no.) */
  soportado(): boolean
  existeClave(alias: string): boolean
  /** La clave pública (SPKI, base64) o null si no hay clave con ese alias. */
  clavePublica(alias: string): string | null
  /** La cadena de certificados de la clave (Android) o null. */
  cadena(alias: string): string[] | null
  borrarClave(alias: string): void
  /** Crea la clave (reemplaza una anterior con el mismo alias). `desafioB64` va dentro de la prueba de hardware de Android. */
  crearClaveAsync(alias: string, desafioB64: string): Promise<ClaveCreada>
  /** Firma `mensaje` (texto UTF-8) con ECDSA y SHA-256. Devuelve la firma en DER, base64. */
  firmarAsync(alias: string, mensaje: string): Promise<string>
}

/**
 * null cuando esta compilación no trae el módulo: Expo Go, la web, o una compilación hecha antes de añadirlo. La app lo
 * trata como «este celular no firma» y sigue funcionando como siempre.
 */
const modulo = requireOptionalNativeModule<FirmaDispositivoNativa>('FirmaDispositivo')
export default modulo
