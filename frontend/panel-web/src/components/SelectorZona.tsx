import { useId } from 'react'
import { formatoCoordenada, latitudValida, longitudValida, parseCoordenada } from '../lib/geo'
import type { Lugar } from '../lib/buscarLugares'
import { BuscadorLugar } from './BuscadorLugar'
import { Campo } from './ui'
import { Mapa, type CirculoMapa } from './Mapa'

export interface ValorZona { lat: string; lon: string; radio: number }

/**
 * Elige un punto y un radio: se puede hacer clic en el mapa o escribir las coordenadas
 * (las dos formas se sincronizan) y ajustar el radio con el control deslizante.
 */
export function SelectorZona({ valor, onCambio, onLugar, rango, contexto = [], ajustarA }: {
  valor: ValorZona
  onCambio: (v: ValorZona) => void
  /** Se llama al elegir un resultado del buscador (por si el formulario quiere usar su nombre). */
  onLugar?: (lugar: Lugar) => void
  rango: { min: number; max: number }
  contexto?: CirculoMapa[]
  ajustarA: CirculoMapa[]
}) {
  const idRadio = useId()
  const lat = parseCoordenada(valor.lat)
  const lon = parseCoordenada(valor.lon)
  const hayPunto = latitudValida(lat) && longitudValida(lon)

  return (
    <div className="space-y-3">
      <BuscadorLugar onElegir={(l) => { onCambio({ ...valor, lat: formatoCoordenada(l.lat), lon: formatoCoordenada(l.lon) }); onLugar?.(l) }} />
      <Mapa
        alto={290}
        ajustarA={ajustarA}
        contexto={contexto}
        actual={hayPunto ? { lat, lon, radio: valor.radio } : null}
        onElegir={(la, lo) => onCambio({ ...valor, lat: formatoCoordenada(la), lon: formatoCoordenada(lo) })}
      />
      <p className="text-xs font-semibold text-texto-suave">Busca un lugar, haz clic en el mapa o escribe las coordenadas: las tres formas se sincronizan.</p>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Latitud" inputMode="decimal" placeholder="-2.140000" value={valor.lat}
          aria-invalid={valor.lat !== '' && !latitudValida(lat)}
          onChange={(e) => onCambio({ ...valor, lat: e.target.value })} />
        <Campo etiqueta="Longitud" inputMode="decimal" placeholder="-79.600000" value={valor.lon}
          aria-invalid={valor.lon !== '' && !longitudValida(lon)}
          onChange={(e) => onCambio({ ...valor, lon: e.target.value })} />
      </div>
      <div className="flex flex-col gap-[7px]">
        <label htmlFor={idRadio} className="flex justify-between text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">
          <span>Radio (metros)</span>
          <output htmlFor={idRadio} className="text-marino">{valor.radio} m</output>
        </label>
        <input id={idRadio} type="range" min={rango.min} max={rango.max} step={5} value={valor.radio}
          onChange={(e) => onCambio({ ...valor, radio: Number(e.target.value) })}
          className="accent-marino" />
        <div className="flex justify-between text-[11px] font-semibold text-etiqueta"><span>{rango.min} m</span><span>{rango.max} m</span></div>
      </div>
    </div>
  )
}
