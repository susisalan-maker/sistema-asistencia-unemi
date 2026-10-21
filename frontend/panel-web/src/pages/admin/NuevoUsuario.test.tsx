import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '../../lib/api'
import NuevoUsuario from './NuevoUsuario'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const SEDES = [{ id: 's1', nombre: 'Matriz Milagro' }]
beforeEach(() => { vi.mocked(api).mockReset() })

async function llenar(u: ReturnType<typeof userEvent.setup>) {
  await u.type(screen.getByLabelText('Nombres'), 'Valeria Sofía')
  await u.type(screen.getByLabelText('Apellidos'), 'Ortega Mora')
  await u.type(screen.getByLabelText('Email institucional'), 'v@unemi.edu.ec')
}

describe('NuevoUsuario · horario', () => {
  it('propone de lunes a viernes, 08:00 a 17:00, y lo envía junto con los datos', async () => {
    vi.mocked(api).mockResolvedValue({})
    const onCreado = vi.fn()
    render(<NuevoUsuario sedes={SEDES} onCerrar={() => {}} onCreado={onCreado} />)
    const u = userEvent.setup()
    await llenar(u)
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's1')
    expect(screen.getByRole('checkbox', { name: 'Viernes' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked()
    await u.click(screen.getByRole('checkbox', { name: 'Sábado' }))
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios', {
      method: 'POST',
      body: {
        nombres: 'Valeria Sofía', apellidos: 'Ortega Mora', email: 'v@unemi.edu.ec', rol: 'usuario', sede_id: 's1',
        jornada_inicio: '08:00', jornada_fin: '17:00', dias_laborables: [1, 2, 3, 4, 5, 6],
      },
    }))
    expect(onCreado).toHaveBeenCalled()
  })

  it('no deja crear un usuario sin ningún día laborable', async () => {
    render(<NuevoUsuario sedes={SEDES} onCerrar={() => {}} onCreado={() => {}} />)
    const u = userEvent.setup()
    await llenar(u)
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's1')
    for (const d of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']) await u.click(screen.getByRole('checkbox', { name: d }))
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos un día')
    expect(api).not.toHaveBeenCalled()
  })

  it('un administrador no lleva horario', async () => {
    vi.mocked(api).mockResolvedValue({})
    render(<NuevoUsuario sedes={SEDES} onCerrar={() => {}} onCreado={() => {}} />)
    const u = userEvent.setup()
    await llenar(u)
    await u.click(screen.getByRole('radio', { name: 'Administrador' }))
    expect(screen.queryByRole('checkbox', { name: 'Lunes' })).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Crear usuario' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios', {
      method: 'POST',
      body: { nombres: 'Valeria Sofía', apellidos: 'Ortega Mora', email: 'v@unemi.edu.ec', rol: 'administrador', sede_id: null },
    }))
  })
})
