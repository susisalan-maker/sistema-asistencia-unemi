import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { consultarAtencion, consultarEstadoHoy, type Atencion, type EstadoHoy } from './estadoHoy'

/** Cada cuánto se vuelve a pedir todo aunque no llegue ningún aviso: quien llega tarde no genera ninguna marcación que avise. */
export const REFRESCO_MS = 60_000
/** Tras un aviso se espera un momento por si llegan varios seguidos (un grupo de personas marcando) y se pide una sola vez. */
export const ESPERA_AVISO_MS = 1_500

/**
 * El estado de hoy y lo que requiere atención, siempre al día:
 *  1. al abrir, se piden a la base (que es quien calcula: el navegador no suma nada);
 *  2. Supabase Realtime avisa cuando entra una marcación o cambia un caso, y entonces se vuelve a pedir (el aviso solo
 *     «toca el timbre»: no se usa su contenido, que traería coordenadas);
 *  3. cada minuto y al volver a la pestaña se vuelve a pedir, por si no llegó ningún aviso.
 * Si Realtime no está disponible, todo sigue funcionando con el refresco de cada minuto.
 */
export function useEstadoHoy() {
  const [estado, setEstado] = useState<EstadoHoy | null>(null)
  const [atencion, setAtencion] = useState<Atencion | null>(null)
  const [errorEstado, setErrorEstado] = useState(false)
  const [errorAtencion, setErrorAtencion] = useState(false)
  const [actualizadoEn, setActualizadoEn] = useState<number | null>(null)
  const [enVivo, setEnVivo] = useState(false)
  const turno = useRef(0)

  const cargar = useCallback(async () => {
    const mio = ++turno.current
    const [e, a] = await Promise.allSettled([consultarEstadoHoy(), consultarAtencion()])
    if (mio !== turno.current) return   // llegó una respuesta más nueva: esta ya no sirve
    if (e.status === 'fulfilled') { setEstado(e.value); setErrorEstado(false); setActualizadoEn(Date.now()) } else setErrorEstado(true)
    if (a.status === 'fulfilled') { setAtencion(a.value); setErrorAtencion(false) } else setErrorAtencion(true)
  }, [])

  useEffect(() => {
    void cargar()
    const cadaMinuto = setInterval(() => void cargar(), REFRESCO_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') void cargar() }
    document.addEventListener('visibilitychange', alVolver)

    let espera: ReturnType<typeof setTimeout> | undefined
    const avisar = () => {
      clearTimeout(espera)
      espera = setTimeout(() => void cargar(), ESPERA_AVISO_MS)
    }
    let canal: ReturnType<typeof supabase.channel> | null = null
    try {
      canal = supabase.channel('dashboard-hoy')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'marcaciones' }, avisar)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'anomalias' }, avisar)
        .subscribe((s: string) => setEnVivo(s === 'SUBSCRIBED'))
    } catch { setEnVivo(false) }

    return () => {
      turno.current++
      clearInterval(cadaMinuto)
      clearTimeout(espera)
      document.removeEventListener('visibilitychange', alVolver)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [cargar])

  return { estado, atencion, errorEstado, errorAtencion, actualizadoEn, enVivo, recargar: cargar }
}
