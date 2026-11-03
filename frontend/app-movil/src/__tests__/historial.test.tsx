import { act, fireEvent, render, screen } from '@testing-library/react-native'
import Historial from '../app/(app)/historial'
import { ApiError, api } from '../lib/api'
import { hoyLocal } from '../lib/marcacion'

jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]) }))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const marca = (id: string, tipo: string, hora: string, extra: object = {}) => ({
  id, tipo, fecha_hora: `2026-10-15T${hora}:00-05:00`, sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada',
  lugar: 'Bloque A', anomalia: null, ...extra,
})

beforeEach(() => jest.mocked(api).mockReset())

/** Simula el gesto de deslizar hacia abajo: llama al `onRefresh` del RefreshControl de la pantalla y devuelve cuándo terminó. */
const alDeslizar = () => screen.getByTestId('pantalla-pestana').props.refreshControl.props.onRefresh as () => Promise<void>
const deslizar = () => act(async () => { await alDeslizar()() })
/** Empieza el gesto y lo deja en curso (el pedido sigue pendiente) para poder ver el circulito girando. */
const empezarDeslizar = async () => { let g!: Promise<void>; await act(async () => { g = alDeslizar()() }); return { termina: g } }
const estaActualizando = () => screen.getByTestId('pantalla-pestana').props.refreshControl.props.refreshing as boolean

describe('Historial', () => {
  it('pide los últimos 7 días y los agrupa por día', async () => {
    jest.mocked(api).mockResolvedValue({
      total: 3,
      dias: [
        { fecha: hoyLocal(), marcaciones: [marca('2', 'salida_almuerzo', '12:30'), marca('1', 'ingreso', '08:11')] },
        { fecha: '2026-10-12', marcaciones: [marca('0', 'salida', '17:04', { lugar: null })] },
      ],
    })
    await render(<Historial />)
    expect(await screen.findByText('Últimos 7 días · 3 marcaciones')).toBeTruthy()
    expect(api).toHaveBeenCalledWith('/marcaciones/historial?dias=7')
    expect(screen.getByText('Ingreso 08:11')).toBeTruthy()
    expect(screen.getByText(/^HOY · /)).toBeTruthy()
    expect(screen.getByText('LUNES · 12 OCT')).toBeTruthy()
    expect(screen.getAllByText('SINCRONIZADO')).toHaveLength(3)
    expect(screen.getAllByText('Bloque A')).toHaveLength(2)
  })

  it('marca las filas con anomalía', async () => {
    jest.mocked(api).mockResolvedValue({
      total: 1,
      dias: [{ fecha: hoyLocal(), marcaciones: [marca('1', 'ingreso', '08:11', { anomalia: { tipo: 'fuera_geocerca', estado: 'justificada' } })] }],
    })
    await render(<Historial />)
    expect(await screen.findByText('Anomalía justificada')).toBeTruthy()
  })

  it('sin marcaciones lo dice', async () => {
    jest.mocked(api).mockResolvedValue({ total: 0, dias: [] })
    await render(<Historial />)
    expect(await screen.findByText(/Aún no tienes marcaciones/)).toBeTruthy()
  })

  it('si falla permite reintentar', async () => {
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.')).mockResolvedValue({ total: 0, dias: [] })
    await render(<Historial />)
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByText(/Aún no tienes marcaciones/)).toBeTruthy()
  })

  it('al deslizar hacia abajo vuelve a pedir el historial y muestra el circulito mientras tanto', async () => {
    jest.mocked(api).mockResolvedValueOnce({ total: 0, dias: [] })
    await render(<Historial />)
    expect(await screen.findByText(/Aún no tienes marcaciones/)).toBeTruthy()
    expect(estaActualizando()).toBe(false)

    let terminar!: (v: object) => void
    jest.mocked(api).mockReturnValueOnce(new Promise((r) => { terminar = r }))
    const gesto = await empezarDeslizar()
    expect(estaActualizando()).toBe(true)
    await act(async () => { terminar({ total: 1, dias: [{ fecha: hoyLocal(), marcaciones: [marca('1', 'ingreso', '08:11')] }] }); await gesto.termina })
    expect(estaActualizando()).toBe(false)
    expect(await screen.findByText('Ingreso 08:11')).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('si al deslizar no hay internet, avisa, cierra el circulito y conserva lo que ya se veía', async () => {
    jest.mocked(api).mockResolvedValueOnce({ total: 1, dias: [{ fecha: hoyLocal(), marcaciones: [marca('1', 'ingreso', '08:11')] }] })
    await render(<Historial />)
    expect(await screen.findByText('Ingreso 08:11')).toBeTruthy()
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.'))
    await deslizar()
    expect(estaActualizando()).toBe(false)
    expect(screen.getByText('No hay conexión con el servidor.')).toBeTruthy()
    expect(screen.getByText('Ingreso 08:11')).toBeTruthy()
  })
})
