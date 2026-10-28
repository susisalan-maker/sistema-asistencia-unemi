import type { ClaveCreada, FirmaDispositivoNativa } from '../../../modules/firma-dispositivo'

// Node trae la criptografía; el proyecto no instala los tipos de Node (solo lo usan las pruebas), así que se carga sin tipos.
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { createHash, createPublicKey, generateKeyPairSync, sign, verify } = require('node:crypto') as any
const { Buffer } = require('node:buffer') as any
type KeyObject = any

/**
 * Ayudas de las pruebas de la firma. `crearNativoFalso` hace lo que el chip de seguridad del celular, con criptografía real
 * (claves P-256 y firmas ECDSA/SHA-256 en DER de Node): así se comprueba de verdad que lo firmado se puede verificar y que
 * cualquier cambio lo invalida. Lo único que no puede probarse aquí es el código Kotlin / Swift (ver PRUEBA-LOCAL.md).
 */
export function expoCryptoFalso() {
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
    randomUUID: () => 'uuid-fijo',
    digestStringAsync: async (_algoritmo: string, dato: string, opciones?: { encoding?: 'hex' | 'base64' }) =>
      createHash('sha256').update(dato, 'utf8').digest(opciones?.encoding ?? 'hex'),
  }
}

export type NativoFalso = jest.Mocked<FirmaDispositivoNativa> & {
  /** ¿La firma es de esa clave y de ese mensaje? (Verifica con la clave pública, como el servidor.) */
  verificar(alias: string, mensaje: string, firmaB64: string): boolean
  alias(): string[]
}

export function crearNativoFalso(opciones: { soportado?: boolean; cadena?: string[] | null } = {}): NativoFalso {
  const claves = new Map<string, { privada: KeyObject; publica: string }>()
  const cadena = opciones.cadena === undefined ? null : opciones.cadena
  const falso = {
    soportado: jest.fn(() => opciones.soportado ?? true),
    existeClave: jest.fn((alias: string) => claves.has(alias)),
    clavePublica: jest.fn((alias: string) => claves.get(alias)?.publica ?? null),
    cadena: jest.fn((_alias: string) => cadena),
    borrarClave: jest.fn((alias: string) => { claves.delete(alias) }),
    crearClaveAsync: jest.fn(async (alias: string, _desafio: string): Promise<ClaveCreada> => {
      const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      const publica = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
      claves.set(alias, { privada: privateKey, publica })
      return { clavePublica: publica, ...(cadena ? { cadena } : {}), nivel: 'tee' }
    }),
    firmarAsync: jest.fn(async (alias: string, mensaje: string) => {
      const k = claves.get(alias)
      if (!k) throw new Error('No hay una clave con ese alias')
      return sign('sha256', Buffer.from(mensaje, 'utf8'), { key: k.privada, dsaEncoding: 'der' }).toString('base64')
    }),
    verificar(alias: string, mensaje: string, firmaB64: string) {
      const k = claves.get(alias)
      if (!k) return false
      const publica = createPublicKey({ key: Buffer.from(k.publica, 'base64'), format: 'der', type: 'spki' })
      return verify('sha256', Buffer.from(mensaje, 'utf8'), { key: publica, dsaEncoding: 'der' }, Buffer.from(firmaB64, 'base64'))
    },
    alias: () => [...claves.keys()],
  }
  return falso as unknown as NativoFalso
}

/** Lo que las pruebas ponen como «el módulo nativo» (null = esta compilación no lo trae, como Expo Go). */
export const modulo: { actual: FirmaDispositivoNativa | null } = { actual: null }
