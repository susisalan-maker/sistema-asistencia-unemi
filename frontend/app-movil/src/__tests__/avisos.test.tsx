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

const abrirFiltro = (nombre: RegExp) => fireEvent.press(screen.getByRole('tab', { name: nombre }))
const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const hace = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()

describe('Avisos', () => {
  it('muestra el caso por explicar en una fila compacta y lleva al chat con su id', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    expect(await screen.findByText('No marcaste ese día')).toBeTruthy()          // el tipo es el título de la fila
    expect(screen.queryByText('Anomalía detectada')).toBeNull()
    expect(screen.getByText('1 observación requiere tu explicación')).toBeTruthy()
    expect(screen.getByText(/Caso #A-12/)).toBeTruthy()
    expect(screen.getByText(/Te quedan/)).toBeTruthy()
    expect(screen.queryByText(/No registraste tu ingreso/)).toBeNull()      // el detalle largo va dentro del caso, no en la lista
    await fireEvent.press(screen.getByLabelText(/^Explicar: No marcaste ese día/))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a1' } })
  })

  it('no hay «Ahora no» ni promesas de recordatorio: la única acción es explicar', async () => {
    jest.mocked(api).mockResolvedValue([anomalia()])
    await render(<Avisos />)
    await screen.findByLabelText(/^Explicar/)
    expect(screen.queryByLabelText('Ahora no')).toBeNull()
    expect(screen.queryByText(/Recuérdame/)).toBeNull()
  })

  it('arranca en «Por explicar» y cada filtro muestra solo lo suyo, con su cuenta', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'p', caso: 'A-1' }),
      anomalia({ id: 'r', caso: 'A-2', estado: 'en_revision', puede_justificar: false }),
      anomalia({ id: 'j', caso: 'A-3', estado: 'justificada', puede_justificar: false }),
    ])
    await render(<Avisos />)
    await screen.findByText(/Caso #A-1/)
    expect(screen.getByRole('tab', { name: 'Por explicar, 1' }).props.accessibilityState.selected).toBe(true)
    expect(screen.queryByText(/Caso #A-2/)).toBeNull()
    await abrirFiltro(/En revisión/)
    expect(screen.getByText(/Caso #A-2/)).toBeTruthy()
    expect(screen.queryByText(/Caso #A-1/)).toBeNull()
    await abrirFiltro(/Resueltos/)
    expect(screen.getByText('JUSTIFICADA')).toBeTruthy()
    expect(screen.queryByText(/Caso #A-2/)).toBeNull()
  })

  it('las que ya no se pueden justificar van en «Resueltos», cada una con su estado en un chip', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'a2', caso: 'A-9', estado: 'rechazada', puede_justificar: false }),
      anomalia({ id: 'a4', caso: 'A-4', estado: 'justificada', puede_justificar: false }),
    ])
    await render(<Avisos />)
    expect(await screen.findByText('No tienes observaciones por explicar.')).toBeTruthy()
    expect(screen.queryByLabelText(/^Explicar/)).toBeNull()
    await abrirFiltro(/Resueltos/)
    expect(screen.getByText('RECHAZADA')).toBeTruthy()
    expect(screen.getByText('JUSTIFICADA')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText(/Caso #A-9/))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/justificar', params: { id: 'a2' } })
  })

  it('las que esperan a Talento Humano van en «En revisión»', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'a2', caso: 'A-9', estado: 'en_revision', puede_justificar: false }),
      anomalia({ id: 'a4', caso: 'A-4', estado: 'justificada', puede_justificar: false }),
    ])
    await render(<Avisos />)
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirFiltro(/En revisión/)
    expect(screen.getByText('EN REVISIÓN')).toBeTruthy()      // el chip de la fila
    expect(screen.getByText(/Caso #A-9/)).toBeTruthy()
    expect(screen.queryByText(/Caso #A-4/)).toBeNull()
  })

  it('un caso que sigue «abierto» pero ya sin plazo se dice «Plazo vencido», no «Abierto»', async () => {
    jest.mocked(api).mockResolvedValue([anomalia({ id: 'a5', caso: 'A-5', puede_justificar: false, vence: new Date(Date.now() - 3_600_000).toISOString() })])
    await render(<Avisos />)
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirFiltro(/Resueltos/)
    expect(screen.getByText('PLAZO VENCIDO')).toBeTruthy()
    expect(screen.queryByText('ABIERTO')).toBeNull()
  })

  it('lo más nuevo va primero, agrupado por día', async () => {
    jest.mocked(api).mockResolvedValue([
      anomalia({ id: 'viejo', caso: 'A-1', creada: hace(24 * 5), vence: en(10) }),
      anomalia({ id: 'nuevo', caso: 'A-3', creada: hace(0.01), vence: en(40) }),
      anomalia({ id: 'medio', caso: 'A-2', creada: hace(0.02), vence: en(20) }),
    ])
    await render(<Avisos />)
    await screen.findAllByLabelText(/^Explicar/)
    const casos = screen.getAllByText(/Caso #A-/).map((t) => String(t.props.children).replace(/,/g, ''))
    expect(casos[0]).toContain('A-3')
    expect(casos[1]).toContain('A-2')
    expect(casos[2]).toContain('A-1')
    expect(screen.getByText('HOY')).toBeTruthy()
    expect(screen.getAllByRole('header').filter((h) => h.props.accessibilityRole === 'header' && /^[A-Z0-9 ÁÉÍÓÚ]+$/.test(String(h.props.children)))).toHaveLength(2)   // «Hoy» y el día del más viejo
  })

  it('con menos de 6 horas el plazo se ve en rojo; con más, en ámbar', async () => {
    jest.mocked(api).mockResolvedValue([anomalia({ id: 'a1', vence: en(2.5) }), anomalia({ id: 'a2', caso: 'A-13', vence: en(20.5) })])
    await render(<Avisos />)
    await screen.findAllByLabelText(/^Explicar/)
    const textos = screen.getAllByText(/Te quedan/)
    const urgente = textos.find((t) => String(t.props.children).includes('2 h'))!
    const calmado = textos.find((t) => String(t.props.children).includes('20 h'))!
    expect(StyleSheet.flatten(urgente.props.style).color).toBe(colores.error)
    expect(StyleSheet.flatten(calmado.props.style).color).toBe(colores.aviso)
  })

  it('en plural cuando hay varias', async () => {
    jest.mocked(api).mockResolvedValue([anomalia(), anomalia({ id: 'a3', caso: 'A-13' })])
    await render(<Avisos />)
    expect(await screen.findByText('2 observaciones requieren tu explicación')).toBeTruthy()
  })

  it('«Resueltos» muestra 5 y «Ver más» trae el resto', async () => {
    jest.mocked(api).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => anomalia({ id: `x${i}`, caso: `A-${100 + i}`, estado: 'justificada', puede_justificar: false, creada: hace(i) })),
    )
    await render(<Avisos />)
    await screen.findByText('No tienes observaciones por explicar.')
    await abrirFiltro(/Resueltos/)
    expect(screen.getAllByText('JUSTIFICADA')).toHaveLength(5)
    await fireEvent.press(screen.getByLabelText('Ver más'))
    expect(screen.getAllByText('JUSTIFICADA')).toHaveLength(12)
    expect(screen.queryByLabelText('Ver más')).toBeNull()
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
