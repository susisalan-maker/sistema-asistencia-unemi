import { act, render, screen, waitFor } from '@testing-library/react-native'
import NetInfo from '@react-native-community/netinfo'
import { AppState, Text } from 'react-native'
import { ApiError, api } from '../api'
import { obtenerAlmacen } from './almacen'
import { AlmacenMemoria } from './almacenMemoria'
import { pendiente, respuestaOk } from './ayudasDePrueba'
import { REINTENTO_MS, SincronizacionProvider, useSincronizacion, type Sincronizacion } from './SincronizacionContext'
import type { DatosMarcacion } from './tipos'

jest.mock('../supabase', () => ({ supabase: {} }))
jest.mock('../api', () => ({ ...jest.requireActual('../api'), api: jest.fn() }))

const almacen = () => obtenerAlmacen() as AlmacenMemoria
let sync: Sincronizacion
function Sonda() {
  sync = useSincronizacion()
  return <Text>{`pendientes=${sync.pendientes.length} descartadas=${sync.descartadas.length} enLinea=${sync.enLinea} version=${sync.version}`}</Text>
}
const estado = () => screen.getByText(/^pendientes=/).props.children as string

// Captura los avisos que el contexto registra (red y app al frente) para dispararlos desde la prueba.
let avisoRed: (s: { isConnected: boolean | null }) => void
let avisoApp: (e: string) => void
const quitarRed = jest.fn()
const quitarApp = jest.fn()

const DATOS: DatosMarcacion = {
  id: 'nuevo', tipo: 'ingreso', fecha_hora: '2026-10-15T08:00:00-05:00', latitud: -2.14, longitud: -79.6, precision_m: 8,
  ubicacion_simulada: false, dispositivo_id: 'cel-1', selfie_b64: 'FOTO',
}

async function montar(usuarioId: string | null = 'u-1') {
  await render(<SincronizacionProvider usuarioId={usuarioId}><Sonda /></SincronizacionProvider>)
  await waitFor(() => expect(sync).toBeDefined())
}
const asentar = () => act(async () => { await Promise.resolve() })

beforeEach(() => {
  almacen().filas.clear(); almacen().cache.clear()
  jest.mocked(api).mockReset()
  jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
  jest.mocked(NetInfo.addEventListener).mockImplementation(((fn: typeof avisoRed) => { avisoRed = fn; return quitarRed }) as never)
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_t: string, fn: typeof avisoApp) => { avisoApp = fn; return { remove: quitarApp } }) as never)
  quitarRed.mockClear(); quitarApp.mockClear()
})
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

describe('SincronizacionProvider', () => {
  it('al entrar muestra y envía lo que había quedado guardado', async () => {
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await montar()
    await waitFor(() => expect(estado()).toContain('pendientes=0'))
    expect(api).toHaveBeenCalledTimes(1)
    expect(estado()).toContain('version=1')    // algo llegó: las pantallas deben recargar
  })

  it('manda la marcación con la hora del celular y avisando que fue sin conexión', async () => {
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await montar()
    await waitFor(() => expect(api).toHaveBeenCalled())
    const [ruta, opciones] = jest.mocked(api).mock.calls[0] as unknown as [string, { method: string; body: Record<string, unknown>; esperaMaxMs: number }]
    expect(ruta).toBe('/marcaciones')
    expect(opciones.method).toBe('POST')
    expect(opciones.esperaMaxMs).toBeGreaterThan(15_000)
    expect(opciones.body).toEqual({
      id: 'a', tipo: 'ingreso', fecha_hora: '2026-10-15T08:00:00-05:00', latitud: -2.14, longitud: -79.6, precision_m: 8,
      ubicacion_simulada: false, origen: 'app', dispositivo_id: 'cel-1', sin_conexion: true, selfie_b64: 'FOTO',
    })
  })

  it('sin sesión no guarda ni envía nada', async () => {
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await montar(null)
    await asentar()
    expect(api).not.toHaveBeenCalled()
    expect(estado()).toContain('pendientes=0')
    await expect(sync.guardar(DATOS)).rejects.toThrow()
  })

  it('guardar deja la marcación en el celular y la muestra como pendiente (sin intentar enviarla)', async () => {
    await montar()
    await act(async () => { expect(await sync.guardar(DATOS)).toEqual({ estado: 'guardada' }) })
    expect(api).not.toHaveBeenCalled()
    expect(estado()).toContain('pendientes=1')
    expect(await almacen().selfie('nuevo')).toBe('FOTO')
    expect(sync.pendientes[0]).toMatchObject({ id: 'nuevo', usuario_id: 'u-1', estado: 'pendiente' })
  })

  it('guardar con enviarYa la manda y devuelve la respuesta del servidor', async () => {
    await montar()
    let r: Awaited<ReturnType<Sincronizacion['guardar']>> | undefined
    await act(async () => { r = await sync.guardar(DATOS, { enviarYa: true }) })
    expect(r).toMatchObject({ estado: 'enviada', respuesta: { marcacion: { id: 'nuevo' } } })
    expect(estado()).toContain('pendientes=0')
    expect(almacen().filas.size).toBe(0)
  })

  it('guardar con enviarYa sin red la deja guardada', async () => {
    await montar()
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'No hay conexión con el servidor'))
    let r: Awaited<ReturnType<Sincronizacion['guardar']>> | undefined
    await act(async () => { r = await sync.guardar(DATOS, { enviarYa: true }) })
    expect(r).toEqual({ estado: 'guardada' })
    expect(estado()).toContain('pendientes=1')
  })

  it('guardar con enviarYa devuelve el motivo si el servidor la rechaza y no la deja en la lista', async () => {
    await montar()
    jest.mocked(api).mockRejectedValue(new ApiError(409, 'Ahora te corresponde marcar «salida almuerzo»'))
    let r: Awaited<ReturnType<Sincronizacion['guardar']>> | undefined
    await act(async () => { r = await sync.guardar(DATOS, { enviarYa: true }) })
    expect(r).toEqual({ estado: 'rechazada', motivo: 'Ahora te corresponde marcar «salida almuerzo»' })
    expect(estado()).toContain('pendientes=0 descartadas=0')
  })

  it('una marcación rechazada al sincronizar queda en «descartadas» hasta que la persona pulsa «Entendido»', async () => {
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    jest.mocked(api).mockRejectedValue(new ApiError(422, 'Pasaron más de 48 horas desde que marcaste', { codigo: 'marcacion_expirada' }))
    await montar()
    await waitFor(() => expect(estado()).toContain('descartadas=1'))
    expect(sync.descartadas[0]?.ultimo_error).toMatch(/48 horas/)
    await act(async () => { await sync.descartar('a') })
    expect(estado()).toContain('descartadas=0')
    expect(almacen().filas.size).toBe(0)
  })

  it('cuando vuelve la red envía lo guardado', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'sin red'))
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await montar()
    await waitFor(() => expect(sync.pendientes).toHaveLength(1))
    await act(async () => { avisoRed({ isConnected: false }) })
    expect(estado()).toContain('enLinea=false')

    jest.mocked(api).mockClear()
    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { avisoRed({ isConnected: true }) })
    await waitFor(() => expect(estado()).toContain('pendientes=0'))
    expect(estado()).toContain('enLinea=true')
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('un aviso de red que sigue conectada no dispara envíos de más', async () => {
    await montar()
    await asentar()
    jest.mocked(api).mockClear()
    await act(async () => { avisoRed({ isConnected: true }); avisoRed({ isConnected: null }) })
    expect(api).not.toHaveBeenCalled()
  })

  it('al volver a la app (primer plano) intenta enviar; en segundo plano no', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'sin red'))
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await montar()
    await waitFor(() => expect(sync.pendientes).toHaveLength(1))
    jest.mocked(api).mockClear()
    await act(async () => { avisoApp('background') })
    expect(api).not.toHaveBeenCalled()
    await act(async () => { avisoApp('active') })
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('mientras quede algo por enviar reintenta cada minuto, y deja de hacerlo cuando ya no queda nada', async () => {
    jest.useFakeTimers()
    const avanzar = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms) })
    jest.mocked(api).mockRejectedValue(new ApiError(503, 'ocupado'))
    await almacen().insertar(pendiente('a', 'ingreso', '08:00'), 'FOTO')
    await render(<SincronizacionProvider usuarioId="u-1"><Sonda /></SincronizacionProvider>)
    await avanzar(10)
    expect(sync.pendientes).toHaveLength(1)
    expect(api).toHaveBeenCalledTimes(1)       // el primer intento, al entrar

    await avanzar(REINTENTO_MS)
    expect(api).toHaveBeenCalledTimes(2)
    await avanzar(REINTENTO_MS)
    expect(api).toHaveBeenCalledTimes(3)

    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await avanzar(REINTENTO_MS)
    expect(api).toHaveBeenCalledTimes(4)
    expect(sync.pendientes).toHaveLength(0)
    await avanzar(REINTENTO_MS * 3)             // ya no queda nada: no se vuelve a llamar
    expect(api).toHaveBeenCalledTimes(4)
  })

  it('«sincronizarAhora» devuelve el resultado', async () => {
    await montar()
    await act(async () => { await sync.guardar(DATOS) })
    let r: Awaited<ReturnType<Sincronizacion['sincronizarAhora']>> = null
    await act(async () => { r = await sync.sincronizarAhora() })
    expect(r).toMatchObject({ enviadas: [{ id: 'nuevo' }], descartadas: [], detenida: null })
  })

  it('si el almacenamiento falla al sincronizar no rompe la app', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(almacen(), 'listar').mockRejectedValue(new Error('disco lleno'))
    await montar()
    await asentar()
    let r: unknown = 'sin llamar'
    await act(async () => { r = await sync.sincronizarAhora() })
    expect(r).toBeNull()
  })

  it('al desmontar deja de escuchar la red y la app', async () => {
    const { unmount } = await render(<SincronizacionProvider usuarioId="u-1"><Sonda /></SincronizacionProvider>)
    await asentar()
    await act(async () => { unmount() })
    expect(quitarRed).toHaveBeenCalled()
    expect(quitarApp).toHaveBeenCalled()
  })

  it('fuera del proveedor, el contexto es inofensivo (las pantallas se pueden usar sin él)', async () => {
    function Suelta() {
      const s = useSincronizacion()
      return <Text>{`${s.usuarioId} ${s.enLinea} ${s.pendientes.length}`}</Text>
    }
    await render(<Suelta />)
    expect(screen.getByText('null true 0')).toBeTruthy()
  })
})
