import { useEffect, useState } from 'react'
import { Logo } from './ui'

const SLIDES = [
  { foto: '/login/unemi.png', titulo: 'Control de asistencia', texto: 'Registro con ubicación y verificación facial, y revisión de anomalías por Talento Humano.' },
  { foto: '/login/equipo.jpg', titulo: 'Revisión con criterio humano', texto: 'Cada anomalía la decide una persona de Talento Humano, con su comentario y su registro en la bitácora.' },
  { foto: '/login/celular.jpg', titulo: 'Marca desde tu celular', texto: 'Tu rostro y tu ubicación se verifican en segundos, también cuando no hay conexión.' },
]
const CADA_MS = 5000

/** Panel izquierdo de las pantallas de acceso: fotos que cambian con fundido, texto del slide, indicadores y flechas. */
export function SliderAcceso() {
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const ir = (n: number) => setI((n + SLIDES.length) % SLIDES.length)

  useEffect(() => {
    if (pausa || reducir) return
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), CADA_MS)
    return () => clearInterval(t)
  }, [pausa, reducir])

  return (
    <section aria-label="Presentación del sistema" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      className="relative hidden w-[50%] max-w-[760px] flex-none overflow-hidden bg-marino text-white lg:block">
      {SLIDES.map((s, n) => (
        <img key={s.foto} src={s.foto} alt="" aria-hidden="true" loading={n === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${n === i ? 'opacity-100' : 'opacity-0'}`} />
      ))}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-marino via-marino/55 to-marino/30" />
      <svg aria-hidden="true" viewBox="0 0 800 300" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[38%] w-full">
        <path d="M0 120 C160 40 300 190 480 130 C620 85 720 60 800 90 L800 300 L0 300 Z" fill="#f5a623" fillOpacity=".28" />
        <path d="M0 170 C150 110 320 230 500 180 C650 140 740 120 800 150 L800 300 L0 300 Z" fill="#e4eaf8" fillOpacity=".22" />
        <path d="M0 215 C180 170 330 260 520 225 C660 200 750 190 800 205 L800 300 L0 300 Z" fill="#1b2a6e" />
      </svg>

      <div className="relative z-10 flex h-full min-h-screen flex-col justify-between p-14">
        <Logo oscuro />
        <div>
          <div className="relative min-h-[210px]" aria-live="polite">
            {SLIDES.map((s, n) => (
              <div key={s.titulo} aria-hidden={n !== i}
                className={`absolute inset-x-0 top-0 transition-all duration-700 ${n === i ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'}`}>
                <h2 className="text-[44px] font-extrabold leading-[1.12] tracking-tight">{s.titulo}</h2>
                <p className="mt-4 max-w-md text-lg font-medium leading-relaxed text-white/90">{s.texto}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {SLIDES.map((s, n) => (
                <button key={s.titulo} type="button" onClick={() => ir(n)} aria-label={`Ir a la imagen ${n + 1}`} aria-current={n === i}
                  className={`h-1 rounded-full transition-all duration-500 ${n === i ? 'w-12 bg-white' : 'w-4 bg-white/40 hover:bg-white/70'}`} />
              ))}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => ir(i - 1)} aria-label="Imagen anterior"
                className="grid size-10 place-items-center rounded-full border border-white/30 hover:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
              </button>
              <button type="button" onClick={() => ir(i + 1)} aria-label="Imagen siguiente"
                className="grid size-10 place-items-center rounded-full border border-white/30 hover:bg-white/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
