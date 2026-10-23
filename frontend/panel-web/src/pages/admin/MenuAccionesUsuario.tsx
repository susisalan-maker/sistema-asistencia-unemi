import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type IconoAccion = 'editar' | 'celular' | 'invitacion' | 'clave' | 'apagar' | 'encender'

export interface OpcionAccion {
  clave: string
  texto: string
  icono: IconoAccion
  onClick: () => void
  /** «peligro» pinta la opción en rojo; «ok» en verde. */
  tono?: 'peligro' | 'ok'
}

const ANCHO = 236
const ALTO_OPCION = 42

const TRAZOS: Record<IconoAccion, ReactNode> = {
  editar: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  celular: <path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5" />,
  invitacion: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  clave: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l3 3" /></>,
  apagar: <><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>,
  encender: <><path d="M12 3v9" /><path d="M6.3 6.3a8 8 0 1 0 11.4 0" /></>,
}

function Icono({ nombre }: { nombre: IconoAccion }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px] flex-none" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {TRAZOS[nombre]}
    </svg>
  )
}

/**
 * Un solo botón «⋯» por fila con las acciones que aplican a esa persona. El menú se dibuja fuera de la tabla
 * (la tabla recorta lo que se sale) y se cierra con clic afuera, Escape o al mover la pantalla.
 */
export function MenuAccionesUsuario({ nombre, opciones }: { nombre: string; opciones: OpcionAccion[] }) {
  const [sitio, setSitio] = useState<{ left: number; top: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const abierto = sitio !== null

  const cerrar = (devolverFoco = false) => { setSitio(null); if (devolverFoco) boton.current?.focus() }

  function abrir() {
    const r = boton.current!.getBoundingClientRect()
    const alto = opciones.length * ALTO_OPCION + 16
    const abajo = r.bottom + 6 + alto <= window.innerHeight
    setSitio({
      left: Math.max(8, Math.min(r.right - ANCHO, window.innerWidth - ANCHO - 8)),
      top: abajo ? r.bottom + 6 : Math.max(8, r.top - 6 - alto),
    })
  }

  useEffect(() => {
    if (!abierto) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const afuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !boton.current?.contains(t)) cerrar()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(true) }
    const mover = () => cerrar()
    document.addEventListener('mousedown', afuera)
    document.addEventListener('keydown', tecla)
    window.addEventListener('scroll', mover, true)
    window.addEventListener('resize', mover)
    return () => {
      document.removeEventListener('mousedown', afuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', mover, true)
      window.removeEventListener('resize', mover)
    }
  }, [abierto])

  // Flechas arriba y abajo recorren las opciones.
  function alTeclear(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  return (
    <>
      <button ref={boton} type="button" aria-haspopup="menu" aria-expanded={abierto} aria-label={`Acciones de ${nombre}`} title="Acciones"
        onClick={() => (abierto ? cerrar() : abrir())}
        className={`grid size-8 place-items-center rounded-full text-marino outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-marino ${abierto ? 'bg-[#d3ddf1] ring-1 ring-marino/30' : 'bg-celeste'}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {sitio && createPortal(
        <div ref={menu} role="menu" aria-label={`Acciones de ${nombre}`} onKeyDown={alTeclear}
          style={{ left: sitio.left, top: sitio.top, width: ANCHO }}
          className="fixed z-50 rounded-[16px] border border-borde-suave bg-white p-2 shadow-[0_12px_32px_rgba(27,42,110,.16)]">
          {opciones.map((o) => (
            <button key={o.clave} role="menuitem" type="button" onClick={() => { cerrar(); o.onClick() }}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold outline-none focus-visible:bg-lienzo ${
                o.tono === 'peligro' ? 'text-error hover:bg-error-fondo focus-visible:bg-error-fondo'
                : o.tono === 'ok' ? 'text-ok hover:bg-ok-fondo focus-visible:bg-ok-fondo'
                : 'text-marino hover:bg-lienzo'}`}>
              <Icono nombre={o.icono} />
              {o.texto}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
