import type { ReactNode } from 'react'

/** Barra superior de las pantallas del panel (título, detalle y acciones a la derecha). `pie` va debajo, dentro de la misma barra (p. ej. pestañas). */
export function EncabezadoPagina({ titulo, detalle, children, pie }: { titulo: string; detalle?: string; children?: ReactNode; pie?: ReactNode }) {
  return (
    <div className="border-b border-borde-suave bg-white">
      <header className="flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-7 sm:py-[18px]">
        <div>
          <h1 className="text-[21px] font-extrabold tracking-tight text-marino">{titulo}</h1>
          {detalle && <p className="mt-0.5 text-[13px] font-semibold text-texto-suave">{detalle}</p>}
        </div>
        {children && <div className="flex w-full flex-wrap items-center gap-2.5 max-sm:[&>*]:flex-1 sm:ml-auto sm:w-auto">{children}</div>}
      </header>
      {pie}
    </div>
  )
}
