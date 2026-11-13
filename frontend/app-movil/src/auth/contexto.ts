import type { Session } from '@supabase/supabase-js'
import { createContext } from 'react'

export type Rol = 'usuario' | 'administrador'
export interface Perfil {
  id: string
  nombres: string
  apellidos: string
  email: string
  rol: Rol
  activo: boolean
}

export interface AuthState {
  /** true mientras se averigua si hay sesión y se carga el perfil */
  cargando: boolean
  session: Session | null
  perfil: Perfil | null
  iniciarSesion: (email: string, contrasena: string) => Promise<string | null>
  cerrarSesion: () => Promise<void>
  /** Vuelve a pedir el perfil (nombre, rol…) por si Talento Humano lo cambió. Sin internet no hace nada. */
  recargarPerfil: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

