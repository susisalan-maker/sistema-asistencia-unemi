import { Route, Routes } from 'react-router-dom'
import { screen } from '@testing-library/react'
import RutaPorRol from './RutaPorRol'
import { perfilDe, renderConAuth, sesionFalsa } from '../test/helpers'

function app(rol: 'administrador' | 'usuario') {
  return (
    <Routes>
      <Route path="/login" element={<p>PAGINA LOGIN</p>} />
      <Route path="/admin" element={<RutaPorRol rol={rol} />}>
        <Route index element={<p>ZONA PROTEGIDA</p>} />
      </Route>
      <Route path="/usuario" element={<p>INICIO USUARIO</p>} />
    </Routes>
  )
}

describe('RutaPorRol', () => {
  it('muestra «Cargando» mientras se resuelve la sesión', () => {
    renderConAuth(app('administrador'), { cargando: true }, '/admin')
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
  })
  it('sin sesión redirige al login', () => {
    renderConAuth(app('administrador'), {}, '/admin')
    expect(screen.getByText('PAGINA LOGIN')).toBeInTheDocument()
  })
  it('administrador activo entra', () => {
    renderConAuth(app('administrador'), { session: sesionFalsa, perfil: perfilDe('administrador') }, '/admin')
    expect(screen.getByText('ZONA PROTEGIDA')).toBeInTheDocument()
  })
  it('un usuario normal es enviado a su zona y no ve /admin', () => {
    renderConAuth(app('administrador'), { session: sesionFalsa, perfil: perfilDe('usuario') }, '/admin')
    expect(screen.queryByText('ZONA PROTEGIDA')).not.toBeInTheDocument()
    expect(screen.getByText('INICIO USUARIO')).toBeInTheDocument()
  })
  it('una cuenta desactivada ve «Cuenta no habilitada»', () => {
    renderConAuth(app('administrador'), { session: sesionFalsa, perfil: perfilDe('administrador', false) }, '/admin')
    expect(screen.getByText('Cuenta no habilitada')).toBeInTheDocument()
    expect(screen.queryByText('ZONA PROTEGIDA')).not.toBeInTheDocument()
  })
  it('sesión sin perfil en la tabla usuarios tampoco entra', () => {
    renderConAuth(app('administrador'), { session: sesionFalsa, perfil: null }, '/admin')
    expect(screen.getByText('Cuenta no habilitada')).toBeInTheDocument()
  })
})
