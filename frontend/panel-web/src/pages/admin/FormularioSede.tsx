import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { SelectorZona, type ValorZona } from '../../components/SelectorZona'
import { Aviso, Boton, Campo } from '../../components/ui'
import { api } from '../../lib/api'
import { formatoCoordenada, leerZona, RADIO_SEDE } from '../../lib/geo'
import type { Sede } from './zonasTipos'

export default function FormularioSede({ sede, onCerrar, onGuardado }: {
  sede?: Sede; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const [nombre, setNombre] = useState(sede?.nombre ?? '')
  const [zona, setZona] = useState<ValorZona>({
    lat: sede ? formatoCoordenada(sede.latitud) : '',
    lon: sede ? formatoCoordenada(sede.longitud) : '',
    radio: sede?.radio_metros ?? 300,
  })
  const [permiteFuera, setPermiteFuera] = useState(sede?.permite_fuera_geocerca ?? false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres')
    const z = leerZona(zona, RADIO_SEDE)
    if (typeof z === 'string') return setError(z)
    setError(null)
    setEnviando(true)
    const cuerpo = { nombre: nombre.trim(), latitud: z.lat, longitud: z.lon, radio_metros: z.radio, permite_fuera_geocerca: permiteFuera }
    try {
      if (sede) await api(`/sedes/${sede.id}`, { method: 'PATCH', body: cuerpo })
      else await api('/sedes', { method: 'POST', body: cuerpo })
      onGuardado(sede ? 'Sede actualizada' : 'Sede creada')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la sede')
      setEnviando(false)
    }
  }

  return (
    <Modal ancho="amplio" onCerrar={onCerrar} titulo={sede ? 'Editar sede' : 'Nueva sede'}
      subtitulo="Una sede es un campus o extensión. Su radio debe cubrir todo el campus.">
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Nombre de la sede" placeholder="Ej. Matriz Milagro" required minLength={2} maxLength={100}
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <SelectorZona valor={zona} onCambio={setZona} rango={RADIO_SEDE}
          onLugar={(l) => setNombre((actual) => actual.trim() ? actual : l.nombre)}
          ajustarA={sede ? [{ lat: sede.latitud, lon: sede.longitud, radio: sede.radio_metros, tono: 'actual' }] : []} />
        <label className="flex items-start gap-2.5 text-sm font-semibold text-texto">
          <input type="checkbox" checked={permiteFuera} onChange={(e) => setPermiteFuera(e.target.checked)} className="mt-1 size-4 accent-marino" />
          <span>
            Permite marcar fuera de la zona
            <span className="block text-xs font-semibold text-texto-suave">
              Se guarda desde ya; su efecto exacto se define al construir el módulo de marcación.
            </span>
          </span>
        </label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>{sede ? 'Guardar cambios' : 'Crear sede'}</Boton>
        </div>
      </form>
    </Modal>
  )
}
