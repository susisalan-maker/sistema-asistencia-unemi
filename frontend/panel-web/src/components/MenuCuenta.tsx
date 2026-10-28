import { useEffect, useRef, useState } from 'react'

/**
 * Círculo con las iniciales de la persona: al tocarlo se despliega un menú con su nombre, su correo y «Cerrar sesión».
 * Se cierra al tocar fuera, al pulsar Escape o al elegir la opción.
 */
export function MenuCuenta({ iniciales, nombre, correo, onCerrarSesion }: {
  iniciales: string; nombre: string; correo?: string; onCerrarSesion: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: PointerEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('pointerdown', fuera)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('pointerdown', fuera); document.removeEventListener('keydown', tecla) }
  }, [abierto])

  return (
    <div ref={raiz} className="relative">
      <button type="button" aria-label="Menú de la cuenta" aria-haspopup="menu" aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="grid size-9 flex-none place-items-center rounded-full bg-ambar text-[13px] font-extrabold text-ambar-tinta outline-none transition-shadow hover:shadow-[0_0_0_4px_rgba(245,166,35,.25)] focus-visible:ring-2 focus-visible:ring-marino focus-visible:ring-offset-2">
        {iniciales}
      </button>
      {abierto && (
        <div role="menu" aria-label="Cuenta"
          className="absolute right-0 top-full z-30 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-borde-suave bg-white p-2 shadow-[0_14px_40px_rgba(27,42,110,.14)]">
          <div className="px-3 py-2 sm:hidden">
            <p className="truncate text-sm font-extrabold text-marino">{nombre}</p>
            {correo && <p className="truncate text-xs font-semibold text-texto-suave">{correo}</p>}
          </div>
          <button type="button" role="menuitem" autoFocus
            onClick={() => { setAbierto(false); onCerrarSesion() }}
            className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-extrabold text-marino outline-none transition-colors hover:bg-lienzo focus-visible:bg-lienzo">
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
