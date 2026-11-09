import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Avisos from '../app/(app)/avisos'
import { api } from '../lib/api'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const almacen = () => obtenerAlmacen() as AlmacenMemoria
const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const caso = (i: number, estado: string, extra: object = {}) => ({
  id: `x${i}`, caso: `A-${100 + i}`, tipo: 'sin_ingreso', estado, detalle: null, creada: hace(i), vence: hace(i - 1),
  puede_justificar: false, ...extra,
})
const pantalla = () => render(<SincronizacionProvider usuarioId="u-1"><Avisos /></SincronizacionProvider>)
const abrirResueltos = () => fireEvent.press(screen.getByRole('tab', { name: /Resueltos/ }))

beforeEach(() => { almacen().filas.clear(); almacen().cache.clear(); jest.mocked(api).mockReset(); mockPush.mockReset() })

describe('Avisos · Resueltos', () => {
  it('con pocos casos no hay filtros por resultado', async () => {
    jest.mocked(api).mockResolvedValue(Array.from({ length: 10 }, (_, i) => caso(i, i % 2 ? 'rechazada' : 'justificada')))
    await pantalla()
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirResueltos()
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('con más de 10 casos aparecen Todos / Justificadas / Rechazadas y filtran', async () => {
    const lista = [
      ...Array.from({ length: 8 }, (_, i) => caso(i, 'justificada')),
      ...Array.from({ length: 3 }, (_, i) => caso(20 + i, 'rechazada')),
    ]
    jest.mocked(api).mockResolvedValue(lista)
    await pantalla()
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirResueltos()
    expect(screen.getByRole('radio', { name: 'Todos, 11' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Justificadas, 8' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Rechazadas, 3' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: /Sin justificar/ })).toBeNull()   // no hay de esos: no se ofrece

    await fireEvent.press(screen.getByRole('radio', { name: 'Rechazadas, 3' }))
    expect(screen.getAllByText('RECHAZADA')).toHaveLength(3)
    expect(screen.queryByText('JUSTIFICADA')).toBeNull()
    expect(screen.getByRole('radio', { name: 'Rechazadas, 3' }).props.accessibilityState.selected).toBe(true)
  })

  it('«Sin justificar» reúne los vencidos sin explicar', async () => {
    const lista = [
      ...Array.from({ length: 9 }, (_, i) => caso(i, 'justificada')),
      caso(30, 'sin_justificar'),
      caso(31, 'pendiente'),     // pendiente y ya sin plazo
    ]
    jest.mocked(api).mockResolvedValue(lista)
    await pantalla()
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirResueltos()
    await fireEvent.press(screen.getByRole('radio', { name: 'Sin justificar, 2' }))
    expect(screen.getByText('SIN JUSTIFICAR')).toBeTruthy()
    expect(screen.getByText('PLAZO VENCIDO')).toBeTruthy()
  })
})

describe('Avisos · novedades', () => {
  it('la primera vez lo ya resuelto no cuenta como novedad', async () => {
    jest.mocked(api).mockResolvedValue([caso(1, 'justificada')])
    await pantalla()
    await screen.findByText('No tienes observaciones por explicar.')
    expect(screen.queryByTestId('punto-resueltos')).toBeNull()
  })

  it('un caso que pasa a justificado o rechazado marca Resueltos y la fila, hasta que se abre', async () => {
    jest.mocked(api).mockResolvedValueOnce([caso(1, 'en_revision')])
    const { unmount } = await pantalla()
    await screen.findByText('No tienes observaciones por explicar.')
    await unmount()

    // Talento Humano lo resolvió mientras tanto (y ya había otro resuelto de antes).
    jest.mocked(api).mockResolvedValue([caso(1, 'rechazada')])
    await pantalla()
    expect(await screen.findByTestId('punto-resueltos')).toBeTruthy()
    expect(screen.getByRole('tab', { name: /Resueltos, 1, 1 novedad/ })).toBeTruthy()
    await abrirResueltos()
    expect(screen.getByTestId('punto-nuevo')).toBeTruthy()
    expect(screen.getByLabelText(/resultado nuevo/)).toBeTruthy()

    await fireEvent.press(screen.getByLabelText(/Caso #A-101/))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'x1' } })
    expect(screen.queryByTestId('punto-nuevo')).toBeNull()
    expect(screen.queryByTestId('punto-resueltos')).toBeNull()

    // Y al volver a entrar ya no es novedad.
    jest.mocked(api).mockResolvedValue([caso(1, 'rechazada')])
    await pantalla()
    await waitFor(() => expect(screen.queryByTestId('punto-resueltos')).toBeNull())
  })
})
