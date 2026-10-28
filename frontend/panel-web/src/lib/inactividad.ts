import { useEffect, useRef } from 'react'

/** Tiempo sin tocar la pantalla tras el cual la sesión de la persona usuaria se cierra sola (es un equipo de contingencia, a veces ajeno). */
export const INACTIVIDAD_MS = 10 * 60 * 1000

const EVENTOS = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'] as const

/**
 * Llama a `alVencer` cuando pasan `ms` sin actividad (clics, teclas, toques o desplazamiento).
 * Se guarda la hora de la última actividad y no solo un temporizador: si el equipo se durmió, al despertar se cierra de inmediato.
 */
export function useInactividad(alVencer: () => void, ms: number = INACTIVIDAD_MS) {
  const llamar = useRef(alVencer)
  llamar.current = alVencer

  useEffect(() => {
    let ultima = Date.now()
    let reloj: ReturnType<typeof setTimeout>
    const armar = (espera: number) => {
      reloj = setTimeout(() => {
        const faltan = ms - (Date.now() - ultima)
        if (faltan <= 0) llamar.current()
        else armar(faltan)
      }, espera)
    }
    const actividad = () => { ultima = Date.now() }
    const alVolver = () => { if (document.visibilityState === 'visible' && Date.now() - ultima >= ms) llamar.current() }
    for (const e of EVENTOS) window.addEventListener(e, actividad, { passive: true })
    document.addEventListener('visibilitychange', alVolver)
    armar(ms)
    return () => {
      clearTimeout(reloj)
      for (const e of EVENTOS) window.removeEventListener(e, actividad)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [ms])
}
