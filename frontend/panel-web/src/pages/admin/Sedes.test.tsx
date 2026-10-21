import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { buscarLugares } from '../../lib/buscarLugares'
import { supabase } from '../../lib/supabase'
import { cadenaSupabase, renderConAuth } from '../../test/helpers'
import Sedes from './Sedes'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/buscarLugares', () => ({ buscarLugares: vi.fn() }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))
vi.mock('../../components/MapaLeaflet', () => ({
  default: (p: { onElegir?: (a: number, b: number) => void }) => (
    <div data-testid="mapa"><button onClick={() => p.onElegir?.(-2.15, -79.5)}>clic en el mapa</button></div>
  ),
}))

const SEDES = [
  { id: 's1', nombre: 'Matriz Milagro', latitud: -2.14, longitud: -79.6, radio_metros: 400, permite_fuera_geocerca: false, activa: true },
  { id: 's2', nombre: 'Quito', latitud: -0.18, longitud: -78.47, radio_metros: 250, permite_fuera_geocerca: true, activa: false },
]
const BLOQUES = [
  { sede_id: 's1', activo: true }, { sede_id: 's1', activo: true }, { sede_id: 's1', activo: false },
]

function simularBase(sedes: unknown = SEDES, bloques: unknown = BLOQUES, error: unknown = null) {
  vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
    cadenaSupabase({ data: tabla === 'sedes' ? sedes : bloques, error })) as never)
}

const pantalla = () => renderConAuth(<Routes><Route path="/admin/sedes" element={<Sedes />} /></Routes>, {}, '/admin/sedes')

beforeEach(() => { vi.mocked(api).mockReset(); simularBase() })

describe('Sedes · listado', () => {
  it('muestra cada sede con su ubicación, radio, conteo de bloques y estado', async () => {
    pantalla()
    expect(await screen.findByRole('link', { name: 'Matriz Milagro' })).toHaveAttribute('href', '/admin/sedes/s1')
    expect(screen.getByText('-2.14, -79.6')).toBeInTheDocument()
    expect(screen.getByText('400 m')).toBeInTheDocument()
    expect(screen.getByText('2 de 3')).toBeInTheDocument()
    expect(screen.getByText('0 de 0')).toBeInTheDocument()
    expect(screen.getByText('Activa')).toBeInTheDocument()
    expect(screen.getByText('Inactiva')).toBeInTheDocument()
    expect(screen.getByText('Permite marcar fuera de la zona')).toBeInTheDocument()
    expect(screen.getByText(/2 sedes · 1 activas · 1 inactivas/)).toBeInTheDocument()
  })

  it('sin sedes invita a crear la primera', async () => {
    simularBase([], [])
    pantalla()
    expect(await screen.findByText(/Todavía no hay sedes/)).toBeInTheDocument()
  })

  it('si la consulta falla muestra el error', async () => {
    simularBase(null, null, { message: 'boom' })
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de sedes')
  })
})

describe('Sedes · crear', () => {
  it('crea una sede con los datos elegidos en el mapa y recarga la lista', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nueva sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Nueva sede' })
    await u.type(within(modal).getByLabelText('Nombre de la sede'), '  Guayaquil ')
    await u.click(await within(modal).findByText('clic en el mapa'))
    expect(within(modal).getByLabelText('Latitud')).toHaveValue('-2.15')
    await u.click(within(modal).getByRole('checkbox'))
    await u.click(within(modal).getByRole('button', { name: 'Crear sede' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes', {
      method: 'POST',
      body: { nombre: 'Guayaquil', latitud: -2.15, longitud: -79.5, radio_metros: 300, permite_fuera_geocerca: true },
    }))
    expect(await screen.findByText('Sede creada')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(supabase.from).toHaveBeenCalledTimes(4) // carga inicial (2) + recarga (2)
  })

  it('buscar un lugar rellena el nombre (si estaba vacío) y las coordenadas; Escape no cierra la ventana', async () => {
    vi.mocked(buscarLugares).mockResolvedValue([{ nombre: 'Universidad Estatal de Milagro', detalle: 'Milagro, Guayas', lat: -2.1362, lon: -79.5894 }])
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nueva sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Nueva sede' })
    await u.type(within(modal).getByRole('combobox', { name: 'Buscar lugar' }), 'unemi')
    await within(modal).findByRole('listbox')
    await u.keyboard('{Escape}')
    expect(within(modal).queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Nueva sede' })).toBeInTheDocument()
    await u.type(within(modal).getByRole('combobox', { name: 'Buscar lugar' }), 'x')
    await u.click(within(await within(modal).findByRole('listbox')).getByRole('button'))
    expect(within(modal).getByLabelText('Nombre de la sede')).toHaveValue('Universidad Estatal de Milagro')
    expect(within(modal).getByLabelText('Latitud')).toHaveValue('-2.1362')
    await u.click(within(modal).getByRole('button', { name: 'Crear sede' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes', expect.objectContaining({
      body: expect.objectContaining({ nombre: 'Universidad Estatal de Milagro', latitud: -2.1362, longitud: -79.5894 }) })))
  })

  it('buscar un lugar no pisa el nombre que ya se escribió', async () => {
    vi.mocked(buscarLugares).mockResolvedValue([{ nombre: 'Universidad Estatal de Milagro', detalle: '', lat: -2.1362, lon: -79.5894 }])
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nueva sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Nueva sede' })
    await u.type(within(modal).getByLabelText('Nombre de la sede'), 'Matriz')
    await u.type(within(modal).getByRole('combobox', { name: 'Buscar lugar' }), 'unemi')
    await u.click(within(await within(modal).findByRole('listbox')).getByRole('button'))
    expect(within(modal).getByLabelText('Nombre de la sede')).toHaveValue('Matriz')
  })

  it('no envía nada si falta el punto o está fuera de rango', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nueva sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Nueva sede' })
    await u.type(within(modal).getByLabelText('Nombre de la sede'), 'Guayaquil')
    await u.click(within(modal).getByRole('button', { name: 'Crear sede' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent(/latitud/i)
    await u.type(within(modal).getByLabelText('Latitud'), '95')
    await u.type(within(modal).getByLabelText('Longitud'), '-79')
    await u.click(within(modal).getByRole('button', { name: 'Crear sede' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent(/latitud/i)
    expect(api).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor (nombre repetido) y deja la ventana abierta', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya existe una sede con ese nombre'))
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nueva sede' }))
    const modal = await screen.findByRole('dialog', { name: 'Nueva sede' })
    await u.type(within(modal).getByLabelText('Nombre de la sede'), 'Quito')
    await u.click(await within(modal).findByText('clic en el mapa'))
    await u.click(within(modal).getByRole('button', { name: 'Crear sede' }))
    expect(await within(modal).findByText('Ya existe una sede con ese nombre')).toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'Crear sede' })).toBeEnabled()
  })
})

describe('Sedes · editar y cambiar estado', () => {
  it('edita una sede con sus datos cargados', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar Matriz Milagro' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar sede' })
    expect(within(modal).getByLabelText('Nombre de la sede')).toHaveValue('Matriz Milagro')
    expect(within(modal).getByLabelText('Latitud')).toHaveValue('-2.14')
    expect(within(modal).getByText('400 m', { selector: 'output' })).toBeInTheDocument()
    await u.clear(within(modal).getByLabelText('Nombre de la sede'))
    await u.type(within(modal).getByLabelText('Nombre de la sede'), 'Matriz')
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes/s1', {
      method: 'PATCH',
      body: { nombre: 'Matriz', latitud: -2.14, longitud: -79.6, radio_metros: 400, permite_fuera_geocerca: false },
    }))
    expect(await screen.findByText('Sede actualizada')).toBeInTheDocument()
  })

  it('desactivar pide confirmación y no actúa si se cancela', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Desactivar Matriz Milagro' }))
    const modal = await screen.findByRole('dialog', { name: 'Desactivar sede' })
    await u.click(within(modal).getByRole('button', { name: 'Cancelar' }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('desactivar confirmado llama al servicio y muestra su mensaje', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Sede desactivada; su historial se conserva' })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Desactivar Matriz Milagro' }))
    await u.click(within(await screen.findByRole('dialog', { name: 'Desactivar sede' })).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes/s1/desactivar', { method: 'POST' }))
    expect(await screen.findByText('Sede desactivada; su historial se conserva')).toBeInTheDocument()
  })

  it('si la sede tiene usuarios activos muestra el motivo del servidor', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'La sede tiene 3 usuario(s) activo(s) asignado(s).'))
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Desactivar Matriz Milagro' }))
    await u.click(within(await screen.findByRole('dialog', { name: 'Desactivar sede' })).getByRole('button', { name: 'Desactivar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('3 usuario(s) activo(s)')
  })

  it('activar una sede inactiva no pide confirmación', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Sede activada' })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Quito' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/sedes/s2/activar', { method: 'POST' }))
    expect(await screen.findByText('Sede activada')).toBeInTheDocument()
  })
})
