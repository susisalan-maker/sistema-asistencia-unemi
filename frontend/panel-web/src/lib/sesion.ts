import { supabase } from './supabase'

/** Por qué se cerró la sesión sin que la persona lo pidiera. */
export type MotivoSalida = 'vencida' | 'desactivada'

export const TEXTO_SALIDA: Record<MotivoSalida, string> = {
  vencida: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  desactivada: 'Tu cuenta fue desactivada. Comunícate con Talento Humano.',
}

// Se queda en memoria hasta que el login lo muestre: al cerrar la sesión la guarda de rutas lleva al login sola.
let motivoPendiente: MotivoSalida | null = null
export const avisoDeSalida = (): MotivoSalida | null => motivoPendiente
export const olvidarAvisoDeSalida = () => { motivoPendiente = null }

let cierre: Promise<void> | null = null
/** Cierra la sesión de este navegador (sin tocar otros dispositivos) y deja el motivo para mostrarlo en el login. */
export function cerrarPor(motivo: MotivoSalida): Promise<void> {
  motivoPendiente = motivo
  cierre ??= supabase.auth.signOut({ scope: 'local' }).then(
    () => undefined,
    () => undefined,
  ).finally(() => { cierre = null })
  return cierre
}

/** El error de Supabase significa que la sesión ya no existe (y no un simple corte de internet). */
function sesionMuerta(error: { name?: string; status?: number }): boolean {
  if (error.name === 'AuthSessionMissingError') return true
  return typeof error.status === 'number' && [400, 401, 403, 404].includes(error.status)
}

let renovacion: Promise<string | null> | null = null
/**
 * Pide un token nuevo a Supabase. Si ya no se puede (sesión terminada), cierra la sesión y devuelve null.
 * Si solo falló internet, devuelve null SIN cerrar la sesión. Varias llamadas a la vez comparten una sola renovación.
 */
export function renovarToken(): Promise<string | null> {
  renovacion ??= supabase.auth.refreshSession().then(
    async ({ data, error }) => {
      if (!error && data.session) return data.session.access_token
      if (error && sesionMuerta(error)) await cerrarPor('vencida')
      return null
    },
    () => null,
  ).finally(() => { renovacion = null })
  return renovacion
}

/** Comprueba que la sesión y la cuenta sigan valiendo (al volver a la pestaña o a la app). Sin internet no hace nada. */
export async function revisarCuenta(): Promise<void> {
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  const { data: u, error } = await supabase.auth.getUser()
  if (error) {
    if (sesionMuerta(error)) await cerrarPor('vencida')
    return
  }
  const r = await supabase.from('usuarios').select('activo').eq('id', u.user.id).maybeSingle()
  if (r.data && (r.data as { activo: boolean }).activo === false) await cerrarPor('desactivada')
}
