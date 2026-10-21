import { supabase } from './supabase'

// En el celular "localhost" es el propio celular: en desarrollo usa la IP de tu computador (http://192.168.x.x:8000).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

const ESPERA_MAX_MS = 15_000

export class ApiError extends Error {
  status: number
  /** Código de máquina que algunas respuestas añaden (por ejemplo `rostro_no_verificado`). */
  codigo?: string
  /** Número de intento que informa el servidor cuando falla la verificación del rostro. */
  intento?: number
  constructor(status: number, message: string, extra: { codigo?: string; intento?: number } = {}) {
    super(message)
    // Sin esto, en algunos motores `instanceof ApiError` falla y la pantalla muestra un error genérico.
    Object.setPrototypeOf(this, ApiError.prototype)
    this.name = 'ApiError'
    this.status = status
    this.codigo = extra.codigo
    this.intento = extra.intento
  }
}

interface Opciones {
  method?: string
  body?: unknown
  headers?: Record<string, string>
  /** Para envíos pesados (varias fotos) que necesitan más de los 15 s habituales. */
  esperaMaxMs?: number
}

/** Llama al microservicio con el token de la sesión. Sin red, lanza un ApiError con status 0. */
export async function api<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  let resp: Response
  // Sin límite, un servidor inalcanzable (firewall, IP equivocada) deja la app esperando minutos sin decir nada.
  const control = new AbortController()
  const reloj = setTimeout(() => control.abort(), opciones.esperaMaxMs ?? ESPERA_MAX_MS)
  try {
    resp = await fetch(`${API_URL}${ruta}`, {
      signal: control.signal,
      method: opciones.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opciones.headers,
      },
      body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
    })
  } catch {
    throw new ApiError(
      0,
      control.signal.aborted
        ? `El servidor no respondió (${API_URL}). Revisa que el celular y la computadora estén en la misma red, que el microservicio esté encendido y que EXPO_PUBLIC_API_URL tenga la IP correcta.`
        : 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.',
    )
  } finally {
    clearTimeout(reloj)
  }
  if (!resp.ok) {
    let mensaje = `Error ${resp.status}`
    const extra: { codigo?: string; intento?: number } = {}
    try {
      const cuerpo = await resp.json()
      if (typeof cuerpo.detail === 'string') mensaje = cuerpo.detail
      else if (Array.isArray(cuerpo.detail)) mensaje = 'Revisa los datos enviados'
      if (typeof cuerpo.codigo === 'string') extra.codigo = cuerpo.codigo
      if (typeof cuerpo.intento === 'number') extra.intento = cuerpo.intento
    } catch {
      /* sin cuerpo JSON */
    }
    throw new ApiError(resp.status, mensaje, extra)
  }
  try {
    return (await resp.json()) as T
  } catch {
    throw new ApiError(resp.status, 'El servidor respondió algo inesperado. Revisa que EXPO_PUBLIC_API_URL apunte al microservicio.')
  }
}
