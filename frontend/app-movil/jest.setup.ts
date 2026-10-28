// Evita cargar módulos nativos de almacenamiento en las pruebas.
jest.mock('expo-sqlite/localStorage/install', () => ({}))

// Sin conexión: la red se simula y las marcaciones guardadas viven en memoria (no hay SQLite en las pruebas).
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'))
jest.mock('./src/lib/offline/almacen', () => {
  const { AlmacenMemoria } = require('./src/lib/offline/almacenMemoria')
  const unico = new AlmacenMemoria()
  return { obtenerAlmacen: () => unico }
})

// Almacén seguro (Keystore/Keychain) simulado en memoria y bytes aleatorios de verdad para las claves y nonces.
jest.mock('expo-secure-store', () => {
  const guardado = new Map<string, string>()
  const estado = { disponible: true }   // las pruebas lo apagan para simular un celular sin almacén seguro
  return {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    isAvailableAsync: async () => estado.disponible,
    getItemAsync: async (k: string) => guardado.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { guardado.set(k, v) },
    deleteItemAsync: async (k: string) => { guardado.delete(k) },
    __guardado: guardado,
    __estado: estado,
  }
})
jest.mock('expo-crypto', () => {
  const real = jest.requireActual('expo-crypto')
  const { randomBytes } = require('node:crypto')
  return { ...real, getRandomBytes: (n: number) => new Uint8Array(randomBytes(n)) }
})
