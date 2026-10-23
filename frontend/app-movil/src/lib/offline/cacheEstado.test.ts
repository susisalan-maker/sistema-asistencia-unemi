import type { EstadoHoy } from '../marcacion'
import { obtenerAlmacen } from './almacen'
import { AlmacenMemoria } from './almacenMemoria'
import { guardarEstadoHoy, leerEstadoHoy } from './cacheEstado'

const ESTADO: EstadoHoy = {
  fecha: '2026-10-15', marcaciones: [], siguiente: 'ingreso', ultima: null, jornada: { inicio: '08:00', fin: '17:00' },
  dispositivo: 'este', rostro_registrado: true, rostro_requerido: true,
}
const almacen = () => obtenerAlmacen() as AlmacenMemoria
beforeEach(() => { almacen().cache.clear() })

describe('copia de la jornada de hoy', () => {
  it('lo que se guarda se lee igual', async () => {
    await guardarEstadoHoy('u-1', ESTADO)
    expect(await leerEstadoHoy('u-1')).toEqual(ESTADO)
  })

  it('cada persona tiene su copia', async () => {
    await guardarEstadoHoy('u-1', ESTADO)
    expect(await leerEstadoHoy('u-2')).toBeNull()
  })

  it('sin copia devuelve null', async () => {
    expect(await leerEstadoHoy('u-1')).toBeNull()
  })

  it('una copia dañada se ignora (no rompe la pantalla)', async () => {
    await almacen().guardarCache('estado_hoy:u-1', '{no es json')
    expect(await leerEstadoHoy('u-1')).toBeNull()
    await almacen().guardarCache('estado_hoy:u-1', JSON.stringify({ algo: 'otro' }))
    expect(await leerEstadoHoy('u-1')).toBeNull()
  })

  it('si el almacenamiento falla, no lanza: la app sigue como sin copia', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const guardar = jest.spyOn(almacen(), 'guardarCache').mockRejectedValueOnce(new Error('disco lleno'))
    await expect(guardarEstadoHoy('u-1', ESTADO)).resolves.toBeUndefined()
    guardar.mockRestore(); aviso.mockRestore()
    jest.spyOn(almacen(), 'leerCache').mockRejectedValueOnce(new Error('roto'))
    expect(await leerEstadoHoy('u-1')).toBeNull()
  })
})
