import { useState, type ReactNode } from 'react'
import { SliderAcceso } from './SliderAcceso'

export function Cargando() {
  return (
    <div role="status" className="grid min-h-screen place-items-center text-sm font-semibold text-texto-suave">
      Cargando…
    </div>
  )
}

/** Marca del sistema: un visto (marcación aceptada) dentro del anillo punteado de la geocerca de la sede. */
export function MarcaLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="92 92.5 840 840" className={className} aria-hidden="true">
      <rect x="92" y="92.5" width="840" height="840" rx="210" fill="#1b2a6e" />
      <path d="M512 806 C512 806 300 576 300 431 A212 212 0 0 1 724 431 C724 576 512 806 512 806 Z" fill="#ffffff" />
      <circle cx="512" cy="431" r="124" fill="#f5a623" />
      <path d="M452 434 L497 480 L578 384" fill="none" stroke="#1b2a6e" strokeWidth="38" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Logo({ oscuro = false, compacto = false }: { oscuro?: boolean; compacto?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <MarcaLogo className="size-9 flex-none" />
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
      <SliderAcceso />
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
          className={`h-[52px] w-full rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino outline-none focus:border-marino focus:ring-2 focus:ring-celeste ${esContrasena ? 'pr-14' : ''}`}
        />
        {esContrasena && (
          <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}
            aria-label={visible ? 'Ocultar contraseña' : 'Ver contraseña'}
            className="absolute inset-y-0 right-4 flex items-center text-marino">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {visible ? (
                <>
                  <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                  <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                  <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                  <path d="m2 2 20 20" />
                </>
              ) : (
                <>
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                </>
              )}
            </svg>
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
