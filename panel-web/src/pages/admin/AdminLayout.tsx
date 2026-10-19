import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

const MENU = [
  { a: '/admin', texto: 'Dashboard', fin: true },
  { a: '/admin/usuarios', texto: 'Usuarios' },
]
const PROXIMAMENTE = ['Anomalías', 'Sedes', 'Reportes', 'Auditoría', 'Configuración']

export default function AdminLayout() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-slate-900 p-4 text-slate-200">
        <p className="px-2 text-xs font-semibold uppercase tracking-widest text-blue-300">Talento Humano</p>
        <nav className="mt-4 space-y-1 text-sm">
          {MENU.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.fin}
              className={({ isActive }) => `block rounded-lg px-3 py-2 ${isActive ? 'bg-blue-700 text-white' : 'hover:bg-slate-800'}`}>
              {m.texto}
            </NavLink>
          ))}
          {PROXIMAMENTE.map((t) => (
            <span key={t} className="block cursor-not-allowed rounded-lg px-3 py-2 text-slate-500" title="Próximamente">{t}</span>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-slate-200 bg-white px-6 py-3 text-sm">
          <span className="text-slate-600">{perfil?.nombre}</span>
          <button onClick={cerrarSesion} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-100">Salir</button>
        </header>
        <main className="p-6"><Outlet /></main>
      </div>
    </div>
  )
}
