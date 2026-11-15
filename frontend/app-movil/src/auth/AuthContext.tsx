import type { Session } from '@supabase/supabase-js'
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { olvidarAvisoDeSalida, revisarCuenta } from '../lib/sesion'
import { guardarPerfil, leerPerfilGuardado, leerSesionGuardada, olvidarPerfilGuardado } from '../lib/sesionGuardada'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState, type Perfil, type Rol } from './contexto'

export { AuthContext }
export type { AuthState, Perfil, Rol }

/** Cuánto se espera al perfil antes de usar la copia guardada (con señal muy débil la consulta puede quedarse colgada). */
const ESPERA_PERFIL_MS = 6000

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
    supabase.auth.getSession().then(({ data, error }) => {
      // Sin internet y con el acceso vencido, Supabase no puede renovarlo y dice «sin sesión» aunque siga guardada:
      // se usa la guardada para poder abrir y marcar sin conexión. Al volver el internet se renueva sola.
      setSession(data.session ?? (error?.name === 'AuthRetryableFetchError' ? leerSesionGuardada() : null))
      setSesionLista(true)
    }, () => {
      setSession(leerSesionGuardada())
      setSesionLista(true)
    })
    const { data } = supabase.auth.onAuthStateChange((evento, nueva) => {
      // no se consulta la base aquí dentro: se hace en el efecto de abajo
      // Al abrir, «sin sesión» con una sesión guardada significa que no se pudo renovar (sin internet): no se la descarta.
      setSession(nueva ?? (evento === 'INITIAL_SESSION' ? leerSesionGuardada() : null))
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
      guardarPerfil(nuevo)
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
    const consulta = supabase
      .from('usuarios')
      .select('id, nombres, apellidos, email, rol, activo')
      .eq('id', userId)
      .maybeSingle()
    // Sin respuesta a tiempo se cuenta como fallo, para no dejar la pantalla de bienvenida esperando sin señal.
    let reloj: ReturnType<typeof setTimeout> | undefined
    const limite = new Promise<{ data: null; error: { message: string } }>((res) => { reloj = setTimeout(() => res({ data: null, error: { message: 'tiempo agotado' } }), ESPERA_PERFIL_MS) })
    Promise.race([consulta, limite]).then((r) => {
      clearTimeout(reloj)
      if (cancelado) return
      const { data, error } = r as { data: Perfil | null; error?: unknown }
      if (data) {
        guardarPerfil(data)
        setPerfil(data)
      } else if (error) {
        // No se pudo consultar (sin internet): se usa la copia guardada de esta misma cuenta, si hay.
        setPerfil(leerPerfilGuardado(userId))
      } else {
        olvidarPerfilGuardado() // la consulta respondió y no hay fila: la cuenta ya no existe
        setPerfil(null)
      }
      setPerfilListo(true)
    })
    return () => {
      cancelado = true
      clearTimeout(reloj)
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
        olvidarPerfilGuardado()
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

