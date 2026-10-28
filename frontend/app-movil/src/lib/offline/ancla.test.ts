import { guardarAncla, relojDeMarca } from './ancla'
import { obtenerAlmacen } from './almacen'
import type { AlmacenMemoria } from './almacenMemoria'

let mockArranque: number | Error = 0
jest.mock('expo-device', () => ({
  getUptimeAsync: async () => { if (mockArranque instanceof Error) throw mockArranque; return mockArranque },
}))

const HORA = { t: '2026-10-15T12:50:00.000+00:00', firma: 'f'.repeat(64) }
const almacen = () => obtenerAlmacen() as AlmacenMemoria

beforeEach(() => { almacen().cache.clear(); mockArranque = 5_000_000 })

describe('Hora del servidor como ancla', () => {
  it('guarda la hora firmada con el tiempo que llevaba encendido el celular y arma la prueba al marcar', async () => {
    await guardarAncla('u-1', HORA)
    mockArranque = 5_000_000 + 600_000   // pasaron 10 minutos con el celular encendido
    expect(await relojDeMarca('u-1')).toEqual({
      servidor_t: HORA.t, firma: HORA.firma, arranque_ancla_ms: 5_000_000, arranque_marca_ms: 5_600_000,
    })
  })

  it('cada marcación usa la última hora que dio el servidor', async () => {
    await guardarAncla('u-1', HORA)
    mockArranque = 5_300_000
    await guardarAncla('u-1', { t: '2026-10-15T12:55:00.000+00:00', firma: 'a'.repeat(64) })
    mockArranque = 5_400_000
    expect(await relojDeMarca('u-1')).toMatchObject({ servidor_t: '2026-10-15T12:55:00.000+00:00', arranque_ancla_ms: 5_300_000, arranque_marca_ms: 5_400_000 })
  })

  it('sin hora guardada no hay prueba (primera vez que se usa la app)', async () => {
    expect(await relojDeMarca('u-1')).toBeNull()
  })

  it('si el celular se reinició desde entonces, el contador volvió a cero y no hay prueba', async () => {
    await guardarAncla('u-1', HORA)
    mockArranque = 30_000
    expect(await relojDeMarca('u-1')).toBeNull()
  })

  it('si no se puede leer el contador, no hay prueba ni se guarda nada', async () => {
    mockArranque = new Error('no disponible')
    await guardarAncla('u-1', HORA)
    expect(almacen().cache.size).toBe(0)
    mockArranque = 5_000_000
    await guardarAncla('u-1', HORA)
    mockArranque = new Error('no disponible')
    expect(await relojDeMarca('u-1')).toBeNull()
  })

  it('una respuesta del servidor sin hora firmada (servidor anterior) no guarda nada', async () => {
    await guardarAncla('u-1', undefined)
    await guardarAncla('u-1', { t: '', firma: '' })
    expect(almacen().cache.size).toBe(0)
  })

  it('en un celular compartido, cada persona tiene su hora', async () => {
    await guardarAncla('u-1', HORA)
    mockArranque = 5_100_000
    expect(await relojDeMarca('u-2')).toBeNull()
    expect(await relojDeMarca('u-1')).not.toBeNull()
  })

  it('una copia dañada se ignora', async () => {
    await almacen().guardarCache('ancla_reloj:u-1', '{no es json')
    expect(await relojDeMarca('u-1')).toBeNull()
    await almacen().guardarCache('ancla_reloj:u-1', JSON.stringify({ servidor_t: 3 }))
    expect(await relojDeMarca('u-1')).toBeNull()
  })
})
