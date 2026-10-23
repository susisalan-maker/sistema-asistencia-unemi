import { render, screen } from '@testing-library/react-native'
import Historial from '../app/(app)/historial'
import { ApiError, api } from '../lib/api'
import { hoyLocal } from '../lib/marcacion'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { pendiente } from '../lib/offline/ayudasDePrueba'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const almacen = () => obtenerAlmacen() as AlmacenMemoria
const marca = (id: string, tipo: string, hora: string, extra: object = {}) => ({
  id, tipo, fecha_hora: `2026-10-15T${hora}:00-05:00`, sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada',
  lugar: 'Bloque A', anomalia: null, ...extra,
})

beforeEach(() => { almacen().filas.clear(); jest.mocked(api).mockReset() })

describe('Historial · sin conexión', () => {
  it('las marcaciones que llegaron tarde se distinguen de las normales', async () => {
    jest.mocked(api).mockResolvedValue({
      total: 2, dias: [{ fecha: hoyLocal(), marcaciones: [marca('1', 'ingreso', '08:00', { sin_conexion: true }), marca('2', 'salida_almuerzo', '12:00')] }],
    })
    await render(<SincronizacionProvider usuarioId="u-1"><Historial /></SincronizacionProvider>)
    expect(await screen.findByText('Ingreso 08:00')).toBeTruthy()
    expect(screen.getAllByText('SINCRONIZADO')).toHaveLength(1)
    expect(screen.getAllByText('ENVIADA SIN CONEXIÓN')).toHaveLength(1)
  })

  it('las que siguen en el celular aparecen aparte, «por enviar»', async () => {
    await almacen().insertar(pendiente('p1', 'ingreso', '08:00'), 'FOTO')
    jest.mocked(api).mockImplementation((async (ruta: string) => {
      if (ruta.startsWith('/marcaciones/historial')) return { total: 0, dias: [] }
      throw new ApiError(0, 'sin red')
    }) as typeof api)
    await render(<SincronizacionProvider usuarioId="u-1"><Historial /></SincronizacionProvider>)
    expect(await screen.findAllByText('POR ENVIAR')).toHaveLength(2)   // el rótulo de la sección y la etiqueta de la fila
    expect(screen.getByText('Ingreso 08:00')).toBeTruthy()
    expect(screen.getByText(/guardada en tu celular/)).toBeTruthy()
    expect(screen.queryByText(/Aún no tienes marcaciones/)).toBeNull()   // hay una, aunque no haya llegado
  })

  it('sin pendientes y sin marcaciones sigue diciendo que no hay nada', async () => {
    jest.mocked(api).mockResolvedValue({ total: 0, dias: [] })
    await render(<SincronizacionProvider usuarioId="u-1"><Historial /></SincronizacionProvider>)
    expect(await screen.findByText(/Aún no tienes marcaciones/)).toBeTruthy()
    expect(screen.queryByText('POR ENVIAR')).toBeNull()
  })
})
