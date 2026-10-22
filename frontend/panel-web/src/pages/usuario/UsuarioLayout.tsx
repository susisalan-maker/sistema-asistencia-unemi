import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Icono, type NombreIcono } from '../../components/Iconos'
import { Logo } from '../../components/ui'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { useAnomaliasPendientes } from '../../lib/useAnomaliasPendientes'
import type { ContextoUsuario } from './contexto'

const MENU: { a: string; texto: string; icono: NombreIcono; fin?: boolean }[] = [
  { a: '/usuario', texto: 'Inicio', icono: 'inicio', fin: true },
  { a: '/usuario/historial', texto: 'Historial', icono: 'historial' },
  { a: '/usuario/avisos', texto: 'Avisos', icono: 'avisos' },
  { a: '/usuario/perfil', texto: 'Perfil', icono: 'perfil' },
]

/**
 * Marco de la persona usuaria. Son solo cuatro secciones, así que no lleva menú lateral:
 * desde 768 px las secciones van como pestañas arriba (contenido centrado) y en celular, en la barra inferior como la app.
 */
export default function UsuarioLayout() {
  const { cantidad, recargar } = useAnomaliasPendientes()
  const { pathname } = useLocation()
  // El contador de «Avisos» se vuelve a pedir en cada cambio de pantalla (después de justificar baja solo).
  useEffect(() => { void recargar() }, [pathname, recargar])
  const contexto: ContextoUsuario = { avisos: { cantidad, recargar } }
  const insignia = (a: string) => (a === '/usuario/avisos' && cantidad > 0 ? cantidad : 0)

  return (
    <div className="min-h-screen bg-lienzo">
      <header className="hidden border-b border-borde-suave bg-white md:block">
        <div className="mx-auto flex max-w-[1100px] items-center gap-6 px-6 py-3 min-[1200px]:px-7">
          <Logo />
          <nav aria-label="Secciones" className="flex gap-1">
            {MENU.map((m) => (
              <NavLink key={m.a} to={m.a} end={m.fin} aria-label={insignia(m.a) ? `${m.texto}, ${insignia(m.a)} por explicar` : undefined}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${isActive ? 'bg-marino font-extrabold text-white' : 'font-bold text-texto-suave hover:bg-lienzo hover:text-marino'}`}>
                {m.texto}
                {insignia(m.a) > 0 && <span aria-hidden="true" className="grid min-w-[18px] place-items-center rounded-full bg-ambar px-1 text-[11px] font-extrabold leading-[18px] text-ambar-tinta">{insignia(m.a)}</span>}
              </NavLink>
            ))}
          </nav>
          <MenuUsuario />
        </div>
      </header>

      <main className="pb-24 md:pb-0"><Outlet context={contexto} /></main>

      <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde-suave bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MENU.map((m) => (
          <NavLink key={m.a} to={m.a} end={m.fin} aria-label={insignia(m.a) ? `${m.texto}, ${insignia(m.a)} por explicar` : undefined}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? 'font-extrabold text-marino' : 'font-bold text-etiqueta'}`}>
            <span className="relative">
              <Icono nombre={m.icono} className="size-6" />
              {insignia(m.a) > 0 && <span aria-hidden="true" className="absolute -right-2 -top-1.5 grid min-w-[16px] place-items-center rounded-full bg-ambar px-1 text-[10px] font-extrabold leading-4 text-ambar-tinta">{insignia(m.a)}</span>}
            </span>
            <span>{m.texto}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

/** El avatar abre un menú con el nombre y «Cerrar sesión». Se cierra con clic afuera o con Escape. */
function MenuUsuario() {
  const { perfil, cerrarSesion } = useAuth()
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', afuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  return (
    <div ref={caja} className="relative ml-auto">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-haspopup="menu" aria-expanded={abierto} aria-label="Menú de usuario"
        title={perfil ? nombreCompleto(perfil) : 'Menú de usuario'}
        className="grid size-10 place-items-center rounded-full bg-ambar text-[13px] font-extrabold text-ambar-tinta outline-none focus-visible:ring-2 focus-visible:ring-marino">
        {iniciales(perfil?.nombres ?? '', perfil?.apellidos ?? '')}
      </button>
      {abierto && (
        <div role="menu" aria-label="Menú de usuario"
          className="absolute right-0 top-12 z-30 w-[260px] rounded-[16px] border border-borde-suave bg-white p-2 shadow-[0_12px_32px_rgba(27,42,110,.16)]">
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-extrabold text-marino">{perfil ? nombreCompleto(perfil) : ''}</p>
            <p className="truncate text-xs font-semibold text-texto-suave">{perfil?.email}</p>
          </div>
          <div className="my-1 border-t border-lienzo" />
          <button role="menuitem" type="button" onClick={() => { setAbierto(false); void cerrarSesion() }}
            className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-bold text-error hover:bg-error-fondo">Cerrar sesión</button>
        </div>
      )}
    </div>
  )
}
