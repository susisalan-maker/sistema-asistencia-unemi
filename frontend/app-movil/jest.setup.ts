// Evita cargar módulos nativos de almacenamiento en las pruebas.
jest.mock('expo-sqlite/localStorage/install', () => ({}))

// Sin conexión: la red se simula y las marcaciones guardadas viven en memoria (no hay SQLite en las pruebas).
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'))
jest.mock('./src/lib/offline/almacen', () => {
  const { AlmacenMemoria } = require('./src/lib/offline/almacenMemoria')
  const unico = new AlmacenMemoria()
  return { obtenerAlmacen: () => unico }
})
