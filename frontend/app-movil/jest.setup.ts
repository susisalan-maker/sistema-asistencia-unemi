// Evita cargar módulos nativos de almacenamiento en las pruebas.
jest.mock('expo-sqlite/localStorage/install', () => ({}))
