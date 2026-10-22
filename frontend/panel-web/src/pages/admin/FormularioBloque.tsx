import { useMemo, useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { SelectorZona, type ValorZona } from '../../components/SelectorZona'
import type { CirculoMapa } from '../../components/Mapa'
import { Aviso, Boton, Campo } from '../../components/ui'
import { api } from '../../lib/api'
import { distanciaMetros, formatoCoordenada, latitudValida, leerZona, longitudValida, parseCoordenada, RADIO_BLOQUE } from '../../lib/geo'
import type { Bloque, Sede } from './zonasTipos'

export default function FormularioBloque({ sede, bloque, otros, onCerrar, onGuardado }: {
  sede: Sede; bloque?: Bloque; otros: Bloque[]; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(bloque?.nombre ?? '')
  const [zona, setZona] = useState<ValorZona>({
    lat: bloque ? formatoCoordenada(bloque.latitud) : '',
    lon: bloque ? formatoCoordenada(bloque.longitud) : '',
    radio: bloque?.radio_metros ?? 50,
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const circuloSede: CirculoMapa = { lat: sede.latitud, lon: sede.longitud, radio: sede.radio_metros, tono: 'sede' }
  const contexto: CirculoMapa[] = useMemo(
    () => [circuloSede, ...otros.map((o): CirculoMapa => ({ lat: o.latitud, lon: o.longitud, radio: o.radio_metros, tono: o.activo ? 'bloque' : 'inactivo' }))],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- circuloSede se arma con `sede`
    [sede, otros],
  )

  // Avisos orientativos (no bloquean): el bloque debería caer dentro de la sede y no traslaparse.
  const lat = parseCoordenada(zona.lat)
  const lon = parseCoordenada(zona.lon)
  const avisos: string[] = []
  if (latitudValida(lat) && longitudValida(lon)) {
    const p = { lat, lon }
    const aSede = distanciaMetros(p, { lat: sede.latitud, lon: sede.longitud })
    if (aSede > sede.radio_metros) {
      avisos.push(`El centro del bloque queda a ${Math.round(aSede)} m del centro de la sede, fuera de su radio (${sede.radio_metros} m). Revisa el punto o amplía el radio de la sede.`)
    }
    for (const o of otros.filter((x) => x.activo)) {
      if (distanciaMetros(p, { lat: o.latitud, lon: o.longitud }) < zona.radio + o.radio_metros) {
        avisos.push(`Se traslapa con «${o.nombre}»: en la zona compartida no se podrá saber en cuál de los dos se marcó.`)
      }
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres')
    const z = leerZona(zona, RADIO_BLOQUE)
    if (typeof z === 'string') return setError(z)
    setError(null)
    setEnviando(true)
    const cuerpo = { nombre: nombre.trim(), latitud: z.lat, longitud: z.lon, radio_metros: z.radio }
    try {
      if (bloque) await api(`/bloques/${bloque.id}`, { method: 'PATCH', body: cuerpo })
      else await api('/bloques', { method: 'POST', body: { ...cuerpo, sede_id: sede.id } })
      onGuardado(bloque ? 'Bloque actualizado' : 'Bloque creado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el bloque')
      setEnviando(false)
    }
  }

  return (
    <Modal ancho="amplio" onCerrar={onCerrar} titulo={bloque ? 'Editar bloque' : 'Nuevo bloque'}
      subtitulo={`Edificio de la sede ${sede.nombre}. El radio ≈ la mitad de su dimensión más larga + 15 a 20 m de margen.`}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre del bloque" placeholder="Ej. Bloque M" required minLength={2} maxLength={100}
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <SelectorZona valor={zona} onCambio={setZona} rango={RADIO_BLOQUE} contexto={contexto}
          ajustarA={[circuloSede, ...(bloque ? [{ lat: bloque.latitud, lon: bloque.longitud, radio: bloque.radio_metros, tono: 'actual' as const }] : [])]} />
        {avisos.map((a) => <Aviso key={a} tipo="aviso">{a}</Aviso>)}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>{bloque ? 'Guardar cambios' : 'Crear bloque'}</Boton>
        </div>
      </form>
    </Modal>
  )
}
