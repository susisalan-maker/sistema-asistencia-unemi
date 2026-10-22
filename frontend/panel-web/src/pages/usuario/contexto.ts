import { useOutletContext } from 'react-router-dom'

/** Lo que el marco de la persona usuaria comparte con sus pantallas: cuántos avisos puede explicar y cómo recontarlos. */
export interface ContextoUsuario {
  avisos: { cantidad: number; recargar: () => Promise<void> }
}

const SIN_CONTEXTO: ContextoUsuario['avisos'] = { cantidad: 0, recargar: async () => {} }

/** Los avisos pendientes. Fuera del marco (por ejemplo en una prueba suelta) no hay avisos y recargar no hace nada. */
export function useAvisos(): ContextoUsuario['avisos'] {
  return useOutletContext<ContextoUsuario | undefined>()?.avisos ?? SIN_CONTEXTO
}
