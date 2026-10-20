import { fireEvent, render, screen } from '@testing-library/react-native'
import Avisos from '../app/(app)/avisos'
import { ApiError, api } from '../lib/api'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const anomalia = (extra: object = {}) => ({
  id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso el 14 de octubre.',
  creada: new Date().toISOString(), vence: new Date(Date.now() + 5 * 3_600_000).toISOString(), puede_justificar: true, ...extra,
})

beforeEach(() => { jest.mocked(api).mockReset(); mockPush.mockReset(); mockNavigate.mockReset() })

describe('Avisos', () => {
  it('muestra la tarjeta de la anomalía por explicar y lleva al chat con su id', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    expect(await screen.findByText('Anomalía detectada')).toBeTruthy()
    expect(screen.getByText('1 anomalía requiere tu explicación')).toBeTruthy()
    expect(screen.getByText(/Caso #A-12/)).toBeTruthy()
    expect(screen.getByText(/Te quedan/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Explicar'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a1' } })
  })

  it('«Recuérdame más tarde» vuelve al inicio sin tocar nada', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    await fireEvent.press(await screen.findByLabelText('Recuérdame más tarde'))
    expect(mockNavigate).toHaveBeenCalledWith('/')
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('las que ya no se pueden justificar van en «Anteriores» con su estado', async () => {
    jest.mocked(api).mockResolvedValue([anomalia({ id: 'a2', caso: 'A-9', estado: 'en_revision', puede_justificar: false })])
    await render(<Avisos />)
    expect(await screen.findByText('ANTERIORES')).toBeTruthy()
    expect(screen.getByText('No tienes anomalías por explicar')).toBeTruthy()
    expect(screen.queryByText('Anomalía detectada')).toBeNull()
    expect(screen.getByText(/en revisión/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/Caso #A-9/))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a2' } })
  })

  it('en plural cuando hay varias', async () => {
    jest.mocked(api).mockResolvedValue([anomalia(), anomalia({ id: 'a3', caso: 'A-13' })])
    await render(<Avisos />)
    expect(await screen.findByText('2 anomalías requieren tu explicación')).toBeTruthy()
  })

  it('sin avisos lo dice', async () => {
    jest.mocked(api).mockResolvedValue([])
    await render(<Avisos />)
    expect(await screen.findByText(/No tienes avisos/)).toBeTruthy()
  })

  it('si falla muestra el error y permite reintentar', async () => {
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.')).mockResolvedValue([])
    await render(<Avisos />)
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByText(/No tienes avisos/)).toBeTruthy()
  })
})
