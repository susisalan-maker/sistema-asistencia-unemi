import { lazy, Suspense } from 'react'

export interface CirculoMapa { lat: number; lon: number; radio: number; tono: 'sede' | 'bloque' | 'inactivo' | 'actual' }

export interface PropsMapa {
  /** Zona que se está editando (se dibuja resaltada). */
  actual?: { lat: number; lon: number; radio: number } | null
  /** Otras zonas de referencia (la sede, los demás bloques). */
  contexto?: CirculoMapa[]
  /** Qué encuadrar al abrir el mapa (una sola vez). */
  ajustarA: CirculoMapa[]
  /** Se llama al hacer clic en el mapa. Si no se pasa, el mapa es solo de lectura. */
  onElegir?: (lat: number, lon: number) => void
  alto?: number
}

// Leaflet pesa bastante: solo se descarga cuando se abre una pantalla con mapa.
const MapaLeaflet = lazy(() => import('./MapaLeaflet'))

export function Mapa(props: PropsMapa) {
  return (
    <Suspense fallback={
      <div role="status" style={{ height: props.alto ?? 300 }}
        className="grid w-full place-items-center rounded-[14px] border border-borde bg-lienzo text-sm font-semibold text-texto-suave">
        Cargando mapa…
      </div>}>
      <MapaLeaflet {...props} />
    </Suspense>
  )
}
