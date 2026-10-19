import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Logo } from '../../components/ui'
import { iniciales, nombreCompleto } from '../../lib/texto'

const MENU = [
  { a: '/admin', texto: 'Dashboard', fin: true },
  { a: '/admin/usuarios', texto: 'Usuarios' },
  { a: '/admin/sedes', texto: 'Sedes y bloques' },
]
const PROXIMAMENTE = ['Anomalías', 'Reportes', 'Auditoría', 'Configuración']

export default function AdminLayout() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <div className="flex min-h-screen bg-lienzo">
      <aside className="flex w-[236px] flex-none flex-col gap-[26px] bg-marino px-[18px] py-6">
        <div className="px-1.5"><Logo oscuro /></div>
        <nav className="flex flex-col gap-1">
          {MENU.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.fin}
              className={({ isActive }) =>
                `flex items-center gap-[11px] rounded-[11px] px-3.5 py-3 text-sm ${isActive ? 'bg-white/[.13] font-extrabold text-white' : 'font-bold text-menu-texto hover:bg-white/5'}`}>
              {({ isActive }) => (
                <>
                  <span className={`size-[9px] rounded-[3px] ${isActive ? 'bg-ambar' : 'bg-marino-suave'}`} />
                  {m.texto}
                </>
              )}
            </NavLink>
          ))}
          {PROXIMAMENTE.map((t) => (
            <span key={t} title="Próximamente"
              className="flex cursor-not-allowed items-center gap-[11px] rounded-[11px] px-3.5 py-3 text-sm font-bold text-menu-texto/40">
              <span className="size-[9px] rounded-[3px] bg-marino-suave/40" />
              {t}
            </span>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-[11px] rounded-[14px] bg-white/[.08] p-3.5">
          <div className="grid size-[34px] flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">
            {iniciales(perfil?.nombres ?? '', perfil?.apellidos ?? '')}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold text-white">{perfil ? nombreCompleto(perfil) : ''}</div>
            <button onClick={cerrarSesion} className="text-[11px] font-bold text-[#93a0c9] hover:text-white">Cerrar sesión</button>
          </div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col"><Outlet /></div>
    </div>
  )
}
