import { useEffect, type ReactNode } from 'react'

export function Modal({ titulo, subtitulo, onCerrar, ancho = 'normal', children }: { titulo: string; subtitulo?: string; onCerrar: () => void; ancho?: 'normal' | 'amplio'; children: ReactNode }) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-marino/40 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={`max-h-[94vh] w-full overflow-y-auto rounded-[22px] bg-white p-5 shadow-[0_24px_60px_rgba(27,42,110,.14)] sm:p-7 ${ancho === 'amplio' ? 'max-w-[760px]' : 'max-w-[480px]'}`}>
        <div className="flex items-start gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-marino">{titulo}</h2>
            {subtitulo && <p className="mt-1 text-[13px] font-semibold text-texto-suave">{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" className="ml-auto text-xl font-bold text-etiqueta hover:text-marino">×</button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}
