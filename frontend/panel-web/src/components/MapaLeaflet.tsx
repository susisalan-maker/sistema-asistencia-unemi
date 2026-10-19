// Mapa con OpenStreetMap (Leaflet): gratis y sin API key. Se carga bajo demanda (ver Mapa.tsx).
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { CirculoMapa, PropsMapa } from './Mapa'

const ESTILO: Record<CirculoMapa['tono'], L.PathOptions> = {
  sede: { color: '#1b2a6e', weight: 2, fillColor: '#1b2a6e', fillOpacity: 0.07 },
  bloque: { color: '#5566a3', weight: 2, fillColor: '#5566a3', fillOpacity: 0.18 },
  inactivo: { color: '#8a93a5', weight: 1.5, dashArray: '5 5', fillColor: '#8a93a5', fillOpacity: 0.06 },
  actual: { color: '#f5a623', weight: 3, fillColor: '#f5a623', fillOpacity: 0.3 },
}

// toBounds(lado en metros) calcula el recuadro sin necesitar que el círculo esté ya dibujado en el mapa.
const limites = (cs: CirculoMapa[]) =>
  cs.reduce((b, c) => b.extend(L.latLng(c.lat, c.lon).toBounds(c.radio * 2)), L.latLngBounds([]))

/** Encuadra una sola vez al abrir; después sigue al punto actual si se sale de la vista o el mapa está muy alejado. */
function Vista({ ajustarA, actual }: Pick<PropsMapa, 'ajustarA' | 'actual'>) {
  const map = useMap()
  useEffect(() => {
    if (ajustarA.length) map.fitBounds(limites(ajustarA), { padding: [28, 28], maxZoom: 18 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])
  useEffect(() => {
    // Si el punto queda fuera de la vista, o el mapa está muy alejado (p. ej. tras buscar un lugar), se acerca a él.
    if (actual && (!map.getBounds().contains([actual.lat, actual.lon]) || map.getZoom() < 14)) {
      map.setView([actual.lat, actual.lon], Math.max(map.getZoom(), 16))
    }
  }, [actual?.lat, actual?.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function Clic({ onElegir }: Pick<PropsMapa, 'onElegir'>) {
  useMapEvents({
    click(e) {
      const p = e.latlng.wrap()
      onElegir?.(p.lat, p.lng)
    },
  })
  return null
}

export default function MapaLeaflet({ actual, contexto = [], ajustarA, onElegir, alto = 300 }: PropsMapa) {
  return (
    <MapContainer center={[-1.8, -78.2]} zoom={6} style={{ height: alto }} className="isolate w-full rounded-[14px] border border-borde"
      aria-label="Mapa" scrollWheelZoom>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
      {contexto.map((c, i) => (
        <Circle key={`${c.tono}-${i}-${c.lat}-${c.lon}`} center={[c.lat, c.lon]} radius={c.radio} pathOptions={ESTILO[c.tono]} />
      ))}
      {actual && (
        <>
          <Circle center={[actual.lat, actual.lon]} radius={actual.radio} pathOptions={ESTILO.actual} />
          <CircleMarker center={[actual.lat, actual.lon]} radius={5} pathOptions={{ color: '#20180a', fillColor: '#f5a623', fillOpacity: 1, weight: 2 }} />
        </>
      )}
      <Vista ajustarA={ajustarA} actual={actual} />
      <Clic onElegir={onElegir} />
    </MapContainer>
  )
}
