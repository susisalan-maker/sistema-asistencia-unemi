import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Icono, type NombreIcono } from '../../components/Iconos'
import { Logo } from '../../components/ui'
import { iniciales, nombreCompleto } from '../../lib/texto'

const MENU: { a: string; texto: string; icono: NombreIcono; fin?: boolean }[] = [
  { a: '/admin', texto: 'Dashboard', icono: 'dashboard', fin: true },
  { a: '/admin/anomalias', texto: 'Anomalías', icono: 'alerta' },
  { a: '/admin/usuarios', texto: 'Usuarios', icono: 'usuarios' },
  { a: '/admin/sedes', texto: 'Sedes y bloques', icono: 'sedes' },
  { a: '/admin/configuracion', texto: 'Configuración', icono: 'configuracion' },
]
const PROXIMAMENTE: { texto: string; icono: NombreIcono }[] = [
  { texto: 'Reportes', icono: 'reportes' },
  { texto: 'Auditoría', icono: 'auditoria' },
]

const CLAVE = 'menu-lateral-abierto'

/** Abierto por defecto en pantallas anchas; lo que la persona elija queda guardado en este navegador. */
function menuAbiertoInicial(): boolean {
  try {
    const guardado = window.localStorage.getItem(CLAVE)
    if (guardado === 'si') return true
    if (guardado === 'no') return false
  } catch { /* sin almacenamiento: se usa el valor por defecto */ }
  return typeof window.matchMedia === 'function' ? window.matchMedia('(min-width: 1024px)').matches : true
}

export default function AdminLayout() {
  const { perfil, cerrarSesion } = useAuth()
  const [abierto, setAbierto] = useState(menuAbiertoInicial)

  useEffect(() => {
    try { window.localStorage.setItem(CLAVE, abierto ? 'si' : 'no') } catch { /* no pasa nada */ }
  }, [abierto])

  // Con el menú cerrado solo se ven los iconos: el nombre va en el título y en la etiqueta accesible.
  const etiqueta = (texto: string) => (abierto ? undefined : texto)
  const textoMenu = `overflow-hidden whitespace-nowrap transition-[opacity,width] duration-200 ${abierto ? 'w-auto opacity-100' : 'w-0 opacity-0'}`

  return (
    <div className="flex min-h-screen bg-lienzo">
      <aside aria-label="Menú principal"
        className={`sticky top-0 flex h-screen flex-none flex-col overflow-y-auto overflow-x-hidden border-r border-borde-suave bg-cabecera py-5 transition-[width] duration-200 ease-out motion-reduce:transition-none ${abierto ? 'w-[264px] px-4' : 'w-[76px] px-3'}`}>
        <div className={`flex items-center ${abierto ? 'justify-between px-1.5' : 'flex-col gap-3'}`}>
          <Logo compacto={!abierto} />
          <button type="button" onClick={() => setAbierto((v) => !v)}
            aria-label={abierto ? 'Contraer menú' : 'Expandir menú'} aria-expanded={abierto} title={abierto ? 'Contraer menú' : 'Expandir menú'}
            className="grid size-9 flex-none place-items-center rounded-[10px] text-texto-suave hover:bg-lienzo hover:text-marino focus-visible:outline-2 focus-visible:outline-marino">
            <Icono nombre="panel" className="size-5" />
          </button>
        </div>

        <p className={`mt-6 px-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-etiqueta ${abierto ? '' : 'invisible h-0 !mt-4'}`}>Panel administrativo</p>

        <nav className={`flex flex-col gap-1 ${abierto ? 'mt-2' : 'mt-5'}`}>
          {MENU.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.fin} title={etiqueta(m.texto)} aria-label={etiqueta(m.texto)}
              className={({ isActive }) =>
                `flex items-center rounded-xl px-3 py-3 text-sm transition-colors ${abierto ? 'gap-3' : 'justify-center'} ${isActive ? 'bg-marino font-extrabold text-white shadow-[0_4px_12px_rgba(27,42,110,.25)]' : 'font-bold text-texto-suave hover:bg-lienzo hover:text-marino'}`}>
              <Icono nombre={m.icono} />
              <span className={textoMenu}>{m.texto}</span>
            </NavLink>
          ))}
          {PROXIMAMENTE.map((m) => (
            <span key={m.texto} title={abierto ? 'Próximamente' : `${m.texto} · próximamente`} aria-disabled="true"
              className={`flex cursor-not-allowed items-center rounded-xl px-3 py-3 text-sm font-bold text-texto-suave/45 ${abierto ? 'gap-3' : 'justify-center'}`}>
              <Icono nombre={m.icono} />
              <span className={textoMenu}>{m.texto}</span>
            </span>
          ))}
        </nav>

        <div className={`mt-auto flex flex-none items-center rounded-[14px] bg-lienzo ${abierto ? 'gap-[11px] p-3' : 'flex-col gap-2 p-2'}`}>
          <div title={perfil ? nombreCompleto(perfil) : undefined}
            className="grid size-[34px] flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">
            {iniciales(perfil?.nombres ?? '', perfil?.apellidos ?? '')}
          </div>
          {abierto ? (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-extrabold text-marino">{perfil ? nombreCompleto(perfil) : ''}</div>
              <button onClick={cerrarSesion} className="text-[11px] font-bold text-texto-suave hover:text-marino">Cerrar sesión</button>
            </div>
          ) : (
            <button onClick={cerrarSesion} aria-label="Cerrar sesión" title="Cerrar sesión"
              className="grid size-8 place-items-center rounded-[10px] text-texto-suave hover:bg-white hover:text-marino">
              <Icono nombre="salir" className="size-[18px]" />
            </button>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col"><Outlet /></div>
    </div>
  )
}
