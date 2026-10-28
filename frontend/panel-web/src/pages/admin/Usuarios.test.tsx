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

/** Responde la consulta de invitaciones pendientes y deja que cualquier otra llamada devuelva `{ mensaje }`. */
function respuestasDeApi(pendientes: string[] = [], resto: unknown = { mensaje: 'Listo' }) {
  vi.mocked(api).mockImplementation((async (ruta: string) =>
    ruta === '/usuarios/invitaciones-pendientes' ? { ids: pendientes } : resto) as never)
}
const llamadasA = (parte: string) => vi.mocked(api).mock.calls.filter(([ruta]) => String(ruta).includes(parte))

beforeEach(() => {
  vi.mocked(api).mockReset()
  respuestasDeApi()
  vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
    cadenaSupabase({ data: tabla === 'sedes' ? [{ id: 's1', nombre: 'Matriz' }] : USUARIOS, error: null })) as never)
})

const pantalla = (perfil = { ...perfilDe('administrador'), id: 'admin-yo' }) => renderConAuth(
  <Routes><Route path="/admin/usuarios" element={<Usuarios />} /></Routes>,
  { perfil }, '/admin/usuarios',
)

const abrirMenu = async (nombre: string) => {
  const u = userEvent.setup()
  await u.click(await screen.findByRole('button', { name: `Acciones de ${nombre}` }))
  return { u, menu: await screen.findByRole('menu', { name: `Acciones de ${nombre}` }) }
}
const opcion = (menu: HTMLElement, nombre: string) => within(menu).queryByRole('menuitem', { name: nombre })

describe('Usuarios · menú de acciones', () => {
  it('cada fila tiene un solo botón «⋯» y las opciones salen con su texto al abrirlo', async () => {
    pantalla()
    await screen.findByText('Ana Pérez')
    expect(screen.getAllByRole('button', { name: /^Acciones de/ })).toHaveLength(2)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    const { menu } = await abrirMenu('Ana Pérez')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(
      ['Editar usuario', 'Reiniciar celular', 'Restablecer contraseña', 'Desactivar usuario'])
  })

  it('se cierra con Escape y con un clic afuera', async () => {
    pantalla()
    const { u } = await abrirMenu('Ana Pérez')
    await u.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Acciones de Ana Pérez' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await u.click(screen.getByText('Usuarios', { selector: 'h1, h2' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('en tu propia fila de administrador no hay «Editar» ni «Desactivar»', async () => {
    pantalla({ ...perfilDe('administrador'), id: 'a1' })
    const { menu } = await abrirMenu('Raúl Admin')
    expect(opcion(menu, 'Editar usuario')).not.toBeInTheDocument()
    expect(opcion(menu, 'Desactivar usuario')).not.toBeInTheDocument()
    expect(opcion(menu, 'Restablecer contraseña')).toBeInTheDocument()
  })

  it('un usuario inactivo solo ofrece «Activar usuario»', async () => {
    vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
      cadenaSupabase({ data: tabla === 'sedes' ? [] : [{ ...USUARIOS[0], activo: false }], error: null })) as never)
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1)
    await u.click(within(menu).getByRole('menuitem', { name: 'Activar usuario' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/activar', { method: 'POST' }))
  })
})

describe('Usuarios · invitación y contraseña', () => {
  it('quien aún no aceptó ve «Reenviar invitación» (y no «Restablecer contraseña») y un aviso «Pendiente»', async () => {
    respuestasDeApi(['u1'])
    pantalla()
    expect(await screen.findByText('Pendiente')).toBeInTheDocument()
    const { u, menu } = await abrirMenu('Ana Pérez')
    expect(opcion(menu, 'Restablecer contraseña')).not.toBeInTheDocument()
    respuestasDeApi(['u1'], { mensaje: 'Invitación reenviada' })
    await u.click(within(menu).getByRole('menuitem', { name: 'Reenviar invitación' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/reenviar-invitacion', { method: 'POST' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Invitación reenviada')
  })

  it('quien ya aceptó ve «Restablecer contraseña» (y no «Reenviar invitación»)', async () => {
    pantalla()
    expect(await screen.findAllByText('Activo')).toHaveLength(2)
    expect(screen.queryByText('Pendiente')).not.toBeInTheDocument()
    const { u, menu } = await abrirMenu('Ana Pérez')
    expect(opcion(menu, 'Reenviar invitación')).not.toBeInTheDocument()
    respuestasDeApi([], { mensaje: 'Se envió un enlace para restablecer la contraseña' })
    await u.click(within(menu).getByRole('menuitem', { name: 'Restablecer contraseña' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/restablecer-contrasena', { method: 'POST' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Se envió un enlace para restablecer la contraseña')
  })

  it('si el servidor rechaza el correo, se muestra su mensaje', async () => {
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    vi.mocked(api).mockRejectedValue(new Error('No se pudo enviar el enlace: Error sending recovery email'))
    await u.click(within(menu).getByRole('menuitem', { name: 'Restablecer contraseña' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Error sending recovery email')
  })

  it('si no se puede consultar quién está pendiente, la lista igual se muestra', async () => {
    vi.mocked(api).mockRejectedValue(new Error('caído'))
    pantalla()
    const { menu } = await abrirMenu('Ana Pérez')
    expect(opcion(menu, 'Restablecer contraseña')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Usuarios · editar', () => {
  it('«Editar usuario» abre el formulario con los datos actuales, guarda un cambio y recarga la lista', async () => {
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    respuestasDeApi([], {})
    await u.click(within(menu).getByRole('menuitem', { name: 'Editar usuario' }))
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
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    respuestasDeApi([], { mensaje: 'Celular reiniciado' })
    await u.click(within(menu).getByRole('menuitem', { name: 'Reiniciar celular' }))
    const modal = await screen.findByRole('dialog', { name: 'Reiniciar vinculación' })
    expect(llamadasA('reiniciar-dispositivo')).toHaveLength(0)
    await u.click(within(modal).getByRole('button', { name: 'Sí, reiniciar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/reiniciar-dispositivo', { method: 'POST' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Celular reiniciado')
  })

  it('cancelar no cambia nada', async () => {
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    await u.click(within(menu).getByRole('menuitem', { name: 'Reiniciar celular' }))
    await u.click(within(await screen.findByRole('dialog', { name: 'Reiniciar vinculación' })).getByRole('button', { name: 'Cancelar' }))
    expect(llamadasA('reiniciar-dispositivo')).toHaveLength(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sin celular vinculado no se ofrece «Reiniciar celular»', async () => {
    vi.mocked(supabase.from).mockImplementation(((tabla: string) =>
      cadenaSupabase({ data: tabla === 'sedes' ? [] : [{ ...USUARIOS[0], dispositivo_id: null }], error: null })) as never)
    pantalla()
    const { menu } = await abrirMenu('Ana Pérez')
    expect(opcion(menu, 'Reiniciar celular')).not.toBeInTheDocument()
  })
})

describe('Usuarios · desactivar', () => {
  it('pide confirmación antes de desactivar', async () => {
    pantalla()
    const { u, menu } = await abrirMenu('Ana Pérez')
    await u.click(within(menu).getByRole('menuitem', { name: 'Desactivar usuario' }))
    const modal = await screen.findByRole('dialog', { name: 'Desactivar usuario' })
    expect(llamadasA('desactivar')).toHaveLength(0)
    await u.click(within(modal).getByRole('button', { name: 'Desactivar' }))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/usuarios/u1/desactivar', { method: 'POST' }))
  })
})
