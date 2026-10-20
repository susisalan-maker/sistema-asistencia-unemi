import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import EditarUsuario from './EditarUsuario'
import type { FilaUsuario, SedeOpcion } from './usuariosTipos'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const SEDES: SedeOpcion[] = [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Instituto Bolivariano' }]
const ANA: FilaUsuario = {
  id: 'u1', nombres: 'Ana María', apellidos: 'Pérez Loor', email: 'a@x.com', rol: 'usuario', activo: true,
  dispositivo_id: null, fecha_registro_rostro: null, jornada_inicio: '08:00:00', jornada_fin: '17:00:00',
  dias_laborables: [1, 2, 3, 4, 5], sede_id: 's1', sedes: { nombre: 'Matriz' },
}
const RAUL: FilaUsuario = { ...ANA, id: 'a1', nombres: 'Raúl', apellidos: 'Admin', rol: 'administrador', sede_id: null, sedes: null }
const YO = { ...perfilDe('administrador'), id: 'admin-yo' }

beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(supabase.rpc).mockReset() })

function abrir(usuario: FilaUsuario = ANA, props: { sedes?: SedeOpcion[]; onGuardado?: (m: string) => void; perfil?: typeof YO } = {}) {
  const onGuardado = props.onGuardado ?? vi.fn()
  renderConAuth(
    <EditarUsuario usuario={usuario} sedes={props.sedes ?? SEDES} onCerrar={() => {}} onGuardado={onGuardado} />,
    { perfil: props.perfil ?? YO },
  )
  return { u: userEvent.setup(), onGuardado }
}
const guardar = (u: ReturnType<typeof userEvent.setup>) => u.click(screen.getByRole('button', { name: 'Guardar cambios' }))

describe('EditarUsuario · datos actuales', () => {
  it('parte de lo que la persona ya tiene', () => {
    abrir()
    expect(screen.getByRole('radio', { name: 'Usuario' })).toBeChecked()
    expect(screen.getByLabelText('Sede asignada')).toHaveValue('s1')
    expect(screen.getByLabelText('Hora de entrada')).toHaveValue('08:00')
    expect(screen.getByRole('checkbox', { name: 'Viernes' })).toBeChecked()
  })

  it('si su sede ya está inactiva la deja visible y marcada', () => {
    abrir(ANA, { sedes: [SEDES[1]!] })
    const select = screen.getByLabelText('Sede asignada')
    expect(select).toHaveValue('s1')
    expect(within(select).getByRole('option', { name: 'Matriz (inactiva)' })).toBeInTheDocument()
  })

  it('no deja cambiarse el propio rol', () => {
    abrir(ANA, { perfil: { ...YO, id: 'u1' } })
    expect(screen.getByRole('radio', { name: 'Administrador' })).toBeDisabled()
    expect(screen.getByText('No puedes cambiar tu propio rol.')).toBeInTheDocument()
  })
})

describe('EditarUsuario · nombres y correo', () => {
  it('muestra los nombres y el correo actuales', () => {
    abrir()
    expect(screen.getByLabelText('Nombres')).toHaveValue('Ana María')
    expect(screen.getByLabelText('Apellidos')).toHaveValue('Pérez Loor')
    expect(screen.getByLabelText('Correo institucional')).toHaveValue('a@x.com')
  })

  it('corregir un nombre envía solo los nombres, sin espacios sobrantes', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: null })
    const { u, onGuardado } = abrir()
    await u.clear(screen.getByLabelText('Nombres'))
    await u.type(screen.getByLabelText('Nombres'), '  Ana Maria  ')
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1', { method: 'PATCH', body: { nombres: 'Ana Maria' } }))
    expect(onGuardado).toHaveBeenCalledWith('Los datos de Ana Maria Pérez Loor se actualizaron')
  })

  it('cambiar el correo avisa que deberá entrar con el nuevo y usa el mensaje del servidor', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Correo actualizado: desde ahora la persona debe iniciar sesión con el correo nuevo.' })
    const { u, onGuardado } = abrir()
    expect(screen.getByText('Es con el correo que la persona inicia sesión.')).toBeInTheDocument()
    await u.clear(screen.getByLabelText('Correo institucional'))
    await u.type(screen.getByLabelText('Correo institucional'), 'ana.nueva@x.com')
    expect(screen.getByText(/deberá entrar con el correo nuevo/)).toBeInTheDocument()
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1', { method: 'PATCH', body: { email: 'ana.nueva@x.com' } }))
    expect(onGuardado).toHaveBeenCalledWith('Correo actualizado: desde ahora la persona debe iniciar sesión con el correo nuevo.')
  })

  it('el mismo correo escrito con otras mayúsculas no cuenta como cambio', async () => {
    const { u } = abrir()
    await u.clear(screen.getByLabelText('Correo institucional'))
    await u.type(screen.getByLabelText('Correo institucional'), 'A@X.COM')
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios para guardar')
    expect(api).not.toHaveBeenCalled()
  })

  it('no deja nombres de menos de 2 letras', async () => {
    const { u } = abrir()
    await u.clear(screen.getByLabelText('Apellidos'))
    await u.type(screen.getByLabelText('Apellidos'), 'P')
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 2 letras')
    expect(api).not.toHaveBeenCalled()
  })

  it('un correo ya usado muestra el aviso del servidor y no cierra el formulario', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(409, 'Ya existe un usuario con ese correo'))
    const { u, onGuardado } = abrir()
    await u.clear(screen.getByLabelText('Correo institucional'))
    await u.type(screen.getByLabelText('Correo institucional'), 'otro@x.com')
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un usuario con ese correo')
    expect(onGuardado).not.toHaveBeenCalled()
  })

  it('tu propio correo está bloqueado, pero tus nombres no', () => {
    abrir(ANA, { perfil: { ...YO, id: 'u1' } })
    expect(screen.getByLabelText('Correo institucional')).toBeDisabled()
    expect(screen.getByText('Tu propio correo no se puede cambiar desde aquí.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nombres')).toBeEnabled()
  })

  it('un administrador también muestra nombres y correo', () => {
    abrir(RAUL)
    expect(screen.getByLabelText('Nombres')).toHaveValue('Raúl')
    expect(screen.getByLabelText('Correo institucional')).toBeEnabled()
  })
})

describe('EditarUsuario · guardar', () => {
  it('cambiar solo la sede envía solo la sede', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u, onGuardado } = abrir()
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's2')
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1', { method: 'PATCH', body: { sede_id: 's2' } }))
    expect(onGuardado).toHaveBeenCalledWith('Los datos de Ana María Pérez Loor se actualizaron')
  })

  it('sede y horario juntos, en una sola llamada y solo lo que cambió', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u } = abrir()
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's2')
    await u.clear(screen.getByLabelText('Hora de salida'))
    await u.type(screen.getByLabelText('Hora de salida'), '16:00')
    await u.click(screen.getByRole('checkbox', { name: 'Sábado' }))
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api).toHaveBeenCalledWith('/usuarios/u1', {
      method: 'PATCH', body: { sede_id: 's2', jornada_fin: '16:00', dias_laborables: [1, 2, 3, 4, 5, 6] },
    })
  })

  it('sin cambios no llama al servidor', async () => {
    const { u } = abrir()
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay cambios para guardar')
    expect(api).not.toHaveBeenCalled()
  })

  it('no deja guardar con la salida antes de la entrada ni sin días', async () => {
    const { u } = abrir()
    await u.clear(screen.getByLabelText('Hora de salida'))
    await u.type(screen.getByLabelText('Hora de salida'), '07:00')
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('después de la entrada')
    expect(api).not.toHaveBeenCalled()
  })

  it('muestra el error del servidor y deja volver a intentar', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(422, 'Esa sede no existe o está inactiva'))
    const { u } = abrir()
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's2')
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa sede no existe o está inactiva')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })
})

describe('EditarUsuario · rol', () => {
  it('pasar a administrador oculta sede y horario y envía solo el rol', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u } = abrir()
    await u.click(screen.getByRole('radio', { name: 'Administrador' }))
    expect(screen.queryByLabelText('Sede asignada')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Hora de entrada')).not.toBeInTheDocument()
    expect(screen.getByText(/ya no marcará asistencia en la app/)).toBeInTheDocument()
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1', { method: 'PATCH', body: { rol: 'administrador' } }))
  })

  it('un administrador no muestra sede, horario ni celular', () => {
    abrir(RAUL)
    expect(screen.queryByLabelText('Sede asignada')).not.toBeInTheDocument()
    expect(screen.queryByText('Celular')).not.toBeInTheDocument()
  })

  it('pasar de administrador a usuario exige elegir sede', async () => {
    vi.mocked(api).mockResolvedValue({})
    const { u } = abrir(RAUL)
    await u.click(screen.getByRole('radio', { name: 'Usuario' }))
    await guardar(u)
    expect(await screen.findByRole('alert')).toHaveTextContent('Elige la sede')
    expect(api).not.toHaveBeenCalled()
    await u.selectOptions(screen.getByLabelText('Sede asignada'), 's2')
    await guardar(u)
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/a1', { method: 'PATCH', body: { rol: 'usuario', sede_id: 's2' } }))
  })
})

describe('EditarUsuario · celular', () => {
  const CON_CELULAR = { ...ANA, dispositivo_id: 'ios:abc' }

  it('sin celular vinculado lo dice y no ofrece reiniciar', () => {
    abrir()
    expect(screen.getByText('Sin vincular')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reiniciar celular vinculado' })).not.toBeInTheDocument()
  })

  it('reiniciar pide confirmación y luego avisa con el mensaje del servidor', async () => {
    vi.mocked(api).mockResolvedValue({ mensaje: 'Celular desvinculado: la persona podrá vincular otro al abrir la app' })
    const { u, onGuardado } = abrir(CON_CELULAR)
    expect(screen.getByText('Vinculado')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Reiniciar celular vinculado' }))
    expect(api).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Sí, reiniciar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/reiniciar-dispositivo', { method: 'POST' }))
    expect(onGuardado).toHaveBeenCalledWith('Celular desvinculado: la persona podrá vincular otro al abrir la app')
  })

  it('«No, volver» cancela sin llamar al servidor', async () => {
    const { u } = abrir(CON_CELULAR)
    await u.click(screen.getByRole('button', { name: 'Reiniciar celular vinculado' }))
    await u.click(screen.getByRole('button', { name: 'No, volver' }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Reiniciar celular vinculado' })).toBeInTheDocument()
  })

  it('si falla el reinicio muestra el error y vuelve al botón', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(502, 'No se pudo reiniciar el celular: x'))
    const { u } = abrir(CON_CELULAR)
    await u.click(screen.getByRole('button', { name: 'Reiniciar celular vinculado' }))
    await u.click(screen.getByRole('button', { name: 'Sí, reiniciar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo reiniciar el celular')
    expect(screen.getByRole('button', { name: 'Reiniciar celular vinculado' })).toBeInTheDocument()
  })
})

describe('EditarUsuario · rostro', () => {
  const CON_ROSTRO = { ...ANA, fecha_registro_rostro: '2026-10-10T15:00:00+00:00' }

  it('sin rostro lo dice y no ofrece resetear', () => {
    abrir()
    expect(screen.getByText('Sin registrar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resetear rostro' })).not.toBeInTheDocument()
  })

  it('un administrador no tiene sección de rostro', () => {
    abrir(RAUL)
    expect(screen.queryByText('Rostro')).not.toBeInTheDocument()
  })

  it('resetear pide confirmación y luego llama a la función de la base', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    const { u, onGuardado } = abrir(CON_ROSTRO)
    expect(screen.getByText('Registrado')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Resetear rostro' }))
    expect(supabase.rpc).not.toHaveBeenCalled()
    await u.click(screen.getByRole('button', { name: 'Sí, resetear' }))
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith('resetear_rostro', { p_usuario: 'u1' }))
    expect(onGuardado).toHaveBeenCalledWith(expect.stringContaining('se reinició'))
  })

  it('«No, volver» cancela sin tocar nada', async () => {
    const { u } = abrir(CON_ROSTRO)
    await u.click(screen.getByRole('button', { name: 'Resetear rostro' }))
    await u.click(screen.getByRole('button', { name: 'No, volver' }))
    expect(screen.getByRole('button', { name: 'Resetear rostro' })).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('si la base rechaza el reseteo muestra el motivo', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Solo un administrador puede resetear un rostro' } } as never)
    const { u, onGuardado } = abrir(CON_ROSTRO)
    await u.click(screen.getByRole('button', { name: 'Resetear rostro' }))
    await u.click(screen.getByRole('button', { name: 'Sí, resetear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo resetear el rostro: Solo un administrador puede resetear un rostro')
    expect(onGuardado).not.toHaveBeenCalled()
  })
})
