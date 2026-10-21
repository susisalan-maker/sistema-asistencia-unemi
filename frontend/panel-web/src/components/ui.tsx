import { useState, type ReactNode } from 'react'

export function Cargando() {
  return (
    <div role="status" className="grid min-h-screen place-items-center text-sm font-semibold text-texto-suave">
      Cargando…
    </div>
  )
}

export function Logo({ oscuro = false, compacto = false }: { oscuro?: boolean; compacto?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid size-9 flex-none place-items-center rounded-full bg-ambar text-sm font-extrabold text-ambar-tinta">UA</div>
      {!compacto && (
        <div className={`text-sm font-extrabold leading-tight ${oscuro ? 'text-white' : 'text-marino'}`}>
          Asistencia<br />Universitaria
        </div>
      )}
    </div>
  )
}

/** Pantalla de acceso: panel azul a la izquierda y tarjeta a la derecha (como W1 del mockup). */
export function PantallaAcceso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen">
      <section className="hidden w-[44%] max-w-[560px] flex-none flex-col justify-between bg-marino p-14 text-white lg:flex">
        <Logo oscuro />
        <div>
          <h2 className="text-[44px] font-extrabold leading-[1.12] tracking-tight">Control de<br />asistencia</h2>
          <p className="mt-4 max-w-sm text-base font-medium leading-relaxed text-menu-texto">
            Registro de asistencia con ubicación y verificación facial, y revisión de anomalías por Talento Humano.
          </p>
        </div>
        <p className="text-xs font-semibold text-[#8593c0]">Acceso restringido · Dirección de Talento Humano</p>
      </section>
      <section className="grid flex-1 place-items-center px-5 py-10">
        <div className="w-full max-w-[440px] rounded-[22px] border border-borde-suave bg-white p-8 shadow-[0_14px_40px_rgba(27,42,110,.08)] sm:p-[34px]">
          <div className="mb-6 lg:hidden"><Logo /></div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-marino">{titulo}</h1>
          {subtitulo && <p className="mt-1.5 text-sm font-semibold text-texto-suave">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </section>
    </main>
  )
}

/** Alias usado por las pantallas de contraseña. */
export const TarjetaAcceso = PantallaAcceso

export function Campo(props: React.InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  const { etiqueta, id, type, ...resto } = props
  const campoId = id ?? `campo-${etiqueta.toLowerCase().replace(/\W+/g, '-')}`
  const [visible, setVisible] = useState(false)
  const esContrasena = type === 'password'
  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor={campoId} className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">{etiqueta}</label>
      <div className="relative">
        <input
          id={campoId}
          type={esContrasena && visible ? 'text' : type}
          {...resto}
          className={`h-[52px] w-full rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino outline-none focus:border-marino focus:ring-2 focus:ring-celeste ${esContrasena ? 'pr-16' : ''}`}
        />
        {esContrasena && (
          <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
            className="absolute inset-y-0 right-4 text-[13px] font-extrabold text-marino">
            {visible ? 'Ocultar' : 'Ver'}
          </button>
        )}
      </div>
    </div>
  )
}

export function Boton({
  cargando, variante = 'ambar', className = '', children, ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { cargando?: boolean; variante?: 'ambar' | 'marino' | 'borde' }) {
  const estilos = {
    ambar: 'bg-ambar text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95',
    marino: 'bg-marino text-white shadow-[0_4px_10px_rgba(27,42,110,.35)] hover:brightness-110',
    borde: 'border border-borde bg-white text-marino hover:bg-lienzo',
  }[variante]
  return (
    <button
      {...resto}
      disabled={cargando || resto.disabled}
      className={`w-full rounded-[14px] px-4 py-3.5 text-base font-extrabold disabled:opacity-60 ${estilos} ${className}`}
    >
      {cargando ? 'Un momento…' : children}
    </button>
  )
}

export function Aviso({ tipo, children }: { tipo: 'error' | 'ok' | 'aviso'; children: ReactNode }) {
  const color = {
    error: 'bg-error-fondo border-error-borde text-error',
    ok: 'bg-ok-fondo border-ok-borde text-ok',
    aviso: 'bg-aviso-fondo border-aviso-borde text-aviso',
  }[tipo]
  return (
    <p role={tipo === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm font-bold ${color}`}>
      {children}
    </p>
  )
}

/** Chip de estado (Activo, Vinculado, …). */
export function Chip({ tono, children }: { tono: 'ok' | 'aviso' | 'neutro' | 'error'; children: ReactNode }) {
  const color = {
    ok: 'bg-ok-fondo border-ok-borde text-ok',
    aviso: 'bg-aviso-fondo border-aviso-borde text-aviso',
    neutro: 'bg-celeste border-[#d3ddf1] text-marino',
    error: 'bg-error-fondo border-error-borde text-error',
  }[tono]
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-[5px] text-[11px] font-extrabold ${color}`}>{children}</span>
}
