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
  { id: 'f1', fecha_inicio: '2026-10-31', fecha_fin: '2026-11-03', nombre: 'Día de Difuntos', activo: true },
  { id: 'f2', fecha_inicio: '2026-12-25', fecha_fin: '2026-12-25', nombre: 'Navidad', activo: false },
]
const simular = (data: unknown = FERIADOS, error: unknown = null) =>
  vi.mocked(supabase.from).mockImplementation((() => cadenaSupabase({ data, error })) as never)
const pantalla = () => renderConAuth(<Routes><Route path="/admin/feriados" element={<Feriados />} /></Routes>, {}, '/admin/feriados')

beforeEach(() => { vi.mocked(api).mockReset(); simular() })

describe('Feriados · listado', () => {
  it('un feriado de varios días es una sola fila con su inicio, su fin y cuántos días dura', async () => {
    pantalla()
    expect(await screen.findByText('Día de Difuntos')).toBeInTheDocument()
    expect(screen.getAllByText('Día de Difuntos')).toHaveLength(1)
    expect(screen.getByText(/sábado, 31 de octubre de 2026/)).toBeInTheDocument()
    expect(screen.getByText(/hasta el martes, 3 de noviembre de 2026 · 4 días/)).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByText(/2 registrados · 1 activos/)).toBeInTheDocument()
    expect(supabase.from).toHaveBeenCalledWith('feriados')
  })

  it('un feriado de un solo día no muestra «hasta»', async () => {
    pantalla()
    await screen.findByText('Navidad')
    expect(screen.getAllByText(/hasta el/)).toHaveLength(1)   // solo el de varios días
    expect(screen.getByText(/25 de diciembre de 2026/)).toBeInTheDocument()
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

describe('Feriados · crear', () => {
  async function abrirNuevo() {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Nuevo feriado' }))
    const modal = await screen.findByRole('dialog', { name: 'Nuevo feriado' })
    return { u, modal }
  }

  it('de un solo día: «Hasta» vacío envía fin = inicio', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u, modal } = await abrirNuevo()
    await u.type(within(modal).getByLabelText('Desde'), '2026-11-03')
    await u.type(within(modal).getByLabelText('Nombre'), '  Independencia de Cuenca ')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados', {
      method: 'POST', body: { fecha_inicio: '2026-11-03', fecha_fin: '2026-11-03', nombre: 'Independencia de Cuenca' },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Feriado creado')
  })

  it('de varios días: un solo envío con inicio y fin', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u, modal } = await abrirNuevo()
    await u.type(within(modal).getByLabelText('Desde'), '2027-02-08')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-02-09')
    await u.type(within(modal).getByLabelText('Nombre'), 'Carnaval')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenCalledWith('/feriados', {
      method: 'POST', body: { fecha_inicio: '2027-02-08', fecha_fin: '2027-02-09', nombre: 'Carnaval' },
    })
  })

  it('no deja una fecha final anterior a la inicial', async () => {
    const { u, modal } = await abrirNuevo()
    await u.type(within(modal).getByLabelText('Desde'), '2027-02-09')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-02-08')
    await u.type(within(modal).getByLabelText('Nombre'), 'Carnaval')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(api).not.toHaveBeenCalled()
    expect(await within(modal).findByRole('alert')).toHaveTextContent('no puede ser anterior')
  })

  it('no deja pasar de 31 días seguidos', async () => {
    const { u, modal } = await abrirNuevo()
    await u.type(within(modal).getByLabelText('Desde'), '2027-02-01')
    await u.type(within(modal).getByLabelText('Hasta (opcional)'), '2027-03-10')
    await u.type(within(modal).getByLabelText('Nombre'), 'Muy largo')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(api).not.toHaveBeenCalled()
    expect(await within(modal).findByRole('alert')).toHaveTextContent('máximo 31 días')
  })

  it('no envía nada si falta la fecha de inicio (el campo es obligatorio)', async () => {
    const { u, modal } = await abrirNuevo()
    expect(within(modal).getByLabelText('Desde')).toBeRequired()
    await u.type(within(modal).getByLabelText('Nombre'), 'Algo')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Nuevo feriado' })).toBeInTheDocument()
  })

  it('muestra el error del servidor (se cruza con otro feriado)', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya hay un feriado activo que se cruza con esas fechas'))
    const { u, modal } = await abrirNuevo()
    await u.type(within(modal).getByLabelText('Desde'), '2026-11-02')
    await u.type(within(modal).getByLabelText('Nombre'), 'Repetido')
    await u.click(within(modal).getByRole('button', { name: 'Crear feriado' }))
    expect(await within(modal).findByRole('alert')).toHaveTextContent('se cruza')
  })
})

describe('Feriados · editar y activar', () => {
  it('al editar muestra el inicio y el fin guardados', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar Día de Difuntos' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar feriado' })
    expect(within(modal).getByLabelText('Desde')).toHaveValue('2026-10-31')
    expect(within(modal).getByLabelText('Hasta (opcional)')).toHaveValue('2026-11-03')
    await u.clear(within(modal).getByLabelText('Nombre'))
    await u.type(within(modal).getByLabelText('Nombre'), 'Difuntos')
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/feriados/f1', {
      method: 'PATCH', body: { fecha_inicio: '2026-10-31', fecha_fin: '2026-11-03', nombre: 'Difuntos' },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Feriado actualizado')
  })

  it('un feriado de un día se edita con «Hasta» vacío', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar Navidad' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar feriado' })
    expect(within(modal).getByLabelText('Desde')).toHaveValue('2026-12-25')
    expect(within(modal).getByLabelText('Hasta (opcional)')).toHaveValue('')
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

  it('si activar choca con otro feriado muestra el aviso del servidor', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya hay un feriado activo que se cruza con esas fechas'))
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Activar Navidad' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('se cruza')
  })
})
