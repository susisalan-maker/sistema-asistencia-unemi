import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'

export type EstadoEnlace = 'cargando' | 'valido' | 'invalido'

/**
 * Los enlaces de invitación y de restablecimiento llegan con la sesión en la URL (que
 * supabase-js procesa solo). Si el enlace venció o ya se usó, Supabase agrega «error=» al hash.
 */
export function useEnlaceCorreo(): EstadoEnlace {
  const { cargando, session } = useAuth()
  // Se lee una sola vez: supabase-js limpia el hash después de procesarlo.
  const [conError] = useState(() => /[#&?]error=/.test(window.location.hash + window.location.search))
  if (conError) return 'invalido'
  if (cargando) return 'cargando'
  return session ? 'valido' : 'invalido'
}
