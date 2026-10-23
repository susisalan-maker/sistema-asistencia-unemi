import { act, renderHook } from '@testing-library/react-native'
import { ApiError, api } from './api'
import { ErrorUbicacion, obtenerPosicion } from './ubicacion'
import { useZona } from './useZona'

jest.mock('./supabase', () => ({ supabase: {} }))
jest.mock('./api', () => ({ ...jest.requireActual('./api'), api: jest.fn() }))
jest.mock('./ubicacion', () => ({ ...jest.requireActual('./ubicacion'), obtenerPosicion: jest.fn() }))

const POS = { latitud: -2.14, longitud: -79.6, precision_m: 9, tomadaEn: Date.now(), simulada: false }
const ZONA = { dentro: true, sede: 'Matriz', lugar: 'Bloque A', distancia_m: 10, radio_m: 60, centro: null, permite_fuera: false }

beforeEach(() => { jest.mocked(api).mockReset(); jest.mocked(obtenerPosicion).mockReset(); jest.mocked(obtenerPosicion).mockResolvedValue(POS) })

async function medir() {
  const { result } = await renderHook(() => useZona())
  await act(async () => { await result.current.medir() })
  return result.current.estado
}

describe('useZona', () => {
  it('con red, devuelve la zona que calculó el servidor', async () => {
    jest.mocked(api).mockResolvedValue(ZONA)
    expect(await medir()).toMatchObject({ fase: 'lista', zona: ZONA, precision_m: 9 })
  })

  it('sin red pero con GPS, avisa «sin conexión» con la precisión (no es un error)', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'No hay conexión con el servidor.'))
    expect(await medir()).toEqual({ fase: 'sin_conexion', precision_m: 9 })
  })

  it('si el servidor falla por otra razón, es un error con su mensaje', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(502, 'No se pudo comprobar tu ubicación'))
    expect(await medir()).toMatchObject({ fase: 'error', mensaje: 'No se pudo comprobar tu ubicación', abrirAjustes: false })
  })

  it('sin GPS sigue siendo un error de ubicación (aunque tampoco haya red)', async () => {
    jest.mocked(obtenerPosicion).mockRejectedValue(new ErrorUbicacion('Activa la ubicación', true))
    const estado = await medir()
    expect(estado).toMatchObject({ fase: 'error', mensaje: 'Activa la ubicación', abrirAjustes: true })
    expect(api).not.toHaveBeenCalled()
  })
})
