/**
 * Prueba el SQL del almacén real contra un SQLite de verdad (el módulo `node:sqlite` de Node 22.5 o más nuevo), con un
 * adaptador mínimo que imita la parte de `expo-sqlite` que usamos. En un Node más viejo estas pruebas se omiten.
 */
let DatabaseSync: (new (ruta: string) => {
  exec(sql: string): void
  prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }
}) | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseSync = require('node:sqlite').DatabaseSync
} catch {
  DatabaseSync = null
}
const hayNodeSqlite = DatabaseSync !== null

let mockBd: InstanceType<NonNullable<typeof DatabaseSync>>
let mockFallarApertura = false
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: async () => {
    if (mockFallarApertura) throw new Error('disco lleno')
    return {
      execAsync: async (sql: string) => mockBd.exec(sql),
      runAsync: async (sql: string, params: unknown[] = []) => mockBd.prepare(sql).run(...params),
      getAllAsync: async (sql: string, params: unknown[] = []) => mockBd.prepare(sql).all(...params),
      getFirstAsync: async (sql: string, params: unknown[] = []) => mockBd.prepare(sql).get(...params) ?? null,
    }
  },
}))

import { pendiente } from './ayudasDePrueba'
import type { Almacen } from './tipos'

const describirSiHay = hayNodeSqlite ? describe : describe.skip

describirSiHay('AlmacenSqlite', () => {
  let almacen: Almacen
  beforeEach(() => {
    mockFallarApertura = false
    mockBd = new DatabaseSync!(':memory:')
    const { AlmacenSqlite } = jest.requireActual('./almacen') as typeof import('./almacen')
    almacen = new AlmacenSqlite()
  })

  it('guarda una marcación y la lista sin la selfie', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00', { ubicacion_simulada: true, precision_m: null }), 'FOTO')
    const [p] = await almacen.listar('u-1')
    expect(p).toMatchObject({ id: 'a', tipo: 'ingreso', usuario_id: 'u-1', ubicacion_simulada: true, precision_m: null, estado: 'pendiente', intentos: 0 })
    expect(p).not.toHaveProperty('selfie_b64')
    expect(await almacen.selfie('a')).toBe('FOTO')
  })

  it('guarda una selfie grande entera', async () => {
    const grande = 'A'.repeat(3_000_000)
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), grande)
    expect(await almacen.selfie('a')).toHaveLength(3_000_000)
  })

  it('el mismo id dos veces no duplica ni pisa', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO-1')
    await almacen.insertar(pendiente('a', 'ingreso', '09:00'), 'FOTO-2')
    expect(await almacen.listar('u-1')).toHaveLength(1)
    expect(await almacen.selfie('a')).toBe('FOTO-1')
  })

  it('lista de la más antigua a la más reciente y solo las de esa persona', async () => {
    await almacen.insertar(pendiente('tarde', 'salida_almuerzo', '12:00'), 'x')
    await almacen.insertar(pendiente('temprano', 'ingreso', '08:00'), 'x')
    await almacen.insertar(pendiente('ajena', 'ingreso', '07:00', { usuario_id: 'u-2' }), 'x')
    expect((await almacen.listar('u-1')).map((p) => p.id)).toEqual(['temprano', 'tarde'])
    expect((await almacen.listar('u-2')).map((p) => p.id)).toEqual(['ajena'])
  })

  it('registrarIntento suma y guarda el motivo', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), 'x')
    await almacen.registrarIntento('a', 'sin red')
    await almacen.registrarIntento('a', 'servidor caído')
    expect((await almacen.listar('u-1'))[0]).toMatchObject({ intentos: 2, ultimo_error: 'servidor caído' })
  })

  it('descartar marca el rechazo y BORRA la selfie', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await almacen.descartar('a', 'Pasaron más de 48 horas')
    expect((await almacen.listar('u-1'))[0]).toMatchObject({ estado: 'descartada', ultimo_error: 'Pasaron más de 48 horas' })
    expect(await almacen.selfie('a')).toBeNull()
  })

  it('eliminar borra la fila entera', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await almacen.eliminar('a')
    expect(await almacen.listar('u-1')).toEqual([])
    expect(await almacen.selfie('a')).toBeNull()
  })

  it('la copia (cache) se guarda, se reemplaza y se lee', async () => {
    expect(await almacen.leerCache('k')).toBeNull()
    await almacen.guardarCache('k', 'uno')
    await almacen.guardarCache('k', 'dos')
    expect(await almacen.leerCache('k')).toBe('dos')
  })

  it('crear el esquema dos veces (segunda apertura de la app) no falla ni borra datos', async () => {
    await almacen.insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    const { AlmacenSqlite } = jest.requireActual('./almacen') as typeof import('./almacen')
    const otraApertura = new AlmacenSqlite()
    expect((await otraApertura.listar('u-1')).map((p) => p.id)).toEqual(['a'])
  })

  it('si no se puede abrir la base, el siguiente intento vuelve a probar', async () => {
    mockFallarApertura = true
    await expect(almacen.listar('u-1')).rejects.toThrow('disco lleno')
    mockFallarApertura = false
    await expect(almacen.listar('u-1')).resolves.toEqual([])
  })
})
