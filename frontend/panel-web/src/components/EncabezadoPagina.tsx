import type { ReactNode } from 'react'

/** Barra superior de las pantallas del panel (título, detalle y acciones a la derecha). */
export function EncabezadoPagina({ titulo, detalle, children }: { titulo: string; detalle?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-borde-suave bg-white px-7 py-[18px]">
      <div>
        <h1 className="text-[21px] font-extrabold tracking-tight text-marino">{titulo}</h1>
        {detalle && <p className="mt-0.5 text-[13px] font-semibold text-texto-suave">{detalle}</p>}
      </div>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2.5">{children}</div>}
    </header>
  )
}
