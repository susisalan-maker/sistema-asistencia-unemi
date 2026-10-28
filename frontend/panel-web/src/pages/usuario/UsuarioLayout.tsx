import { Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { MenuCuenta } from '../../components/MenuCuenta'
import { Logo } from '../../components/ui'
import { useInactividad } from '../../lib/inactividad'
import { cerrarPor } from '../../lib/sesion'
import { iniciales, nombreCompleto } from '../../lib/texto'

/**
 * Marco de la persona usuaria en la web: es el canal de contingencia, solo sirve para marcar y ver el resultado.
 * No hay menú de secciones. La persona entra cuando quiera y no la sacamos al marcar; «Cerrar sesión» está en el menú que se
 * despliega al tocar el círculo de sus iniciales. Si se olvida de cerrarla, la sesión se cierra sola tras un rato sin actividad.
 */
export default function UsuarioLayout() {
  const { perfil, cerrarSesion } = useAuth()
  useInactividad(() => { void cerrarPor('inactividad') })

  return (
    <div className="min-h-screen bg-lienzo">
      <header className="border-b border-borde-suave bg-white">
        <div className="mx-auto flex max-w-[900px] items-center gap-3 px-4 py-3 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <p className="truncate text-sm font-extrabold text-marino">{perfil ? nombreCompleto(perfil) : ''}</p>
              <p className="truncate text-xs font-semibold text-texto-suave">{perfil?.email}</p>
            </div>
            <MenuCuenta iniciales={iniciales(perfil?.nombres ?? '', perfil?.apellidos ?? '')}
              nombre={perfil ? nombreCompleto(perfil) : ''} correo={perfil?.email}
              onCerrarSesion={() => void cerrarSesion()} />
          </div>
        </div>
      </header>

      <main><Outlet /></main>
    </div>
  )
}
