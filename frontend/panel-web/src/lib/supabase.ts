import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const configuracionCompleta = Boolean(url && anonKey)

// La anon key es pública; la seguridad real la dan las políticas RLS de la base de datos.
// NUNCA usar aquí la service_role key.
export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'sin-configurar', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
