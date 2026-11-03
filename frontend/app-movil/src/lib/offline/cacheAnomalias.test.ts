import type { Anomalia } from '../anomalias'
import { obtenerAlmacen } from './almacen'
import { AlmacenMemoria } from './almacenMemoria'
import { guardarAnomalias, leerAnomalias } from './cacheAnomalias'

const LISTA: Anomalia[] = [
  { id: 'a1', caso: 'A-1', tipo: 'sin_ingreso', estado: 'pendiente', detalle: null, creada: '2026-10-15T13:00:00Z', vence: '2026-10-17T13:00:00Z', puede_justificar: true },
]
const almacen = () => obtenerAlmacen() as AlmacenMemoria
beforeEach(() => { almacen().cache.clear() })

describe('copia de los avisos', () => {
  it('lo que se guarda se lee igual', async () => {
    await guardarAnomalias('u-1', LISTA)
    expect(await leerAnomalias('u-1')).toEqual(LISTA)
  })

  it('cada persona tiene su copia', async () => {
    await guardarAnomalias('u-1', LISTA)
    expect(await leerAnomalias('u-2')).toBeNull()
  })

  it('una lista vacía también se guarda (no es lo mismo que no tener copia)', async () => {
    await guardarAnomalias('u-1', [])
    expect(await leerAnomalias('u-1')).toEqual([])
  })

  it('una copia dañada o con otra forma se ignora', async () => {
    await almacen().guardarCache('avisos:u-1', '{no es json')
    expect(await leerAnomalias('u-1')).toBeNull()
    await almacen().guardarCache('avisos:u-1', JSON.stringify([{ nada: 1 }]))
    expect(await leerAnomalias('u-1')).toBeNull()
  })
})
