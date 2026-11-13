import type { Session } from '@supabase/supabase-js'
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { olvidarAvisoDeSalida, revisarCuenta } from '../lib/sesion'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState, type Perfil, type Rol } from './contexto'

export { AuthContext }
export type { AuthState, Perfil, Rol }

/** Puede entrar a la app solo quien tiene sesión, perfil y cuenta activa. */
export function puedeEntrar(s: Pick<AuthState, 'session' | 'perfil'>): boolean {
  return Boolean(s.session && s.perfil?.activo)
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

  const recargarPerfil = useCallback(async () => {
    if (!userId) return
    try {
      const { data } = await supabase.from('usuarios').select('id, nombres, apellidos, email, rol, activo').eq('id', userId).maybeSingle()
      if (!data) return // sin internet o sin fila: se queda con lo que ya se mostraba
      const nuevo = data as Perfil
      // Solo se actualiza si algo cambió, para no repintar toda la app de balde.
      setPerfil((actual) => (actual && (Object.keys(nuevo) as (keyof Perfil)[]).every((k) => actual[k] === nuevo[k]) ? actual : nuevo))
    } catch {
      // un fallo de red no debe romper nada: se conserva el perfil actual
    }
  }, [userId])

  // Al volver a la app se comprueba que la sesión y la cuenta sigan valiendo: así una cuenta desactivada
  // o una sesión terminada llevan al login enseguida y no al primer error.
  useEffect(() => {
    if (!userId) return
    const suscripcion = AppState.addEventListener('change', (estado) => { if (estado === 'active') { void revisarCuenta(); void recargarPerfil() } })
    return () => suscripcion.remove()
  }, [userId, recargarPerfil])

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
        olvidarAvisoDeSalida()
        return null
      },
      async cerrarSesion() {
        await supabase.auth.signOut()
      },
      recargarPerfil,
    }),
    [sesionLista, perfilListo, session, perfil, recargarPerfil],
  )

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

