import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// «Patrones a revisar»: personas con varios casos en los últimos 30 días (función `patrones_anomalias`, migración 0017).
// Sirve para conversar con la persona o ajustar algo, no para sancionar: nada de esto decide un caso.

export interface PatronPersona {
  usuario_id: string
  nombre: string
  sede: string | null
  /** Casos de los últimos 30 días. */
  total: number
  /** De esos, cuántos terminaron justificados. */
  justificadas: number
  /** El tipo de caso que más se repite y cuántas veces. */
  tipo: string
  tipo_total: number
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

export function leerPatrones(crudo: unknown): PatronPersona[] {
  if (!Array.isArray(crudo)) return []
  return crudo
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      usuario_id: String(x.usuario_id ?? ''),
      nombre: typeof x.nombre === 'string' && x.nombre ? x.nombre : 'Persona sin nombre',
      sede: typeof x.sede === 'string' && x.sede ? x.sede : null,
      total: num(x.total), justificadas: num(x.justificadas),
      tipo: String(x.tipo ?? ''), tipo_total: num(x.tipo_total),
    }))
}

/** Pide a la base los patrones de los últimos 30 días. `sedeId` vacío = todas las sedes. Lanza un error si falla. */
export async function consultarPatrones(sedeId: string): Promise<PatronPersona[]> {
  const { data, error } = await supabase.rpc('patrones_anomalias', sedeId ? { p_sede: sedeId } : {})
  if (error) throw error
  return leerPatrones(data)
}

/** Qué conviene hacer según el tipo de caso que más se repite. Es una sugerencia para conversar, no una conclusión. */
export function sugerenciaPara(tipo: string): string {
  switch (tipo) {
    case 'almuerzo_excedido':
    case 'sin_regreso_almuerzo':
    case 'fuera_horario':
      return 'Revisar el horario asignado'
    case 'verificacion_fallida':
      return 'Revisar el rostro registrado'
    case 'fuera_geocerca':
      return 'Revisar la zona de su sede'
    default:
      return 'Conversar con la persona'
  }
}

/** Los patrones y su estado de carga; se vuelven a pedir solo si cambia la sede. Con `activo` en falso no se pide nada. */
export function usePatrones(sedeId: string, activo = true) {
  const [patrones, setPatrones] = useState<PatronPersona[] | null>(null)
  const [error, setError] = useState(false)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (!activo) return
    let vigente = true
    setPatrones(null)
    setError(false)
    consultarPatrones(sedeId).then((r) => { if (vigente) setPatrones(r) }).catch(() => { if (vigente) setError(true) })
    return () => { vigente = false }
  }, [sedeId, activo, reintento])
  return { patrones: activo ? patrones : null, error: activo && error, reintentar: () => setReintento((n) => n + 1) }
}
