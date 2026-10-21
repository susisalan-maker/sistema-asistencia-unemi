import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Aviso, Boton, Campo } from '../../components/ui'
import { api } from '../../lib/api'
import { validarRangoFeriado } from '../../lib/horario'
import type { Feriado } from './feriadosTipos'

export default function FormularioFeriado({ feriado, onCerrar, onGuardado }: {
  feriado?: Feriado; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const [desde, setDesde] = useState(feriado?.fecha_inicio ?? '')
  // Un feriado de un solo día se muestra con «Hasta» vacío.
  const [hasta, setHasta] = useState(feriado && feriado.fecha_fin !== feriado.fecha_inicio ? feriado.fecha_fin : '')
  const [nombre, setNombre] = useState(feriado?.nombre ?? '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const problema = validarRangoFeriado(desde, hasta)
    if (problema) return setError(problema)
    if (nombre.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres')
    setError(null)
    setEnviando(true)
    const cuerpo = { fecha_inicio: desde, fecha_fin: hasta || desde, nombre: nombre.trim() }
    try {
      if (feriado) await api(`/feriados/${feriado.id}`, { method: 'PATCH', body: cuerpo })
      else await api('/feriados', { method: 'POST', body: cuerpo })
      onGuardado(feriado ? 'Feriado actualizado' : 'Feriado creado')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el feriado')
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={feriado ? 'Editar feriado' : 'Nuevo feriado'} onCerrar={onCerrar}
      subtitulo="Marcar asistencia en estas fechas generará una anomalía de «día no laborable» para todos. Si dura varios días seguidos, indica también «Hasta»; si es un solo día, déjalo vacío.">
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Desde" type="date" required value={desde} onChange={(e) => setDesde(e.target.value)} />
        <Campo etiqueta="Hasta (opcional)" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        <Campo etiqueta="Nombre" placeholder="Ej. Día de Difuntos" required minLength={2} maxLength={100}
          value={nombre} onChange={(e) => setNombre(e.target.value)} />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>{feriado ? 'Guardar cambios' : 'Crear feriado'}</Boton>
        </div>
      </form>
    </Modal>
  )
}
