/**
 * De punta a punta en la app: la marcación se firma al guardarla, la firma viaja con ella al enviarla, y lo que llega al
 * servidor se puede verificar con la clave pública. Si alguien cambia lo guardado en el celular antes de que se envíe
 * (lo que haría quien tiene root o modo desarrollador), la firma que llega ya no corresponde a los datos.
 */
import NetInfo from '@react-native-community/netinfo'
import { act, render, screen, waitFor } from '@testing-library/react-native'
import { AppState, Text } from 'react-native'
import { ApiError, api } from '../api'
import { crearNativoFalso, modulo, type NativoFalso } from '../firma/ayudasDePrueba'
import { mensajeDeMarcacion } from '../firma/mensaje'
import { obtenerAlmacen } from './almacen'
import { AlmacenMemoria } from './almacenMemoria'
import { respuestaOk } from './ayudasDePrueba'
import { SincronizacionProvider, useSincronizacion, type Sincronizacion } from './SincronizacionContext'
import type { DatosMarcacion } from './tipos'

jest.mock('expo-crypto', () => require('../firma/ayudasDePrueba').expoCryptoFalso())
jest.mock('../supabase', () => ({ supabase: {} }))
jest.mock('../api', () => ({ ...jest.requireActual('../api'), api: jest.fn() }))
jest.mock('../../../modules/firma-dispositivo', () => ({ __esModule: true, get default() { return require('../firma/ayudasDePrueba').modulo.actual } }))

const ALIAS = 'asistencia.marca.u-1'
const almacen = () => obtenerAlmacen() as AlmacenMemoria
let sync: Sincronizacion
function Sonda() {
  sync = useSincronizacion()
  return <Text>{`pendientes=${sync.pendientes.length}`}</Text>
}
let nativo: NativoFalso
const DATOS: DatosMarcacion = {
  id: 'm-1', tipo: 'ingreso', fecha_hora: '2026-10-15T13:00:00.000Z', latitud: -2.14, longitud: -79.6, precision_m: 8,
  ubicacion_simulada: false, dispositivo_id: 'android:cel-1', selfie_b64: 'FOTO-DE-ANA',
}

async function montar() {
  await render(<SincronizacionProvider usuarioId="u-1"><Sonda /></SincronizacionProvider>)
  await waitFor(() => expect(sync).toBeDefined())
}
/** Lo último que la app mandó al servidor. */
const enviado = () => {
  const llamadas = jest.mocked(api).mock.calls as unknown as [string, { body: Record<string, unknown> }][]
  return llamadas[llamadas.length - 1]![1].body
}
const mensajeDe = (b: Record<string, unknown>) => mensajeDeMarcacion({
  usuario_id: 'u-1', id: b.id as string, tipo: b.tipo as string, fecha_hora: b.fecha_hora as string, latitud: b.latitud as number,
  longitud: b.longitud as number, dispositivo_id: b.dispositivo_id as string, selfie_b64: b.selfie_b64 as string,
})

beforeEach(async () => {
  almacen().filas.clear(); almacen().cache.clear()
  nativo = crearNativoFalso()
  modulo.actual = nativo
  await nativo.crearClaveAsync(ALIAS, 'x')
  jest.mocked(api).mockReset()
  // Sin red: así lo guardado se queda en el celular hasta que el test lo decida.
  jest.mocked(api).mockRejectedValue(new ApiError(0, 'sin red'))
  jest.mocked(NetInfo.addEventListener).mockImplementation((() => jest.fn()) as never)
  jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: jest.fn() })) as never)
})
afterEach(() => { jest.restoreAllMocks() })

describe('firma de la marcación sin conexión, de punta a punta', () => {
  it('lo que llega al servidor está firmado y la firma se verifica con la clave pública', async () => {
    await montar()
    await act(async () => { await sync.guardar(DATOS) })
    expect(almacen().filas.get('m-1')?.pendiente.firma).toEqual(expect.any(String))

    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { await sync.sincronizarAhora() })
    const cuerpo = enviado()
    expect(cuerpo.firma).toEqual(expect.any(String))
    expect(cuerpo.sin_conexion).toBe(true)
    expect(nativo.verificar(ALIAS, await mensajeDe(cuerpo), cuerpo.firma as string)).toBe(true)
  })

  it.each([
    ['la hora', { fecha_hora: '2026-10-15T12:00:00.000Z' }],
    ['la latitud', { latitud: -2.15 }],
    ['la longitud', { longitud: -79.5 }],
    ['el tipo', { tipo: 'salida' }],
    ['el dispositivo', { dispositivo_id: 'android:otro' }],
  ])('si alguien cambia %s en la base del celular, la firma que llega ya no corresponde', async (_que, cambio) => {
    await montar()
    await act(async () => { await sync.guardar(DATOS) })

    // Lo que haría quien tiene root: abre la base local y edita la fila antes de que se envíe.
    const fila = almacen().filas.get('m-1')!
    fila.pendiente = { ...fila.pendiente, ...cambio } as typeof fila.pendiente

    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { await sync.sincronizarAhora() })
    const cuerpo = enviado()
    expect(nativo.verificar(ALIAS, await mensajeDe(cuerpo), cuerpo.firma as string)).toBe(false)
  })

  it('si cambian la foto guardada, la firma tampoco corresponde', async () => {
    await montar()
    await act(async () => { await sync.guardar(DATOS) })
    almacen().filas.get('m-1')!.selfie = 'FOTO-DE-OTRA-PERSONA'

    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { await sync.sincronizarAhora() })
    const cuerpo = enviado()
    expect(cuerpo.selfie_b64).toBe('FOTO-DE-OTRA-PERSONA')
    expect(nativo.verificar(ALIAS, await mensajeDe(cuerpo), cuerpo.firma as string)).toBe(false)
  })

  it('quitar la firma de la fila tampoco ayuda: el servidor la exige a quien tiene clave registrada', async () => {
    await montar()
    await act(async () => { await sync.guardar(DATOS) })
    const fila = almacen().filas.get('m-1')!
    fila.pendiente = { ...fila.pendiente, firma: null }
    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { await sync.sincronizarAhora() })
    expect(enviado()).not.toHaveProperty('firma')    // y el servidor responde 422 `firma_invalida` (ver sus pruebas)
  })

  it('sin clave en el celular (Expo Go) se guarda y se envía sin firma, como antes', async () => {
    modulo.actual = null
    await montar()
    await act(async () => { await sync.guardar(DATOS) })
    expect(almacen().filas.get('m-1')?.pendiente.firma).toBeNull()
    jest.mocked(api).mockImplementation((async (_r: string, o: { body: { id: string; tipo: never } }) => respuestaOk(o.body.id, o.body.tipo)) as never)
    await act(async () => { await sync.sincronizarAhora() })
    expect(enviado()).not.toHaveProperty('firma')
  })

  it('si hay clave pero el chip no logra firmar, la marcación NO se guarda y se avisa', async () => {
    nativo.firmarAsync.mockRejectedValueOnce(new Error('el chip no responde'))
    await montar()
    await act(async () => { await expect(sync.guardar(DATOS)).rejects.toThrow('No se pudo firmar') })
    expect(almacen().filas.size).toBe(0)
  })
})
