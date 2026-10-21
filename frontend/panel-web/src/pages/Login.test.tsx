import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Login from './Login'
import { perfilDe, renderConAuth, sesionFalsa } from '../test/helpers'
import { avisoDeSalida } from '../lib/sesion'

vi.mock('../lib/sesion', async (original) => ({ ...(await original<typeof import('../lib/sesion')>()), avisoDeSalida: vi.fn(() => null) }))

const rutas = (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/admin" element={<p>PANEL ADMIN</p>} />
    <Route path="/usuario" element={<p>INICIO USUARIO</p>} />
  </Routes>
)

describe('Login', () => {
  it('si la sesión terminó sola, lo explica', () => {
    vi.mocked(avisoDeSalida).mockReturnValueOnce('vencida')
    renderConAuth(rutas, {}, '/login')
    expect(screen.getByText('Tu sesión terminó. Vuelve a iniciar sesión.')).toBeInTheDocument()
  })
  it('si desactivaron la cuenta mientras estaba dentro, lo explica', () => {
    vi.mocked(avisoDeSalida).mockReturnValueOnce('desactivada')
    renderConAuth(rutas, {}, '/login')
    expect(screen.getByText(/Tu cuenta fue desactivada/)).toBeInTheDocument()
  })
  it('al entrar normalmente no sale ningún aviso de sesión', () => {
    renderConAuth(rutas, {}, '/login')
    expect(screen.queryByText(/Tu sesión terminó/)).not.toBeInTheDocument()
  })
  it('muestra error genérico si las credenciales fallan', async () => {
    const iniciarSesion = vi.fn().mockResolvedValue('Correo o contraseña incorrectos')
    renderConAuth(rutas, { iniciarSesion }, '/login')
    const u = userEvent.setup()
    await u.type(screen.getByLabelText('Correo institucional'), 'a@x.com')
    await u.type(screen.getByLabelText('Contraseña'), 'mala')
    await u.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(iniciarSesion).toHaveBeenCalledWith('a@x.com', 'mala')
    expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument()
  })
  it('con sesión de administrador va al panel', () => {
    renderConAuth(rutas, { session: sesionFalsa, perfil: perfilDe('administrador') }, '/login')
    expect(screen.getByText('PANEL ADMIN')).toBeInTheDocument()
  })
  it('con sesión de usuario va a /usuario', () => {
    renderConAuth(rutas, { session: sesionFalsa, perfil: perfilDe('usuario') }, '/login')
    expect(screen.getByText('INICIO USUARIO')).toBeInTheDocument()
  })
  it('una cuenta desactivada no entra y ve el aviso', () => {
    renderConAuth(rutas, { session: sesionFalsa, perfil: perfilDe('usuario', false) }, '/login')
    expect(screen.getByText(/cuenta está desactivada/i)).toBeInTheDocument()
  })
  it('ofrece recuperar contraseña y no ofrece registro público', () => {
    renderConAuth(rutas, {}, '/login')
    expect(screen.getByRole('link', { name: /olvidaste/i })).toHaveAttribute('href', '/recuperar-contrasena')
    expect(screen.queryByText(/crear cuenta|regístrate/i)).not.toBeInTheDocument()
  })
  it('«Ver» muestra y oculta la contraseña', async () => {
    renderConAuth(rutas, {}, '/login')
    const u = userEvent.setup()
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
    await u.click(screen.getByRole('button', { name: 'Ver' }))
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'text')
    await u.click(screen.getByRole('button', { name: 'Ocultar' }))
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('type', 'password')
  })
})
