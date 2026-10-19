import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { cadenaSupabase, renderConAuth } from '../../test/helpers'
import SedeDetalle from './SedeDetalle'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))
vi.mock('../../components/MapaLeaflet', () => ({
  default: (p: { onElegir?: (a: number, b: number) => void; contexto?: unknown[] }) => (
    <div data-testid="mapa" data-circulos={(p.contexto ?? []).length}>
      {p.onElegir && <button onClick={() => p.onElegir?.(-2.14, -79.6)}>clic en el mapa</button>}
    </div>
  ),
}))

const SEDE = { id: 's1', nombre: 'Matriz Milagro', latitud: -2.14, longitud: -79.6, radio_metros: 400, permite_fuera_geocerca: false, activa: true }
const M = { id: 'b1', sede_id: 's1', nombre: 'Bloque M', latitud: -2.14, longitud: -79.6, radio_metros: 60, activo: true }
const V = { id: 'b2', sede_id: 's1', nombre: 'Bloque V', latitud: -2.1415, longitud: -79.6, radio_metros: 40, activo: false }

function simularBase({ sede = SEDE as unknown, bloques = [M, V] as unknown[], error = null as unknown } = {}) {
  vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
    cadenaSupabase({ data: tabla === 'sedes' ? sede : bloques, error })) as never)
}

const pantalla = () => renderConAuth(
  <Routes><Route path="/admin/sedes/:id" element={<SedeDetalle />} /></Routes>, {}, '/admin/sedes/s1')

beforeEach(() => { vi.mocked(api).mockReset(); simularBase() })

describe('SedeDetalle', () => {
  it('muestra la sede, sus bloques y el mapa con todos los círculos', async () => {
    pantalla()
    expect(await screen.findByRole('heading', { name: 'Matriz Milagro' })).toBeInTheDocument()
    expect(screen.getByText(/radio 400 m · 1 de 2 bloques activos/)).toBeInTheDocument()
    expect(screen.getByText('Bloque M')).toBeInTheDocument()
    expect(screen.getByText('Bloque V')).toBeInTheDocument()
    expect(screen.getByText('60 m')).toBeInTheDocument()
    expect(await screen.findByTestId('mapa')).toHaveAttribute('data-circulos', '3') // sede + 2 bloques
    expect(screen.getByText(/zona aproximada/)).toBeInTheDocument()
  })

  it('sin bloques activos avisa que se valida contra la sede completa', async () => {
    simularBase({ bloques: [{ ...M, activo: false }] })
    pantalla()
    expect(await screen.findByText(/no tiene bloques activos/)).toBeInTheDocument()
  })

  it('una sede inexistente muestra el aviso y un enlace para volver', async () => {
    simularBase({ sede: null })
    pantalla()
    expect(await screen.findByText('No se encontró esta sede.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver a sedes/ })).toHaveAttribute('href', '/admin/sedes')
  })

  it('en una sede inactiva no se pueden agregar bloques', async () => {
    simularBase({ sede: { ...SEDE, activa: false } })
    pantalla()
    expect(await screen.findByRole('button', { name: 'Nuevo bloque' })).toBeDisabled()
    expect(screen.getByText(/sede está inactiva/)).toBeInTheDocument()
  })

  it('si la consulta falla muestra el error', async () => {
    simularBase({ sede: null, bloques: [], error: { message: 'boom' } })
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la sede')
  })
})

describe('SedeDetalle · bloques', () => {
  it('crea un bloque con el id de la sede y el radio inicial de 50 m', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo bloque' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo bloque' })
    await u.type(within(modal).getByLabelText('Nombre del bloque'), 'Bloque P')
    await u.click(await within(modal).findByText('clic en el mapa'))
    await u.click(within(modal).getByRole('button', { name: 'Crear bloque' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/bloques', {
      method: 'POST',
      body: { nombre: 'Bloque P', latitud: -2.14, longitud: -79.6, radio_metros: 50, sede_id: 's1' },
    }))
    expect(await screen.findByText('Bloque creado')).toBeInTheDocument()
  })

  it('avisa (sin bloquear) si el centro queda fuera del círculo de la sede', async () => {
    simularBase({ sede: { ...SEDE, latitud: 10, longitud: 10 }, bloques: [] })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo bloque' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo bloque' })
    await u.type(within(modal).getByLabelText('Latitud'), '-2.14')
    await u.type(within(modal).getByLabelText('Longitud'), '-79.6')
    expect(await within(modal).findByText(/fuera de su radio \(400 m\)/)).toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'Crear bloque' })).toBeEnabled()
  })

  it('avisa si se traslapa con otro bloque activo, pero no con uno inactivo', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo bloque' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo bloque' })
    await u.type(within(modal).getByLabelText('Latitud'), '-2.14')
    await u.type(within(modal).getByLabelText('Longitud'), '-79.6')
    expect(await within(modal).findByText(/Se traslapa con «Bloque M»/)).toBeInTheDocument()
    expect(within(modal).queryByText(/Bloque V/)).not.toBeInTheDocument()
    expect(within(modal).queryByText(/fuera de su radio/)).not.toBeInTheDocument()
  })

  it('al editar un bloque no se avisa de traslape consigo mismo y se usa PATCH', async () => {
    vi.mocked(api).mockResolvedValue({})
    simularBase({ bloques: [M] })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar Bloque M' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar bloque' })
    expect(within(modal).queryByText(/Se traslapa/)).not.toBeInTheDocument()
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/bloques/b1', {
      method: 'PATCH', body: { nombre: 'Bloque M', latitud: -2.14, longitud: -79.6, radio_metros: 60 },
    }))
  })

  it('muestra el error del servidor (nombre repetido en la sede)', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya existe un bloque con ese nombre en esta sede'))
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo bloque' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo bloque' })
    await u.type(within(modal).getByLabelText('Nombre del bloque'), 'Bloque M')
    await u.click(await within(modal).findByText('clic en el mapa'))
    await u.click(within(modal).getByRole('button', { name: 'Crear bloque' }))
    expect(await within(modal).findByText(/Ya existe un bloque con ese nombre/)).toBeInTheDocument()
  })

  it('desactivar un bloque pide confirmación y muestra el mensaje del servicio', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Bloque desactivado. La sede quedó sin bloques activos: se validará contra el círculo de la sede.' })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Desactivar Bloque M' }))
    const modal = await screen.findByRole('dialog', { name: 'Desactivar bloque' })
    expect(api).not.toHaveBeenCalled()
    await u.click(within(modal).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/bloques/b1/desactivar', { method: 'POST' }))
    expect(await screen.findByText(/círculo de la sede/)).toBeInTheDocument()
  })

  it('activar un bloque inactivo no pide confirmación', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Bloque activado' })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Bloque V' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/bloques/b2/activar', { method: 'POST' }))
    expect(await screen.findByText('Bloque activado')).toBeInTheDocument()
  })

  it('editar la sede desde el detalle usa PATCH sobre su id', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar sede' })
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes/s1', expect.objectContaining({ method: 'PATCH' })))
  })
})
