import { fireEvent, render, screen } from '@testing-library/react-native'
import { BarraInferior } from '../components/BarraInferior'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
let mockPendientes = 0
const mockRecargar = jest.fn()
jest.mock('../lib/useAnomaliasPendientes', () => ({ useAnomaliasPendientes: () => ({ cantidad: mockPendientes, recargar: mockRecargar }) }))

const rutas = ['index', 'historial', 'avisos', 'perfil', 'marcar'].map((name) => ({ key: `${name}-k`, name }))
const navegador = (defaultPrevented = false) => ({ navigate: jest.fn(), emit: jest.fn(() => ({ defaultPrevented })) })

beforeEach(() => { mockPendientes = 0; mockRecargar.mockReset() })

describe('BarraInferior', () => {
  it('muestra las cuatro pestañas del mockup y marca la activa', async () => {
    await render(<BarraInferior state={{ index: 1, routes: rutas }} navigation={navegador()} />)
    for (const n of ['Inicio', 'Historial', 'Avisos', 'Perfil']) expect(screen.getByLabelText(n)).toBeTruthy()
    expect(screen.getByLabelText('Historial').props.accessibilityState.selected).toBe(true)
    expect(screen.getByLabelText('Inicio').props.accessibilityState.selected).toBe(false)
  })

  it('al tocar otra pestaña navega a ella', async () => {
    const nav = navegador()
    await render(<BarraInferior state={{ index: 0, routes: rutas }} navigation={nav} />)
    await fireEvent.press(screen.getByLabelText('Avisos'))
    expect(nav.navigate).toHaveBeenCalledWith('avisos')
  })

  it('no navega si ya estás en esa pestaña', async () => {
    const nav = navegador()
    await render(<BarraInferior state={{ index: 0, routes: rutas }} navigation={nav} />)
    await fireEvent.press(screen.getByLabelText('Inicio'))
    expect(nav.navigate).not.toHaveBeenCalled()
  })

  it('en pantallas que no son pestañas (marcar) no se dibuja', async () => {
    await render(<BarraInferior state={{ index: 4, routes: rutas }} navigation={navegador()} />)
    expect(screen.queryByLabelText('Inicio')).toBeNull()
  })

  it('pone un punto en Avisos solo si hay anomalías por explicar', async () => {
    await render(<BarraInferior state={{ index: 0, routes: rutas }} navigation={navegador()} />)
    expect(screen.queryByTestId('punto-avisos')).toBeNull()
    mockPendientes = 2
    await render(<BarraInferior state={{ index: 0, routes: rutas }} navigation={navegador()} />)
    expect(screen.getByTestId('punto-avisos')).toBeTruthy()
  })

  it('refresca el aviso al cambiar de pestaña', async () => {
    await render(<BarraInferior state={{ index: 2, routes: rutas }} navigation={navegador()} />)
    expect(mockRecargar).toHaveBeenCalled()
  })
})
