import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { contarJustificadasDesde, guardarVisita, leerVisita } from './novedadesBandeja'

/** Cada cuánto se vuelve a contar lo nuevo aunque no se cambie de pantalla. */
export const REFRESCO_NOVEDADES_MS = 60_000

interface Novedades {
  /** Desde cuándo se cuenta lo nuevo (la última vez que el administrador salió de la bandeja); null si aún no se sabe. */
  desde: string | null
  /** Cuántos casos justificaron las personas desde entonces. */
  cantidad: number
}

const SIN_NOVEDADES: Novedades = { desde: null, cantidad: 0 }
const Contexto = createContext<Novedades>(SIN_NOVEDADES)
export const useNovedades = () => useContext(Contexto)

/**
 * Lo que justificaron las personas desde la última vez que el administrador estuvo en la bandeja.
 * La primera vez no hay nada guardado: se empieza a contar desde ahora. Mientras está en la bandeja (o en un caso)
 * lo nuevo se marca en las tarjetas; al salir a otra sección, queda como visto.
 */
export function useNovedadesBandeja(usuarioId: string | undefined, enBandeja: boolean): Novedades {
  const [desde, setDesde] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(0)
  const estuvo = useRef(false)
  const dentro = useRef(enBandeja)
  dentro.current = enBandeja

  useEffect(() => {
    if (!usuarioId) return
    let d = leerVisita(usuarioId)
    if (!d) { d = new Date().toISOString(); guardarVisita(usuarioId, d) }
    setDesde(d)
  }, [usuarioId])

  const contar = useCallback(async () => {
    if (!desde) return
    try { setCantidad(await contarJustificadasDesde(desde)) } catch { /* es un aviso: si falla, no estorba */ }
  }, [desde])

  useEffect(() => {
    void contar()
    const cada = setInterval(() => void contar(), REFRESCO_NOVEDADES_MS)
    const alVolver = () => { if (document.visibilityState === 'visible') void contar() }
    document.addEventListener('visibilitychange', alVolver)
    return () => { clearInterval(cada); document.removeEventListener('visibilitychange', alVolver) }
  }, [contar, enBandeja])

  // Al salir de la bandeja, lo que había queda como visto.
  useEffect(() => {
    if (!usuarioId) return
    if (estuvo.current && !enBandeja) {
      const ahora = new Date().toISOString()
      guardarVisita(usuarioId, ahora)
      setDesde(ahora)
      setCantidad(0)
    }
    estuvo.current = enBandeja
  }, [enBandeja, usuarioId])

  // Si cierra la pestaña estando en la bandeja, también cuenta como visto.
  useEffect(() => {
    if (!usuarioId) return
    const alCerrar = () => { if (dentro.current) guardarVisita(usuarioId, new Date().toISOString()) }
    window.addEventListener('pagehide', alCerrar)
    return () => window.removeEventListener('pagehide', alCerrar)
  }, [usuarioId])

  return useMemo(() => ({ desde, cantidad }), [desde, cantidad])
}

export function ProveedorNovedades({ valor, children }: { valor: Novedades; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
