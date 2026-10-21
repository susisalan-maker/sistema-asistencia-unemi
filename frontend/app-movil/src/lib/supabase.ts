import 'expo-sqlite/localStorage/install'
import { createClient } from '@supabase/supabase-js'
import { AppState } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
const clavePublica = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''

export const configuracionCompleta = Boolean(url && clavePublica)

// Si faltan las variables no se rompe la app: se muestra un aviso en el login.
export const supabase = createClient(url || 'http://localhost', clavePublica || 'sin-clave', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // en el celular no hay una URL de la que leer la sesión
  },
})

// Solo refresca el token mientras la app está abierta (recomendado por Supabase para móvil).
AppState.addEventListener('change', (estado) => {
  if (estado === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})

/** URL del panel web, para los enlaces de los correos (restablecer contraseña). */
export const URL_PANEL_WEB = (process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:5173').replace(/\/$/, '')
