import { Navigate, Route, Routes } from 'react-router-dom'
import { rutaInicio, useAuth } from './auth/AuthContext'
import { Cargando } from './components/ui'
import AceptarInvitacion from './pages/AceptarInvitacion'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import SedeDetalle from './pages/admin/SedeDetalle'
import Sedes from './pages/admin/Sedes'
import Usuarios from './pages/admin/Usuarios'
import Login from './pages/Login'
import RecuperarContrasena from './pages/RecuperarContrasena'
import RestablecerContrasena from './pages/RestablecerContrasena'
import RutaPorRol from './routes/RutaPorRol'
import InicioUsuario from './pages/usuario/Inicio'

function Raiz() {
  const { cargando, perfil } = useAuth()
  if (cargando) return <Cargando />
  return <Navigate to={perfil ? rutaInicio(perfil.rol) : '/login'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Raiz />} />
      <Route path="/login" element={<Login />} />
      <Route path="/aceptar-invitacion" element={<AceptarInvitacion />} />
      <Route path="/recuperar-contrasena" element={<RecuperarContrasena />} />
      <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />

      <Route path="/admin" element={<RutaPorRol rol="administrador" />}>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="usuarios" element={<Usuarios />} />
          <Route path="sedes" element={<Sedes />} />
          <Route path="sedes/:id" element={<SedeDetalle />} />
        </Route>
      </Route>

      <Route path="/usuario" element={<RutaPorRol rol="usuario" />}>
        <Route index element={<InicioUsuario />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
