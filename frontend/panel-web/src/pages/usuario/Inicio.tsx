import { useAuth } from '../../auth/AuthContext'
import { Boton, Logo } from '../../components/ui'

export default function InicioUsuario() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <main className="mx-auto max-w-md p-6">
      <Logo />
      <h1 className="mt-8 text-2xl font-extrabold text-marino">Hola, {perfil?.nombres}</h1>
      <p className="mt-2 text-sm font-semibold text-texto-suave">
        Marcación web de contingencia, historial y justificaciones: pendiente de desarrollo.
      </p>
      <div className="mt-6 max-w-[180px]"><Boton variante="borde" onClick={cerrarSesion}>Salir</Boton></div>
    </main>
  )
}
