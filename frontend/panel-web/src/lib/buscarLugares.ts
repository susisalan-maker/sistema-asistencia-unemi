// Búsqueda de lugares por nombre (geocodificación) con Photon, un buscador sobre datos de
// OpenStreetMap: gratis, sin API key y pensado para autocompletar mientras se escribe.
// Solo se envía el texto buscado, nunca datos de personas. El servicio público es de uso
// razonable (sin garantías): si falla, la sede igual se puede ubicar con el mapa o las coordenadas.

export interface Lugar { nombre: string; detalle: string; lat: number; lon: number }

const URL_BUSQUEDA = 'https://photon.komoot.io/api/'
/** Recuadro del Ecuador continental: minLon,minLat,maxLon,maxLat. */
const ECUADOR = '-81.1,-5.1,-75.1,1.5'

interface RespuestaPhoton {
  features?: {
    geometry?: { coordinates?: [number, number] }
    properties?: {
      name?: string; street?: string; housenumber?: string
      district?: string; city?: string; county?: string; state?: string
      country?: string; countrycode?: string
    }
  }[]
}

export function interpretarRespuesta(r: RespuestaPhoton): Lugar[] {
  const lugares: Lugar[] = []
  for (const f of r.features ?? []) {
    const p = f.properties ?? {}
    const c = f.geometry?.coordinates
    if (!c || c.length < 2 || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue
    if (p.countrycode && p.countrycode.toUpperCase() !== 'EC') continue
    const nombre = p.name ?? [p.street, p.housenumber].filter(Boolean).join(' ')
    if (!nombre) continue
    const detalle = [...new Set([p.district, p.city ?? p.county, p.state].filter((x): x is string => Boolean(x)))].join(', ')
    lugares.push({ nombre, detalle, lat: c[1], lon: c[0] })
  }
  return lugares
}

export async function buscarLugares(texto: string, senal?: AbortSignal): Promise<Lugar[]> {
  const url = new URL(URL_BUSQUEDA)
  url.searchParams.set('q', texto.trim())
  url.searchParams.set('limit', '6')
  url.searchParams.set('bbox', ECUADOR)
  const resp = await fetch(url, { signal: senal })
  if (!resp.ok) throw new Error(`La búsqueda respondió ${resp.status}`)
  return interpretarRespuesta((await resp.json()) as RespuestaPhoton)
}
