import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { cadenaSupabase, perfilDe, renderConAuth } from '../../test/helpers'
import Usuarios from './Usuarios'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const base = { activo: true, dispositivo_id: 'ios:abc', fecha_registro_rostro: null, sede_id: 's1', sedes: { nombre: 'Matriz' } }
const USUARIOS = [
  { ...base, id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'ana@x.ec', rol: 'usuario',
    jornada_inicio: '08:00:00', jornada_fin: '17:00:00', dias_laborables: [1, 2, 3, 4, 5] },
  { ...base, id: 'a1', nombres: 'Raúl', apellidos: 'Admin', email: 'raul@x.ec', rol: 'administrador',
    jornada_inicio: '08:00:00', jornada_fin: '17:00:00', dias_laborables: [1, 2, 3, 4, 5] },
]

beforeEach(() => {
  vi.mocked(api).mockReset()
  vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
    cadenaSupabase({ data: tabla === 'sedes' ? [{ id: 's1', nombre: 'Matriz' }] : USUARIOS, error: null })) as never)
})

const pantalla = (perfil = { ...perfilDe('administrador'), id: 'admin-yo' }) => renderConAuth(
  <Routes><Route path="/admin/usuarios" element={<Usuarios />} /></Routes>,
  { perfil }, '/admin/usuarios',
)

describe('Usuarios · editar', () => {
  it('cada usuario y cada otro administrador tienen un botón «Editar»', async () => {
    pantalla()
    await screen.findByText('Ana Pérez')
    expect(screen.getByRole('button', { name: 'Editar a Ana Pérez' })).toHaveTextContent('✎')
    expect(screen.getByRole('button', { name: 'Editar a Raúl Admin' })).toBeInTheDocument()
  })

  it('tu propia fila de administrador no tiene «Editar» (no tiene horario ni puede cambiar su rol)', async () => {
    pantalla({ ...perfilDe('administrador'), id: 'a1' })
    await screen.findByText('Ana Pérez')
    expect(screen.queryByRole('button', { name: 'Editar a Raúl Admin' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar a Ana Pérez' })).toBeInTheDocument()
  })

  it('abre el formulario con los datos actuales, guarda un cambio y recarga la lista', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar a Ana Pérez' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar usuario' })
    expect(within(modal).getByLabelText('Hora de entrada')).toHaveValue('08:00')
    await u.click(within(modal).getByRole('checkbox', { name: 'Sábado' }))
    await u.click(within(modal).getByRole('button', { name: 'Guardar cambios' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1', { method: 'PATCH', body: { dias_laborables: [1, 2, 3, 4, 5, 6] } }))
    expect(await screen.findByRole('status')).toHaveTextContent('Los datos de Ana Pérez se actualizaron')
    expect(screen.queryByRole('dialog', { name: 'Editar usuario' })).not.toBeInTheDocument()
  })
})

describe('Usuarios · reiniciar celular (W4.3)', () => {
  it('pide confirmación y llama a reiniciar-dispositivo', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Celular reiniciado' })
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Reiniciar celular de Ana Pérez' }))
    const modal = await screen.findByRole('dialog', { name: 'Reiniciar vinculación' })
    expect(api).not.toHaveBeenCalled()
    await u.click(within(modal).getByRole('button', { name: 'Sí, reiniciar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/reiniciar-dispositivo', { method: 'POST' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Celular reiniciado')
  })

  it('cancelar no cambia nada', async () => {
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Reiniciar celular de Ana Pérez' }))
    await u.click(within(await screen.findByRole('dialog', { name: 'Reiniciar vinculación' })).getByRole('button', { name: 'Cancelar' }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin celular vinculado el botón está desactivado', async () => {
    vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
      cadenaSupabase({ data: tabla === 'sedes' ? [] : [{ ...USUARIOS[0], dispositivo_id: null }], error: null })) as never)
    pantalla()
    expect(await screen.findByRole('button', { name: 'Reiniciar celular de Ana Pérez' })).toBeDisabled()
  })
})
