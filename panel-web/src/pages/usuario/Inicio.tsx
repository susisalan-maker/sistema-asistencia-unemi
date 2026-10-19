import { useAuth } from '../../auth/AuthContext'

export default function InicioUsuario() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">Hola, {perfil?.nombre}</h1>
      <p className="mt-2 text-sm text-slate-600">
        Marcación web de contingencia, historial y justificaciones: pendiente de desarrollo.
      </p>
      <button onClick={cerrarSesion} className="mt-4 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">Salir</button>
    </main>
  )
}
