import { act, fireEvent, render, screen } from '@testing-library/react-native'
import Avisos from '../app/(app)/avisos'
import { StyleSheet } from 'react-native'
import { ApiError, api } from '../lib/api'
import { colores } from '../theme'

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

/** Simula el gesto de deslizar hacia abajo: llama al `onRefresh` del RefreshControl de la pantalla y devuelve cuándo terminó. */
const alDeslizar = () => screen.getByTestId('pantalla-pestana').props.refreshControl.props.onRefresh as () => Promise<void>
const deslizar = () => act(async () => { await alDeslizar()() })
/** Empieza el gesto y lo deja en curso (el pedido sigue pendiente) para poder ver el circulito girando. */
const empezarDeslizar = async () => { let g!: Promise<void>; await act(async () => { g = alDeslizar()() }); return { termina: g } }
const estaActualizando = () => screen.getByTestId('pantalla-pestana').props.refreshControl.props.refreshing as boolean

describe('Avisos', () => {
  it('muestra la tarjeta de la observación por explicar y lleva al chat con su id', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    expect(await screen.findByText('No marcaste ese día')).toBeTruthy()          // el tipo es el título de la tarjeta
    expect(screen.queryByText('Anomalía detectada')).toBeNull()
    expect(screen.getByText('1 observación requiere tu explicación')).toBeTruthy()
    expect(screen.getByText(/Caso #A-12/)).toBeTruthy()
    expect(screen.getByText(/Te quedan/)).toBeTruthy()
    expect(screen.getByText(/Vence el/)).toBeTruthy()      // fecha límite exacta
    await fireEvent.press(screen.getByLabelText('Explicar'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a1' } })
  })

  it('no hay «Ahora no» ni promesas de recordatorio: la única acción es explicar', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    await screen.findByLabelText('Explicar')
    expect(screen.queryByLabelText('Ahora no')).toBeNull()
    expect(screen.queryByText(/Recuérdame/)).toBeNull()
  })

  it('las que ya no se pueden justificar van en «Anteriores», cada una con su estado en un chip', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'a2', caso: 'A-9', estado: 'rechazada', puede_justificar: false }),
      anomalia({ id: 'a4', caso: 'A-4', estado: 'justificada', puede_justificar: false }),
    ])
    await render(<Avisos />)
    expect(await screen.findByText('ANTERIORES')).toBeTruthy()
    expect(screen.getByText('No tienes observaciones por explicar')).toBeTruthy()
    expect(screen.queryByLabelText('Explicar')).toBeNull()
    expect(screen.getByText('RECHAZADA')).toBeTruthy()
    expect(screen.getByText('JUSTIFICADA')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/Caso #A-9/))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a2' } })
  })

  it('las que esperan a Talento Humano van aparte, en «En revisión»', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'a2', caso: 'A-9', estado: 'en_revision', puede_justificar: false }),
      anomalia({ id: 'a4', caso: 'A-4', estado: 'justificada', puede_justificar: false }),
    ])
    await render(<Avisos />)
    await screen.findByText('ANTERIORES')
    expect(screen.getAllByText('EN REVISIÓN')).toHaveLength(2)   // el rótulo del grupo y el chip de la fila
    expect(screen.getByText('ANTERIORES')).toBeTruthy()
  })

  it('un caso que sigue «abierto» pero ya sin plazo se dice «Plazo vencido», no «Abierto»', async () => {
    jest.mocked(api).mockResolvedValue([anomalia({ id: 'a5', caso: 'A-5', puede_justificar: false, vence: new Date(Date.now() - 3_600_000).toISOString() })])
    await render(<Avisos />)
    expect(await screen.findByText('PLAZO VENCIDO')).toBeTruthy()
    expect(screen.queryByText('ABIERTO')).toBeNull()
  })

  it('los casos por explicar van del que vence antes al que vence después', async () => {
    const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'tarde', caso: 'A-1', vence: en(40.5) }),    // el servidor los entrega del más nuevo al más viejo
      anomalia({ id: 'pronto', caso: 'A-2', vence: en(2.5) }),
      anomalia({ id: 'medio', caso: 'A-3', vence: en(10.5) }),
    ])
    await render(<Avisos />)
    await screen.findAllByLabelText('Explicar')
    const plazos = screen.getAllByText(/Te quedan/).map((t) => String(t.props.children).replace(/,/g, ''))
    expect(plazos[0]).toContain('2 h')
    expect(plazos[1]).toContain('10 h')
    expect(plazos[2]).toContain('40 h')
  })

  it('con menos de 6 horas el plazo se ve en rojo; con más, en ámbar', async () => {
    const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
    jest.mocked(api).mockResolvedValue([anomalia({ id: 'a1', vence: en(2.5) }), anomalia({ id: 'a2', caso: 'A-13', vence: en(20.5) })])
    await render(<Avisos />)
    await screen.findAllByLabelText('Explicar')
    const [urgente, calmado] = screen.getAllByText(/Te quedan/)
    expect(StyleSheet.flatten(urgente.props.style).color).toBe(colores.error)
    expect(StyleSheet.flatten(calmado.props.style).color).toBe(colores.aviso)
  })

  it('en plural cuando hay varias', async () => {
    jest.mocked(api).mockResolvedValue([anomalia(), anomalia({ id: 'a3', caso: 'A-13' })])
    await render(<Avisos />)
    expect(await screen.findByText('2 observaciones requieren tu explicación')).toBeTruthy()
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

  it('al deslizar hacia abajo vuelve a pedir los avisos y aparece el nuevo', async () => {
    jest.mocked(api).mockResolvedValueOnce([])
    await render(<Avisos />)
    expect(await screen.findByText(/No tienes avisos/)).toBeTruthy()
    jest.mocked(api).mockResolvedValueOnce([anomalia()])
    await deslizar()
    expect(estaActualizando()).toBe(false)
    expect(await screen.findByText('No marcaste ese día')).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(2)
  })
})
