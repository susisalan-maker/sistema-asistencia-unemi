import { Navigate, Outlet } from 'react-router-dom'
import { rutaInicio, useAuth, type Rol } from '../auth/AuthContext'
import { Cargando } from '../components/ui'

/** Guarda de acceso: exige sesión, perfil activo y el rol indicado. */
export default function RutaPorRol({ rol }: { rol: Rol }) {
  const { cargando, session, perfil, cerrarSesion } = useAuth()

  if (cargando) return <Cargando />
  if (!session) return <Navigate to="/login" replace />

  if (!perfil || !perfil.activo) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-xl bg-white p-6 text-center shadow">
        <h1 className="text-lg font-semibold">Cuenta no habilitada</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tu cuenta no está activa o no tiene un perfil asignado. Comunícate con Talento Humano.
        </p>
        <button onClick={cerrarSesion} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">
          Cerrar sesión
        </button>
      </div>
    )
  }

  if (perfil.rol !== rol) return <Navigate to={rutaInicio(perfil.rol)} replace />
  return <Outlet />
}
