import { render, screen } from '@testing-library/react-native'
import Avisos from '../app/(app)/avisos'
import { ApiError, api } from '../lib/api'
import { obtenerAlmacen } from '../lib/offline/almacen'
import { AlmacenMemoria } from '../lib/offline/almacenMemoria'
import { SincronizacionProvider } from '../lib/offline/SincronizacionContext'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const almacen = () => obtenerAlmacen() as AlmacenMemoria
const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const anomalia = (extra: object = {}) => ({
  id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso.',
  creada: new Date().toISOString(), vence: en(5), puede_justificar: true, ...extra,
})
const pantalla = () => render(<SincronizacionProvider usuarioId="u-1"><Avisos /></SincronizacionProvider>)

beforeEach(() => { almacen().filas.clear(); almacen().cache.clear(); jest.mocked(api).mockReset() })

describe('Avisos · sin conexión', () => {
  it('sin internet muestra la última lista que se pudo ver, con un aviso', async () => {
    jest.mocked(api).mockResolvedValueOnce([anomalia()])
    const { unmount } = await pantalla()
    expect(await screen.findByText('No marcaste ese día')).toBeTruthy()
    expect(screen.queryByText(/Mostramos lo último/)).toBeNull()
    await unmount()

    jest.mocked(api).mockRejectedValue(new ApiError(0, 'No hay conexión con el servidor.'))
    await pantalla()
    expect(await screen.findByText('No marcaste ese día')).toBeTruthy()
    expect(screen.getByText(/Mostramos lo último que guardamos de tus avisos/)).toBeTruthy()
    expect(screen.getByText(/Para explicar un caso necesitas internet/)).toBeTruthy()
    expect(screen.queryByText('No hay conexión con el servidor.')).toBeNull()
  })

  it('el plazo siguió corriendo: lo que ya venció pasa a «Anteriores» aunque la copia diga que se podía justificar', async () => {
    jest.mocked(api).mockResolvedValueOnce([anomalia({ vence: new Date(Date.now() + 1000).toISOString() })])
    const { unmount } = await pantalla()
    await screen.findByText('No marcaste ese día')
    await unmount()

    jest.useFakeTimers({   // solo el reloj: pasó una hora sin internet
      now: Date.now() + 3_600_000,
      doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime'],
    })
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'sin red'))
    await pantalla()
    expect(await screen.findByText('PLAZO VENCIDO')).toBeTruthy()
    expect(screen.queryByLabelText('Explicar')).toBeNull()
    jest.useRealTimers()
  })

  it('sin internet y sin copia, muestra el error y permite reintentar', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'No hay conexión con el servidor.'))
    await pantalla()
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    expect(screen.getByLabelText('Reintentar')).toBeTruthy()
  })
})
