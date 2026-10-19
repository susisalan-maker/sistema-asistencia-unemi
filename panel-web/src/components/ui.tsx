import type { ReactNode } from 'react'

export function Cargando() {
  return (
    <div role="status" className="grid min-h-screen place-items-center text-sm text-slate-500">
      Cargando…
    </div>
  )
}

/** Tarjeta centrada para las pantallas de acceso. */
export function TarjetaAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg shadow-slate-200">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">Asistencia UNEMI</p>
        <h1 className="mt-2 text-2xl font-semibold">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-slate-600">{subtitulo}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}

export function Campo(props: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  const { etiqueta, id, ...resto } = props
  const campoId = id ?? `campo-${etiqueta.toLowerCase().replace(/\W+/g, '-')}`
  return (
    <label htmlFor={campoId} className="block text-sm font-medium text-slate-700">
      {etiqueta}
      <input
        id={campoId}
        {...resto}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-200"
      />
    </label>
  )
}

export function Boton({ cargando, children, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean }) {
  return (
    <button
      {...resto}
      disabled={cargando || resto.disabled}
      className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
    >
      {cargando ? 'Un momento…' : children}
    </button>
  )
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'ok'; children: ReactNode }) {
  const color = tipo === 'error' ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'
  return (
    <p role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${color}`}>
      {children}
    </p>
  )
}
