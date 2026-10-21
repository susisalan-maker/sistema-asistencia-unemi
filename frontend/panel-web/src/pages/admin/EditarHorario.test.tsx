import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../lib/api'
import EditarHorario from './EditarHorario'
import type { FilaUsuario } from './usuariosTipos'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const USUARIO: FilaUsuario = {
  id: 'u1', nombres: 'Ana María', apellidos: 'Pérez Loor', email: 'a@x.com', rol: 'usuario', activo: true,
  dispositivo_id: null, fecha_registro_rostro: null, jornada_inicio: '08:00:00', jornada_fin: '17:00:00',
  dias_laborables: [1, 2, 3, 4, 5], sedes: { nombre: 'Matriz' },
}

beforeEach(() => { vi.mocked(api).mockReset() })

describe('EditarHorario', () => {
  it('parte del horario actual de la persona', () => {
    render(<EditarHorario usuario={USUARIO} onCerrar={() => {}} onGuardado={() => {}} />)
    expect(screen.getByLabelText('Hora de entrada')).toHaveValue('08:00')
    expect(screen.getByRole('checkbox', { name: 'Viernes' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked()
  })

  it('envía el horario nuevo al microservicio y avisa', async () => {
    vi.mocked(api).mockResolvedValue({})
    const onGuardado = vi.fn()
    render(<EditarHorario usuario={USUARIO} onCerrar={() => {}} onGuardado={onGuardado} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('checkbox', { name: 'Sábado' }))
    await u.click(screen.getByRole('checkbox', { name: 'Viernes' }))
    await u.click(screen.getByRole('button', { name: 'Guardar horario' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/horario', {
      method: 'PATCH', body: { jornada_inicio: '08:00', jornada_fin: '17:00', dias_laborables: [1, 2, 3, 4, 6] },
    }))
    expect(onGuardado).toHaveBeenCalledWith('Horario de Ana María Pérez Loor actualizado')
  })

  it('no deja guardar sin días ni con la salida antes de la entrada', async () => {
    render(<EditarHorario usuario={{ ...USUARIO, dias_laborables: [1] }} onCerrar={() => {}} onGuardado={() => {}} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('checkbox', { name: 'Lunes' }))
    await u.click(screen.getByRole('button', { name: 'Guardar horario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos un día')
    await u.click(screen.getByRole('checkbox', { name: 'Lunes' }))
    await u.clear(screen.getByLabelText('Hora de salida'))
    await u.type(screen.getByLabelText('Hora de salida'), '07:00')
    await u.click(screen.getByRole('button', { name: 'Guardar horario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('después de la entrada')
    expect(api).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor y deja volver a intentar', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(422, 'La jornada debe terminar después de iniciar'))
    render(<EditarHorario usuario={USUARIO} onCerrar={() => {}} onGuardado={() => {}} />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Guardar horario' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La jornada debe terminar después de iniciar')
    expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeEnabled()
  })
})
