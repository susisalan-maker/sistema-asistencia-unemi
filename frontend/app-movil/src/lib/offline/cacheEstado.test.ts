import type { EstadoHoy, MarcacionResumen } from '../marcacion'
import { obtenerAlmacen } from './almacen'
import { AlmacenMemoria } from './almacenMemoria'
import { guardarEstadoHoy, leerEstadoHoy, registrarMarcacionEnCopia } from './cacheEstado'

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

describe('registrarMarcacionEnCopia', () => {
  const marca = (id: string, tipo: MarcacionResumen['tipo'], hora: string): MarcacionResumen => ({
    id, tipo, fecha_hora: `2026-10-15T${hora}:00-05:00`, sede_id: null, bloque_id: null, origen: 'app', verificacion: 'verificada',
  })

  it('suma la marcación aceptada y avanza «cuál toca»', async () => {
    await guardarEstadoHoy('u-1', ESTADO)
    await registrarMarcacionEnCopia('u-1', marca('m1', 'ingreso', '08:00'))
    const copia = await leerEstadoHoy('u-1')
    expect(copia?.marcaciones.map((m) => m.id)).toEqual(['m1'])
    expect(copia?.siguiente).toBe('salida_almuerzo')
    expect(copia?.ultima?.id).toBe('m1')
  })

  it('si ya estaba (un reintento) no la duplica', async () => {
    await guardarEstadoHoy('u-1', ESTADO)
    await registrarMarcacionEnCopia('u-1', marca('m1', 'ingreso', '08:00'))
    await registrarMarcacionEnCopia('u-1', marca('m1', 'ingreso', '08:00'))
    expect((await leerEstadoHoy('u-1'))?.marcaciones).toHaveLength(1)
  })

  it('no toca una copia de otro día ni inventa una si no hay', async () => {
    await registrarMarcacionEnCopia('u-1', marca('m1', 'ingreso', '08:00'))
    expect(await leerEstadoHoy('u-1')).toBeNull()
    await guardarEstadoHoy('u-1', { ...ESTADO, fecha: '2026-10-14' })
    await registrarMarcacionEnCopia('u-1', marca('m1', 'ingreso', '08:00'))
    expect((await leerEstadoHoy('u-1'))?.marcaciones).toEqual([])
  })
})
