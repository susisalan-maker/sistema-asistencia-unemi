import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { buscarLugares } from '../lib/buscarLugares'
import { RADIO_SEDE } from '../lib/geo'
import { SelectorZona, type ValorZona } from './SelectorZona'

vi.mock('../lib/buscarLugares', () => ({ buscarLugares: vi.fn() }))
vi.mock('./MapaLeaflet', () => ({
  default: (p: { actual?: { lat: number; lon: number; radio: number } | null; onElegir?: (a: number, b: number) => void }) => (
    <div data-testid="mapa" data-actual={p.actual ? `${p.actual.lat},${p.actual.lon},${p.actual.radio}` : ''}>
      <button onClick={() => p.onElegir?.(-2.123456789, -79.6)}>clic en el mapa</button>
    </div>
  ),
}))

function Prueba({ inicial = { lat: '', lon: '', radio: 300 } }: { inicial?: ValorZona }) {
  const [v, setV] = useState(inicial)
  return <SelectorZona valor={v} onCambio={setV} rango={RADIO_SEDE} ajustarA={[]} />
}

describe('SelectorZona', () => {
  it('el clic en el mapa llena latitud y longitud con 6 decimales', async () => {
    render(<Prueba />)
    await userEvent.click(await screen.findByText('clic en el mapa'))
    expect(screen.getByLabelText('Latitud')).toHaveValue('-2.123457')
    expect(screen.getByLabelText('Longitud')).toHaveValue('-79.6')
  })

  it('escribir las coordenadas mueve el círculo del mapa (acepta coma decimal)', async () => {
    render(<Prueba />)
    const mapa = await screen.findByTestId('mapa')
    expect(mapa).toHaveAttribute('data-actual', '')
    await userEvent.type(screen.getByLabelText('Latitud'), '-2,5')
    await userEvent.type(screen.getByLabelText('Longitud'), '-79.1')
    expect(mapa).toHaveAttribute('data-actual', '-2.5,-79.1,300')
  })

  it('no dibuja el círculo con coordenadas inválidas y las marca', async () => {
    render(<Prueba />)
    await userEvent.type(screen.getByLabelText('Latitud'), '95')
    await userEvent.type(screen.getByLabelText('Longitud'), '-79')
    expect(await screen.findByTestId('mapa')).toHaveAttribute('data-actual', '')
    expect(screen.getByLabelText('Latitud')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Longitud')).toHaveAttribute('aria-invalid', 'false')
  })

  it('el control deslizante respeta el rango y actualiza el radio', async () => {
    render(<Prueba />)
    const radio = screen.getByRole('slider')
    expect(radio).toHaveAttribute('min', '50')
    expect(radio).toHaveAttribute('max', '1000')
    fireEvent.change(radio, { target: { value: '450' } })
    expect(screen.getByText('450 m')).toBeInTheDocument()
  })
})

describe('SelectorZona · buscador de lugares', () => {
  const ECOTEC = { nombre: 'Universidad ECOTEC', detalle: 'Samborondón, Guayas', lat: -2.1357, lon: -79.8651 }
  const UNEMI = { nombre: 'Universidad Estatal de Milagro', detalle: 'Milagro, Guayas', lat: -2.1362, lon: -79.5894 }
  beforeEach(() => { vi.mocked(buscarLugares).mockReset() }) // con llaves: devolver el mock haría que vitest lo llame al terminar

  it('al escribir muestra sugerencias y al elegir una lleva el punto a latitud y longitud', async () => {
    vi.mocked(buscarLugares).mockResolvedValue([UNEMI, ECOTEC])
    const alLugar = vi.fn()
    function ConLugar() {
      const [v, setV] = useState<ValorZona>({ lat: '', lon: '', radio: 300 })
      return <SelectorZona valor={v} onCambio={setV} onLugar={alLugar} rango={RADIO_SEDE} ajustarA={[]} />
    }
    render(<ConLugar />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar lugar' }), 'universidad')
    const opciones = await screen.findAllByRole('option')
    expect(opciones).toHaveLength(2)
    expect(screen.getByText('Milagro, Guayas')).toBeInTheDocument()
    expect(buscarLugares).toHaveBeenCalledTimes(1) // una sola búsqueda, no una por letra
    expect(vi.mocked(buscarLugares).mock.calls[0][0]).toBe('universidad')
    await userEvent.click(within(opciones[0]).getByRole('button'))
    expect(screen.getByLabelText('Latitud')).toHaveValue('-2.1362')
    expect(screen.getByLabelText('Longitud')).toHaveValue('-79.5894')
    expect(alLugar).toHaveBeenCalledWith(UNEMI)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Buscar lugar' })).toHaveValue('')
  })

  it('no busca con menos de 3 letras', async () => {
    render(<Prueba />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar lugar' }), 'un')
    await new Promise((r) => setTimeout(r, 600))
    expect(buscarLugares).not.toHaveBeenCalled()
  })

  it('avisa cuando no hay resultados', async () => {
    vi.mocked(buscarLugares).mockResolvedValue([])
    render(<Prueba />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar lugar' }), 'xyzxyz')
    expect(await screen.findByText(/Sin resultados en Ecuador/)).toBeInTheDocument()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('si la búsqueda falla lo dice y deja usar el mapa y las coordenadas', async () => {
    vi.mocked(buscarLugares).mockRejectedValue(new Error('sin red'))
    render(<Prueba />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar lugar' }), 'milagro')
    expect(await screen.findByText(/No se pudo buscar ahora/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Latitud'), '-2.1')
    expect(screen.getByLabelText('Latitud')).toHaveValue('-2.1')
  })

  it('Escape cierra las sugerencias', async () => {
    vi.mocked(buscarLugares).mockResolvedValue([UNEMI])
    render(<Prueba />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Buscar lugar' }), 'milagro')
    await screen.findByRole('listbox')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
