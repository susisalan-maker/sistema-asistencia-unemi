import { supabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Llama al microservicio enviando el token de sesión del usuario actual. */
export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const resp = await fetch(`${API_URL}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  })
  if (!resp.ok) {
    let mensaje = `Error ${resp.status}`
    try {
      const cuerpo = await resp.json()
      if (typeof cuerpo.detail === 'string') mensaje = cuerpo.detail
      else if (Array.isArray(cuerpo.detail)) mensaje = 'Revisa los datos ingresados'
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(resp.status, mensaje)
  }
  return resp.json() as Promise<T>
}
