import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { cadenaSupabase, perfilDe, renderConAuth } from '../../test/helpers'
import Usuarios from './Usuarios'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const base = { activo: true, dispositivo_id: null, fecha_registro_rostro: null, sede_id: 's1', sedes: { nombre: 'Matriz' } }
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

const pantalla = () => renderConAuth(
  <Routes><Route path="/admin/usuarios" element={<Usuarios />} /></Routes>,
  { perfil: perfilDe('administrador') }, '/admin/usuarios',
)

describe('Usuarios · editar horario', () => {
  it('cada usuario tiene un botón «Editar»; el administrador no (no tiene horario)', async () => {
    pantalla()
    await screen.findByText('Ana Pérez')
    expect(screen.getByRole('button', { name: 'Editar horario de Ana Pérez' })).toHaveTextContent('Editar')
    expect(screen.queryByRole('button', { name: /Editar horario de Raúl/ })).not.toBeInTheDocument()
  })

  it('abre el formulario con el horario actual y guarda los cambios', async () => {
    vi.mocked(api).mockResolvedValue({})
    pantalla()
    const u = userEvent.setup()
    await u.click(await screen.findByRole('button', { name: 'Editar horario de Ana Pérez' }))
    const modal = await screen.findByRole('dialog', { name: 'Editar horario' })
    expect(within(modal).getByLabelText('Hora de entrada')).toHaveValue('08:00')
    await u.click(within(modal).getByRole('button', { name: /Guardar/ }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/horario', {
      method: 'PATCH', body: { jornada_inicio: '08:00', jornada_fin: '17:00', dias_laborables: [1, 2, 3, 4, 5] },
    }))
    expect(await screen.findByRole('status')).toHaveTextContent('Horario de Ana Pérez actualizado')
  })
})
