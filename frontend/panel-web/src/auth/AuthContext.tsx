import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'

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
}

const AuthContext = createContext<AuthState | null>(null)

export function rutaInicio(rol: Rol): string {
  return rol === 'administrador' ? '/admin' : '/usuario'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [sesionLista, setSesionLista] = useState(false)
  const [perfilListo, setPerfilListo] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSesionLista(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, nueva) => {
      setSession(nueva) // no se consulta la base aquí dentro: se hace en el efecto de abajo
      setSesionLista(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    let cancelado = false
    if (!userId) {
      setPerfil(null)
      setPerfilListo(true)
      return
    }
    setPerfilListo(false)
    supabase
      .from('usuarios')
      .select('id, nombres, apellidos, email, rol, activo')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return
        setPerfil((data as Perfil | null) ?? null)
        setPerfilListo(true)
      })
    return () => {
      cancelado = true
    }
  }, [userId])

  const valor = useMemo<AuthState>(
    () => ({
      cargando: !sesionLista || !perfilListo,
      session,
      perfil,
      async iniciarSesion(email, contrasena) {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: contrasena })
        if (error) return 'Correo o contraseña incorrectos'
        return null
      },
      async cerrarSesion() {
        await supabase.auth.signOut()
      },
    }),
    [sesionLista, perfilListo, session, perfil],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

export { AuthContext }
