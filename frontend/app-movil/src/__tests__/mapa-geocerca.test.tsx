import { act, render, screen } from '@testing-library/react-native'
import { MapaGeocerca } from '../components/MapaGeocerca'

let mensaje: ((e: { nativeEvent: { data: string } }) => void) | undefined
let alFallar: (() => void) | undefined
jest.mock('react-native-webview', () => ({
  WebView: (p: { onMessage: typeof mensaje; onError: () => void }) => {
    mensaje = p.onMessage
    alFallar = p.onError
    return null
  },
}))

const datos = { centro: { latitud: -2.14, longitud: -79.6 }, radio_m: 150, usuario: { latitud: -2.141, longitud: -79.601 }, dentro: true }

beforeEach(() => { jest.useFakeTimers() })
afterEach(() => { jest.useRealTimers() })

describe('MapaGeocerca · esqueleto de carga', () => {
  it('muestra el esqueleto hasta que el mapa avisa que cargó', async () => {
    await render(<MapaGeocerca datos={datos} />)
    expect(screen.getByTestId('esqueleto-mapa')).toBeTruthy()
    await act(async () => { mensaje!({ nativeEvent: { data: 'listo' } }) })
    expect(screen.queryByTestId('esqueleto-mapa')).toBeNull()
  })

  it('un mensaje que no es «listo» no lo quita', async () => {
    await render(<MapaGeocerca datos={datos} />)
    await act(async () => { mensaje!({ nativeEvent: { data: 'otra cosa' } }) })
    expect(screen.getByTestId('esqueleto-mapa')).toBeTruthy()
  })

  it('si el mapa nunca avisa (sin internet), lo quita pasados 10 segundos', async () => {
    await render(<MapaGeocerca datos={datos} />)
    await act(async () => { jest.advanceTimersByTime(9_000) })
    expect(screen.getByTestId('esqueleto-mapa')).toBeTruthy()
    await act(async () => { jest.advanceTimersByTime(1_500) })
    expect(screen.queryByTestId('esqueleto-mapa')).toBeNull()
  })

  it('si el WebView falla, tampoco se queda cargando', async () => {
    await render(<MapaGeocerca datos={datos} />)
    await act(async () => { alFallar!() })
    expect(screen.queryByTestId('esqueleto-mapa')).toBeNull()
  })
})
