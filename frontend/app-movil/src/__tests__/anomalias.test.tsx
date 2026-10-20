import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import MisAnomalias from '../app/(app)/anomalias'
import { ApiError, api } from '../lib/api'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const an = (n: number, extra: object = {}) => ({
  id: `id-${n}`, caso: `A-${n}`, tipo: 'sin_salida', estado: 'pendiente', detalle: `Detalle ${n}`,
  creada: '2026-10-15T20:00:00+00:00', vence: en(30), puede_justificar: true, ...extra,
})

beforeEach(() => { jest.mocked(api).mockReset(); mockPush.mockReset(); mockBack.mockReset() })

describe('Mis anomalías', () => {
  it('pide la lista y separa lo que se puede justificar de lo anterior', async () => {
    jest.mocked(api).mockResolvedValue([
      an(1), an(2, { estado: 'justificada', puede_justificar: false }), an(3, { tipo: 'sin_ingreso' }),
    ])
    await render(<MisAnomalias />)
    expect(await screen.findByText('Tienes 2 anomalías por justificar.')).toBeTruthy()
    expect(api).toHaveBeenCalledWith('/anomalias')
    expect(screen.getByText('Anteriores')).toBeTruthy()
    expect(screen.getByText('No marcaste ese día')).toBeTruthy()
    expect(screen.getByText('Justificada')).toBeTruthy()
    expect(screen.getAllByText(/Te quedan 29 h para justificar|Te quedan 30 h para justificar/)).toHaveLength(2)
  })

  it('con una sola, el aviso va en singular y no hay «Anteriores»', async () => {
    jest.mocked(api).mockResolvedValue([an(1)])
    await render(<MisAnomalias />)
    expect(await screen.findByText('Tienes 1 anomalía por justificar.')).toBeTruthy()
    expect(screen.queryByText('Anteriores')).toBeNull()
  })

  it('al tocar una abre su detalle', async () => {
    jest.mocked(api).mockResolvedValue([an(7)])
    await render(<MisAnomalias />)
    await fireEvent.press(await screen.findByLabelText('A-7, Falta tu salida'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/anomalia', params: { id: 'id-7' } })
  })

  it('sin anomalías lo dice', async () => {
    jest.mocked(api).mockResolvedValue([])
    await render(<MisAnomalias />)
    expect(await screen.findByText(/No tienes anomalías/)).toBeTruthy()
  })

  it('si falla muestra el motivo y permite reintentar', async () => {
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.')).mockResolvedValue([an(1)])
    await render(<MisAnomalias />)
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByText('Tienes 1 anomalía por justificar.')).toBeTruthy()
  })

  it('«Volver» regresa', async () => {
    jest.mocked(api).mockResolvedValue([])
    await render(<MisAnomalias />)
    await fireEvent.press(await screen.findByText('‹ Volver'))
    expect(mockBack).toHaveBeenCalled()
  })
})
