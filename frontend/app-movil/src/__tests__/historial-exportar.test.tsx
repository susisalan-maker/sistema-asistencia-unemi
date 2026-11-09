import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Historial from '../app/(app)/historial'
import { api, ApiError } from '../lib/api'
import { sumarDias } from '../lib/exportar'
import { hoyLocal } from '../lib/marcacion'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), navigate: jest.fn(), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
const mockCompartir = jest.fn()
jest.mock('expo-sharing', () => ({ isAvailableAsync: async () => true, shareAsync: (...a: unknown[]) => mockCompartir(...a) }))
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class { uri: string; constructor(b: string, n: string) { this.uri = `${b}${n}` } create() {} write() { return Promise.resolve() } },
}))

const exportacion = (extra: object = {}) => ({ nombre: 'M.pdf', mime: 'application/pdf', contenido: 'QUJD', total: 5, ...extra })
const llamadasExportar = () => jest.mocked(api).mock.calls.map((c) => c[0]).filter((r) => r.startsWith('/marcaciones/exportar'))

beforeEach(() => {
  jest.mocked(api).mockReset()
  mockCompartir.mockReset()
  jest.mocked(api).mockImplementation(async (ruta: string) => (ruta.startsWith('/marcaciones/exportar') ? exportacion() : { total: 0, dias: [] }) as never)
})

const abrirHoja = async () => {
  await render(<Historial />)
  await fireEvent.press(await screen.findByLabelText('Exportar marcaciones'))
}

describe('Exportar desde el Historial', () => {
  it('abre la hoja con 30 días y PDF por defecto y comparte el archivo', async () => {
    await abrirHoja()
    expect(screen.getByText('Exportar marcaciones')).toBeTruthy()
    expect(screen.getByLabelText('Últimos 30 días').props.accessibilityState.selected).toBe(true)
    expect(screen.getByLabelText(/^PDF/).props.accessibilityState.selected).toBe(true)
    expect(screen.getByText(/No incluye fotos ni coordenadas/)).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    await waitFor(() => expect(mockCompartir).toHaveBeenCalled())
    const hoy = hoyLocal()
    expect(llamadasExportar()).toHaveLength(1)
    expect(llamadasExportar()[0]).toMatch(new RegExp(`hasta=${hoy}&formato=pdf$`))
  })

  it('exporta en Excel el mes anterior', async () => {
    await abrirHoja()
    await fireEvent.press(screen.getByLabelText('Mes anterior'))
    await fireEvent.press(screen.getByLabelText(/^Excel/))
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    await waitFor(() => expect(mockCompartir).toHaveBeenCalled())
    expect(llamadasExportar()[0]).toMatch(/desde=\d{4}-\d{2}-01&hasta=\d{4}-\d{2}-\d{2}&formato=xlsx$/)
  })

  it('en Personalizado no deja generar hasta elegir los dos días, y bloquea los días futuros', async () => {
    await abrirHoja()
    await fireEvent.press(screen.getByLabelText('Personalizado'))
    expect(screen.getByText(/Máximo 93 días seguidos/)).toBeTruthy()
    expect(screen.getByLabelText('Generar y compartir').props.accessibilityState.disabled).toBe(true)
    // El mes siguiente no existe: no se puede avanzar más allá del mes actual.
    expect(screen.getByLabelText('Mes siguiente').props.accessibilityState.disabled).toBe(true)
    const [, , d] = hoyLocal().split('-').map(Number) as [number, number, number]
    if (d < 28) {
      const [, mm, dd] = sumarDias(hoyLocal(), 1).split('-').map(Number) as [number, number, number]
      const mes = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][mm - 1]
      expect(screen.getByLabelText(`${dd} de ${mes}`).props.accessibilityState.disabled).toBe(true)
    }
    // Elige el día 1 del mes actual y hoy.
    await fireEvent.press(screen.getAllByLabelText(/^1 de /)[0]!)
    expect(screen.getByLabelText('Generar y compartir').props.accessibilityState.disabled).toBe(true)
    await fireEvent.press(screen.getByLabelText(new RegExp(`^${d} de `)))
    expect(screen.getByLabelText('Generar y compartir').props.accessibilityState.disabled).toBeFalsy()
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    await waitFor(() => expect(mockCompartir).toHaveBeenCalled())
    expect(llamadasExportar()[0]).toContain(`hasta=${hoyLocal()}`)
  })

  it('avisa cuando no hay marcaciones y no abre el menú de compartir', async () => {
    jest.mocked(api).mockImplementation(async (ruta: string) => (ruta.startsWith('/marcaciones/exportar') ? exportacion({ total: 0 }) : { total: 0, dias: [] }) as never)
    await abrirHoja()
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    expect(await screen.findByText(/No tienes marcaciones en ese período/)).toBeTruthy()
    expect(mockCompartir).not.toHaveBeenCalled()
  })

  it('sin internet explica qué pasa y deja reintentar', async () => {
    jest.mocked(api).mockImplementation(async (ruta: string) => {
      if (ruta.startsWith('/marcaciones/exportar')) throw new ApiError(0, 'sin red')
      return { total: 0, dias: [] } as never
    })
    await abrirHoja()
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    expect(await screen.findByText(/necesitas conexión a internet/)).toBeTruthy()
    expect(screen.getByLabelText('Generar y compartir').props.accessibilityState.disabled).toBeFalsy()
  })

  it('cierra la hoja después de compartir', async () => {
    await abrirHoja()
    await fireEvent.press(screen.getByLabelText('Generar y compartir'))
    await waitFor(() => expect(screen.queryByText('Exportar marcaciones', { exact: true })).toBeNull())
  })
})
