import { useEffect, useId, useRef, useState } from 'react'
import { buscarLugares, type Lugar } from '../lib/buscarLugares'

const MIN_CARACTERES = 3
const ESPERA_MS = 400 // se busca cuando la persona deja de escribir un momento

/** Caja de búsqueda con sugerencias: escribe "universidad" y elige el lugar para llevar el mapa hasta allí. */
export function BuscadorLugar({ onElegir }: { onElegir: (lugar: Lugar) => void }) {
  const idLista = useId()
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<Lugar[]>([])
  const [estado, setEstado] = useState<'reposo' | 'buscando' | 'listo' | 'error'>('reposo')
  const [abierto, setAbierto] = useState(false)
  const cancelar = useRef<AbortController | null>(null)

  useEffect(() => {
    cancelar.current?.abort()
    const consulta = texto.trim()
    if (consulta.length < MIN_CARACTERES) {
      // sin texto suficiente no hay nada que buscar: se limpia lo anterior
      setEstado('reposo'); setResultados([])
      return
    }
    const control = new AbortController()
    cancelar.current = control
    const temporizador = setTimeout(async () => {
      setEstado('buscando')
      try {
        const lugares = await buscarLugares(consulta, control.signal)
        if (control.signal.aborted) return
        setResultados(lugares); setEstado('listo'); setAbierto(true)
      } catch (e) {
        if (control.signal.aborted || (e instanceof DOMException && e.name === 'AbortError')) return
        setResultados([]); setEstado('error')
      }
    }, ESPERA_MS)
    return () => { clearTimeout(temporizador); control.abort() }
  }, [texto])

  function elegir(l: Lugar) {
    setAbierto(false)
    setTexto('')
    onElegir(l)
  }

  return (
    <div className="relative">
      <label htmlFor={`${idLista}-q`} className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Buscar lugar</label>
      <input id={`${idLista}-q`} role="combobox" aria-expanded={abierto && estado === 'listo'} aria-controls={idLista} aria-autocomplete="list"
        autoComplete="off" placeholder="Ej. Universidad Estatal de Milagro" value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onKeyDown={(e) => e.key === 'Escape' && abierto && (e.stopPropagation(), setAbierto(false))}
        className="mt-[7px] h-[48px] w-full rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino outline-none focus:border-marino focus:ring-2 focus:ring-celeste" />
      <div aria-live="polite" className="mt-1 min-h-4 text-xs font-semibold text-texto-suave">
        {estado === 'buscando' && 'Buscando…'}
        {estado === 'error' && 'No se pudo buscar ahora. Elige el punto en el mapa o escribe las coordenadas.'}
        {estado === 'listo' && resultados.length === 0 && 'Sin resultados en Ecuador. Prueba con otro nombre o elige el punto en el mapa.'}
      </div>
      {abierto && estado === 'listo' && resultados.length > 0 && (
        <ul id={idLista} role="listbox" aria-label="Lugares encontrados"
          className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-[13px] border border-borde bg-white py-1 shadow-[0_12px_30px_rgba(27,42,110,.14)]">
          {resultados.map((l, i) => (
            <li key={`${l.lat},${l.lon},${i}`} role="option" aria-selected={false}>
              <button type="button" onClick={() => elegir(l)} className="block w-full px-4 py-2.5 text-left hover:bg-lienzo">
                <span className="block text-sm font-extrabold text-marino">{l.nombre}</span>
                {l.detalle && <span className="block text-xs font-semibold text-texto-suave">{l.detalle}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
