import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
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
const ESCRITORIO = '(min-width: 1024px)'

/** Abierto por defecto en pantallas anchas; lo que la persona elija queda guardado en este navegador. */
function menuAbiertoInicial(): boolean {
  try {
    const guardado = window.localStorage.getItem(CLAVE)
    if (guardado === 'si') return true
    if (guardado === 'no') return false
  } catch { /* sin almacenamiento: se usa el valor por defecto */ }
  return typeof window.matchMedia === 'function' ? window.matchMedia(ESCRITORIO).matches : true
}

/** `true` en pantallas anchas (computador). Por debajo, el menú es un cajón que se abre con un botón. */
function useEsEscritorio(): boolean {
  const [escritorio, setEscritorio] = useState(() => (typeof window.matchMedia === 'function' ? window.matchMedia(ESCRITORIO).matches : true))
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const consulta = window.matchMedia(ESCRITORIO)
    const alCambiar = () => setEscritorio(consulta.matches)
    alCambiar()
    consulta.addEventListener('change', alCambiar)
    return () => consulta.removeEventListener('change', alCambiar)
  }, [])
  return escritorio
}

export default function AdminLayout() {
  const { perfil, cerrarSesion } = useAuth()
  const [abierto, setAbierto] = useState(menuAbiertoInicial)
  const [cajon, setCajon] = useState(false)
  const escritorio = useEsEscritorio()
  const { pathname } = useLocation()

  useEffect(() => {
    try { window.localStorage.setItem(CLAVE, abierto ? 'si' : 'no') } catch { /* no pasa nada */ }
  }, [abierto])

  // El cajón se cierra al cambiar de pantalla, con Escape y al pasar a una pantalla ancha.
  useEffect(() => { setCajon(false) }, [pathname, escritorio])
  useEffect(() => {
    if (!cajon) return
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && setCajon(false)
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [cajon])

  // En el cajón siempre se ven los textos; el modo «solo iconos» es solo del computador.
  const expandido = !escritorio || abierto
  const etiqueta = (texto: string) => (expandido ? undefined : texto)
  const textoMenu = `overflow-hidden whitespace-nowrap transition-[opacity,width] duration-200 ${expandido ? 'w-auto opacity-100' : 'w-0 opacity-0'}`
  const oculto = !escritorio && !cajon

  return (
    <div className="flex min-h-screen bg-lienzo">
      <header className="fixed inset-x-0 top-0 z-20 flex h-14 items-center gap-3 border-b border-borde-suave bg-white px-3 lg:hidden">
        <button type="button" onClick={() => setCajon(true)} aria-label="Abrir menú" aria-expanded={cajon}
          className="grid size-9 flex-none place-items-center rounded-[10px] text-texto-suave hover:bg-lienzo hover:text-marino focus-visible:outline-2 focus-visible:outline-marino">
          <Icono nombre="panel" className="size-5" />
        </button>
        <Logo />
      </header>

      {cajon && <div onClick={() => setCajon(false)} aria-hidden="true" data-testid="fondo-menu" className="fixed inset-0 z-30 bg-marino/40 lg:hidden" />}

      <aside aria-label="Menú principal" inert={oculto}
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] max-w-[85vw] flex-none flex-col overflow-y-auto overflow-x-hidden border-r border-borde-suave bg-cabecera px-4 py-5 transition-[transform,width] duration-200 ease-out motion-reduce:transition-none lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:translate-x-0 lg:shadow-none ${cajon ? 'translate-x-0 shadow-[0_24px_60px_rgba(27,42,110,.2)]' : '-translate-x-full'} ${abierto ? 'lg:w-[264px] lg:px-4' : 'lg:w-[76px] lg:px-3'}`}>
        <div className={`flex items-center ${expandido ? 'justify-between px-1.5' : 'flex-col gap-3'}`}>
          <Logo compacto={!expandido} />
          <button type="button" onClick={() => setCajon(false)} aria-label="Cerrar menú"
            className="grid size-9 flex-none place-items-center rounded-[10px] text-texto-suave hover:bg-lienzo hover:text-marino focus-visible:outline-2 focus-visible:outline-marino lg:hidden">
            <Icono nombre="panel" className="size-5" />
          </button>
          <button type="button" onClick={() => setAbierto((v) => !v)}
            aria-label={abierto ? 'Contraer menú' : 'Expandir menú'} aria-expanded={abierto} title={abierto ? 'Contraer menú' : 'Expandir menú'}
            className="hidden size-9 flex-none place-items-center rounded-[10px] text-texto-suave hover:bg-lienzo hover:text-marino focus-visible:outline-2 focus-visible:outline-marino lg:grid">
            <Icono nombre="panel" className="size-5" />
          </button>
        </div>

        <p className={`mt-6 px-3 text-[11px] font-extrabold uppercase tracking-[.1em] text-etiqueta ${expandido ? '' : 'invisible h-0 !mt-4'}`}>Panel administrativo</p>

        <nav className={`flex flex-col gap-1 ${expandido ? 'mt-2' : 'mt-5'}`}>
          {MENU.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.fin} onClick={() => setCajon(false)} title={etiqueta(m.texto)} aria-label={etiqueta(m.texto)}
              className={({ isActive }) =>
                `flex items-center rounded-xl px-3 py-3 text-sm transition-colors ${expandido ? 'gap-3' : 'justify-center'} ${isActive ? 'bg-marino font-extrabold text-white shadow-[0_4px_12px_rgba(27,42,110,.25)]' : 'font-bold text-texto-suave hover:bg-lienzo hover:text-marino'}`}>
              <Icono nombre={m.icono} />
              <span className={textoMenu}>{m.texto}</span>
            </NavLink>
          ))}
          {PROXIMAMENTE.map((m) => (
            <span key={m.texto} title={expandido ? 'Próximamente' : `${m.texto} · próximamente`} aria-disabled="true"
              className={`flex cursor-not-allowed items-center rounded-xl px-3 py-3 text-sm font-bold text-texto-suave/45 ${expandido ? 'gap-3' : 'justify-center'}`}>
              <Icono nombre={m.icono} />
              <span className={textoMenu}>{m.texto}</span>
            </span>
          ))}
        </nav>

        <div className={`mt-auto flex flex-none items-center rounded-[14px] bg-lienzo ${expandido ? 'gap-[11px] p-3' : 'flex-col gap-2 p-2'}`}>
          <div title={perfil ? nombreCompleto(perfil) : undefined}
            className="grid size-[34px] flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">
            {iniciales(perfil?.nombres ?? '', perfil?.apellidos ?? '')}
          </div>
          {expandido ? (
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
      <div className="flex min-w-0 flex-1 flex-col pt-14 lg:pt-0"><Outlet /></div>
    </div>
  )
}
