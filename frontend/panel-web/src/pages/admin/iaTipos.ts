/** Claves de IA del chat de justificación: cada una es proveedor + modelo + llave (cifrada en el servidor), y UNA está activa. */
export type ProveedorIA = 'gemini' | 'anthropic' | 'openai'

export interface ClaveIA {
  id: string
  nombre: string
  proveedor: ProveedorIA
  proveedor_nombre: string
  /** Modelo guardado; null = el recomendado del proveedor. */
  modelo: string | null
  modelo_predeterminado: string
  activa: boolean
  /** Solo los últimos 4 caracteres de la llave: la llave completa nunca vuelve al panel. */
  ultimos_4: string
  created_at: string | null
  updated_at: string | null
}

export interface ProveedorInfo {
  id: ProveedorIA
  nombre: string
  modelo_predeterminado: string
}

/** Qué IA respondería ahora: la clave activa del panel o, si no hay, la llave del .env del servidor. */
export interface EnUso {
  origen: 'panel' | 'servidor'
  nombre: string | null
  proveedor: ProveedorIA
  proveedor_nombre: string
  modelo: string
}

export interface EstadoIA {
  puede_guardar_llaves: boolean
  proveedores: ProveedorInfo[]
  claves: ClaveIA[]
  en_uso: EnUso | null
  /** La clave activa del panel no se pudo abrir (p. ej. cambió la clave de cifrado del servidor). */
  activa_ilegible: boolean
}

export function errorDeNombre(texto: string): string | null {
  const t = texto.trim()
  if (!t) return 'Escribe un nombre para reconocerla'
  if (t.length > 60) return 'El nombre es demasiado largo (máximo 60 caracteres)'
  return null
}

/** Vacío es válido: significa «el modelo recomendado del proveedor». */
export function errorDeModelo(texto: string): string | null {
  const t = texto.trim()
  if (!t) return null
  if (t.length > 80) return 'El nombre del modelo es demasiado largo (máximo 80 caracteres)'
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(t)) return 'Usa solo letras, números y . _ : / -, sin espacios'
  return null
}

export function errorDeLlave(texto: string): string | null {
  const t = texto.trim()
  if (t.length < 20) return 'La llave parece incompleta (mínimo 20 caracteres)'
  if (t.length > 400) return 'La llave es demasiado larga'
  if (!/^[\x21-\x7E]+$/.test(t)) return 'La llave no puede tener espacios ni caracteres especiales'
  return null
}
