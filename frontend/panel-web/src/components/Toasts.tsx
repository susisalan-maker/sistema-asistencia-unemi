import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AuthContext } from '../auth/AuthContext'

export type TipoToast = 'ok' | 'aviso' | 'error'

/** Cuánto dura cada tipo en pantalla. Un error no se va solo: se queda hasta que se cierre. */
export const DURACION_TOAST_MS: Record<TipoToast, number | null> = { ok: 5000, aviso: 8000, error: null }
/** Cuántas notificaciones caben a la vez; si llega otra, se va la más antigua. */
export const MAXIMO_TOASTS = 3

interface Toast { id: number; tipo: TipoToast; texto: string }
type Notificar = (tipo: TipoToast, texto: string) => void

const Contexto = createContext<Notificar | null>(null)

/** Lo que usan las pantallas: `notificar('ok', 'Sede guardada')`. Sin proveedor no hace nada (por ejemplo, en una prueba aislada). */
export function useNotificar(): Notificar {
  return useContext(Contexto) ?? (() => {})
}

const ESTILO: Record<TipoToast, { caja: string; barra: string; icono: string }> = {
  ok: { caja: 'border-ok-borde bg-ok-fondo text-ok', barra: 'bg-ok', icono: '✓' },
  aviso: { caja: 'border-aviso-borde bg-aviso-fondo text-aviso', barra: 'bg-aviso', icono: '!' },
  error: { caja: 'border-error-borde bg-error-fondo text-error', barra: 'bg-error', icono: '!' },
}

/**
 * Notificaciones flotantes abajo a la derecha (en el celular, abajo y a lo ancho). Las de éxito y aviso se van solas, con
 * una barra fina que muestra el tiempo; al pasar el cursor o enfocarlas se detienen. Los errores se quedan hasta cerrarlos.
 * Se cierran con la ✕ o con Esc (la más reciente). Solo la propia caja recibe clics: el resto de la página sigue usable.
 * Al cerrarse la sesión (a mano, por inactividad o porque venció) se limpian todas: nada de una sesión se arrastra al login.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const siguiente = useRef(1)
  // Sin AuthProvider (una prueba aislada) no hay sesión que vigilar y esto no hace nada.
  const usuarioId = useContext(AuthContext)?.session?.user.id ?? null
  useEffect(() => { if (!usuarioId) setToasts([]) }, [usuarioId])

  const cerrar = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notificar = useCallback<Notificar>((tipo, texto) => {
    // Repetir el mismo mensaje no lo duplica: reemplaza al anterior y reinicia su tiempo.
    setToasts((t) => [...t.filter((x) => !(x.tipo === tipo && x.texto === texto)), { id: siguiente.current++, tipo, texto }].slice(-MAXIMO_TOASTS))
  }, [])

  useEffect(() => {
    if (toasts.length === 0) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setToasts((t) => t.slice(0, -1)) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [toasts.length])

  const valor = useMemo(() => notificar, [notificar])
  return (
    <Contexto.Provider value={valor}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 max-sm:inset-x-4 max-sm:w-auto">
          {toasts.map((t) => <ToastItem key={t.id} toast={t} alCerrar={() => cerrar(t.id)} />)}
        </div>
      )}
    </Contexto.Provider>
  )
}

function ToastItem({ toast, alCerrar }: { toast: Toast; alCerrar: () => void }) {
  const duracion = DURACION_TOAST_MS[toast.tipo]
  const [detenido, setDetenido] = useState(false)
  const restante = useRef(duracion ?? 0)
  const desde = useRef(0)

  useEffect(() => {
    if (duracion === null || detenido) return
    desde.current = Date.now()
    const espera = setTimeout(alCerrar, restante.current)
    return () => {
      clearTimeout(espera)
      restante.current = Math.max(0, restante.current - (Date.now() - desde.current))
    }
  }, [duracion, detenido, alCerrar])

  const e = ESTILO[toast.tipo]
  return (
    <div
      role={toast.tipo === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setDetenido(true)} onMouseLeave={() => setDetenido(false)}
      onFocus={() => setDetenido(true)} onBlur={() => setDetenido(false)}
      className={`toast-entra pointer-events-auto relative overflow-hidden rounded-xl border shadow-[0_10px_28px_rgba(27,42,110,.18)] ${e.caja}`}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span aria-hidden="true" className={`mt-px grid size-5 flex-none place-items-center rounded-full text-[12px] font-extrabold text-white ${e.barra}`}>{e.icono}</span>
        <p className="min-w-0 flex-1 text-sm font-bold leading-snug">{toast.texto}</p>
        <button type="button" onClick={alCerrar} aria-label="Cerrar notificación"
          className="-mr-1 grid size-6 flex-none place-items-center rounded-md text-[15px] font-extrabold leading-none opacity-70 hover:bg-black/5 hover:opacity-100">
          ✕
        </button>
      </div>
      {duracion !== null && (
        <div aria-hidden="true" className="h-[3px] w-full bg-black/5">
          <div className={`toast-barra h-full ${e.barra}`} style={{ animationDuration: `${duracion}ms`, animationPlayState: detenido ? 'paused' : 'running' }} />
        </div>
      )}
    </div>
  )
}
