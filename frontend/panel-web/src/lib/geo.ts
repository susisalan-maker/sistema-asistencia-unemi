// Utilidades de coordenadas para las zonas de marcación (sedes y bloques).

export interface Punto { lat: number; lon: number }

/** Rangos permitidos; son los mismos CHECK de la base de datos y del microservicio. */
export const RADIO_SEDE = { min: 50, max: 1000 }
export const RADIO_BLOQUE = { min: 20, max: 200 }

/** Convierte lo que escribe la persona ("-2,14" o "-2.14") en número. Devuelve null si no es válido. */
export function parseCoordenada(texto: string): number | null {
  const t = texto.trim().replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

export const latitudValida = (n: number | null): n is number => n !== null && n >= -90 && n <= 90
export const longitudValida = (n: number | null): n is number => n !== null && n >= -180 && n <= 180

/** Texto con 6 decimales (≈ 11 cm), suficiente para un punto en el mapa. */
export const formatoCoordenada = (n: number): string => String(Number(n.toFixed(6)))

/** Distancia en metros entre dos puntos (fórmula de haversine). */
export function distanciaMetros(a: Punto, b: Punto): number {
  const R = 6371008.8 // radio medio de la Tierra en metros
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Valida lo escrito en el selector y devuelve el punto, o el mensaje de error. */
export function leerZona(v: { lat: string; lon: string; radio: number }, rango: { min: number; max: number }): { lat: number; lon: number; radio: number } | string {
  const lat = parseCoordenada(v.lat)
  const lon = parseCoordenada(v.lon)
  if (!latitudValida(lat)) return 'La latitud debe ser un número entre -90 y 90'
  if (!longitudValida(lon)) return 'La longitud debe ser un número entre -180 y 180'
  if (!Number.isInteger(v.radio) || v.radio < rango.min || v.radio > rango.max) {
    return `El radio debe estar entre ${rango.min} y ${rango.max} metros`
  }
  return { lat, lon, radio: v.radio }
}
