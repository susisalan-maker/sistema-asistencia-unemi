import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { cadenaSupabase, renderConAuth } from '../../test/helpers'
import Feriados from './Feriados'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const FERIADOS = [
  { id: 'f1', fecha: '2026-11-02', nombre: 'Día de Difuntos', activo: true },
  { id: 'f2', fecha: '2026-12-25', nombre: 'Navidad', activo: false },
]
const simular = (data: unknown = FERIADOS, error: unknown = null) =>
  vi.mocked(supabase.from).mockImplementation((() => cadenaSupabase({ data, error })) as never)
const pantalla = () => renderConAuth(<Routes><Route path="/admin/feriados" element={<Feriados />} /></Routes>, {}, '/admin/feriados')

beforeEach(() => { vi.mocked(api).mockReset(); simular() })

describe('Feriados · listado', () => {
  it('muestra la fecha completa, el nombre y el estado', async () => {
    pantalla()
    expect(await screen.findByText('Día de Difuntos')).toBeInTheDocument()
    expect(screen.getByText(/2 de noviembre de 2026/)).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText(/2 registrados · 1 activos/)).toBeInTheDocument()
    expect(supabase.from).toHaveBeenCalledWith('feriados')
  })

  it('sin feriados invita a crear el primero', async () => {
    simular([])
    pantalla()
    expect(await screen.findByText(/Todavía no hay feriados/)).toBeInTheDocument()
  })

  it('si la consulta falla muestra el error', async () => {
    simular(null, { message: 'boom' })
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de feriados')
  })
})

describe('Feriados · acciones', () => {
  it('crea un feriado con la fecha y el nombre limpios', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    await u.type(within(modal).getByLabelText('Fecha'), '2026-11-03')
    await u.type(within(modal).getByLabelText('Nombre'), '  Independencia de Cuenca ')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados', {
      method: 'POST', body: { fecha: '2026-11-03', nombre: 'Independencia de Cuenca' },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Feriado creado')
  })

  it('crea un feriado de varios días con «Hasta» y avisa cuántos días', async () => {
    vi.mocked(api).mockResolvedValue({ creados: ['2027-02-08', '2027-02-09'], omitidos: [] })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    await u.type(within(modal).getByLabelText('Fecha'), '2027-02-08')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-02-09')
    await u.type(within(modal).getByLabelText('Nombre'), 'Carnaval')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados', {
      method: 'POST', body: { fecha: '2027-02-08', nombre: 'Carnaval', hasta: '2027-02-09' },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Feriado creado en 2 días')
  })

  it('avisa si algún día del rango ya tenía feriado', async () => {
    vi.mocked(api).mockResolvedValue({ creados: ['2027-02-08'], omitidos: ['2027-02-09'] })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    await u.type(within(modal).getByLabelText('Fecha'), '2027-02-08')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-02-09')
    await u.type(within(modal).getByLabelText('Nombre'), 'Carnaval')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(await screen.findByRole('status')).toHaveTextContent('1 ya tenían feriado')
  })

  it('no deja una fecha final anterior a la inicial', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    await u.type(within(modal).getByLabelText('Fecha'), '2027-02-09')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-02-08')
    await u.type(within(modal).getByLabelText('Nombre'), 'Carnaval')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(api).not.toHaveBeenCalled()
    expect(await within(modal).findByRole('alert')).toHaveTextContent('no puede ser anterior')
  })

  it('no envía nada si falta la fecha (el campo es obligatorio)', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    expect(within(modal).getByLabelText('Fecha')).toBeRequired()
    await u.type(within(modal).getByLabelText('Nombre'), 'Algo')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Nuevo feriado' })).toBeInTheDocument()
  })

  it('muestra el error del servidor (fecha repetida)', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya hay un feriado registrado en esa fecha'))
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    await u.type(within(modal).getByLabelText('Fecha'), '2026-11-02')
    await u.type(within(modal).getByLabelText('Nombre'), 'Repetido')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent('esa fecha')
  })

  it('edita un feriado existente', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar Día de Difuntos' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar feriado' })
    expect(within(modal).getByLabelText('Fecha')).toHaveValue('2026-11-02')
    await u.clear(within(modal).getByLabelText('Nombre'))
    await u.type(within(modal).getByLabelText('Nombre'), 'Difuntos')
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados/f1', { method: 'PATCH', body: { fecha: '2026-11-02', nombre: 'Difuntos' } }))
  })

  it('desactiva con confirmación y activa directo', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'listo' })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Desactivar Día de Difuntos' }))
    expect(api).not.toHaveBeenCalled()
    await u.click(within(await screen.findByRole('dialog', { name: 'Desactivar feriado' })).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados/f1/desactivar', { method: 'POST' }))
    await u.click(screen.getByRole('button', { name: 'Activar Navidad' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados/f2/activar', { method: 'POST' }))
  })
})
