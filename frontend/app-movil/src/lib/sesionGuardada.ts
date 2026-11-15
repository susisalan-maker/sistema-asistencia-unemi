import type { Session } from '@supabase/supabase-js'
import type { Perfil } from '../auth/contexto'

/**
 * Lo que la app guarda en el celular para poder abrir SIN internet (por ejemplo, tras cerrarla de las apps recientes en un lugar
 * sin señal): la sesión que guarda Supabase y una copia del perfil. Con eso se entra directo y se puede marcar sin conexión; al
 * volver el internet, la app renueva el acceso y, si la cuenta ya no vale, lleva al login como siempre.
 */
// Supabase guarda la sesión con esta clave: «sb-» + la primera parte del dominio del proyecto + «-auth-token».
const claveSesion = (): string | null => {
  try { return `sb-${new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').hostname.split('.')[0]}-auth-token` } catch { return null }
}
const CLAVE_PERFIL = 'perfil-guardado'

const almacen = (): Storage | null => (typeof localStorage === 'undefined' ? null : localStorage)

/** La sesión que Supabase dejó guardada (aunque su acceso ya haya vencido: no se pudo renovar por falta de internet). */
export function leerSesionGuardada(): Session | null {
  try {
    const a = almacen()
    const clave = claveSesion()
    if (!a || !clave) return null
    const crudo = a.getItem(clave)
    if (!crudo) return null
    const s = JSON.parse(crudo) as Partial<Session> | null
    return s?.user?.id && s.refresh_token ? (s as Session) : null
  } catch {
    return null
  }
}

export function guardarPerfil(perfil: Perfil): void {
  try { almacen()?.setItem(CLAVE_PERFIL, JSON.stringify(perfil)) } catch { /* sin almacenamiento: solo se pierde poder abrir sin internet */ }
}

/** La copia del perfil de esa persona; si la guardada es de otra cuenta, no sirve. */
export function leerPerfilGuardado(userId: string): Perfil | null {
  try {
    const crudo = almacen()?.getItem(CLAVE_PERFIL)
    if (!crudo) return null
    const p = JSON.parse(crudo) as Perfil
    return p?.id === userId ? p : null
  } catch {
    return null
  }
}

export function olvidarPerfilGuardado(): void {
  try { almacen()?.removeItem(CLAVE_PERFIL) } catch { /* nada que borrar */ }
}
