import { cerrarPor, renovarToken } from './sesion'
import { supabase } from './supabase'

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

export class ApiError extends Error {
  status: number
  /** Código de máquina que algunas respuestas añaden (por ejemplo `sesion_vencida`). */
  codigo?: string
  constructor(status: number, message: string, codigo?: string) {
    super(message)
    this.status = status
    this.codigo = codigo
  }
}

function pedir(ruta: string, opciones: { method?: string; body?: unknown }, token?: string) {
  return fetch(`${API_URL}${ruta}`, {
    method: opciones.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  })
}

/**
 * Llama al microservicio enviando el token de sesión del usuario actual.
 * Si el servidor dice que la sesión ya no sirve (401), la renueva y repite la petición una vez; si aun así no
 * sirve, cierra la sesión y la persona vuelve al login con un aviso. Una cuenta desactivada hace lo mismo.
 */
export async function api<T>(ruta: string, opciones: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  let resp = await pedir(ruta, opciones, data.session?.access_token)
  let renovada = false
  if (resp.status === 401) {
    const nuevo = await renovarToken()
    if (nuevo) {
      renovada = true
      resp = await pedir(ruta, opciones, nuevo)
    }
  }
  if (!resp.ok) {
    let mensaje = `Error ${resp.status}`
    let codigo: string | undefined
    try {
      const cuerpo = await resp.json()
      if (typeof cuerpo.detail === 'string') mensaje = cuerpo.detail
      else if (Array.isArray(cuerpo.detail)) mensaje = 'Revisa los datos ingresados'
      if (typeof cuerpo.codigo === 'string') codigo = cuerpo.codigo
    } catch {
      /* sin cuerpo JSON */
    }
    if (resp.status === 401 && renovada) await cerrarPor('vencida')   // renovó y el servidor sigue sin aceptarla
    if (codigo === 'cuenta_inhabilitada') await cerrarPor('desactivada')
    throw new ApiError(resp.status, mensaje, codigo)
  }
  return resp.json() as Promise<T>
}
