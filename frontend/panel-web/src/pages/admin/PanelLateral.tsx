import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Un panel que se abre por el lado derecho sobre la pantalla (la ficha de una persona, la explicación de los indicadores…): así lo
 * que es de consulta no ocupa lugar en la página ni empuja lo demás hacia abajo. Se cierra con su botón, con Escape o tocando fuera.
 * Sus hijos siguen montados aunque esté cerrado, para que lo escrito (una búsqueda) no se pierda al cerrarlo.
 */
export function PanelLateral({ titulo, abierto, alCerrar, children }: { titulo: string; abierto: boolean; alCerrar: () => void; children: ReactNode }) {
  const cerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!abierto) return
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [abierto, alCerrar])
  return (
    <div hidden={!abierto}>
      <div aria-hidden="true" onClick={alCerrar} className="fixed inset-0 z-30 bg-marino/25" />
      <div role="dialog" aria-label={titulo} className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-borde-suave bg-lienzo shadow-[-12px_0_28px_rgba(27,42,110,.18)]">
        <div className="flex items-center gap-3 border-b border-borde-suave bg-white px-4 py-3.5">
          <h2 className="text-[16px] font-extrabold text-marino">{titulo}</h2>
          <button ref={cerrar} type="button" onClick={alCerrar} aria-label={`Cerrar ${titulo}`}
            className="ml-auto rounded-[11px] border border-borde bg-white px-3 py-1.5 text-[13px] font-extrabold text-marino hover:bg-lienzo">Cerrar</button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  )
}
