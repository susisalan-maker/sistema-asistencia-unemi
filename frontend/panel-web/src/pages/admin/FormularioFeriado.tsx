import { useState, type FormEvent } from 'react'
import { Modal } from '../../components/Modal'
import { Aviso, Boton, Campo } from '../../components/ui'
import { api } from '../../lib/api'
import type { Feriado } from './feriadosTipos'

export default function FormularioFeriado({ feriado, onCerrar, onGuardado }: {
  feriado?: Feriado; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const [fecha, setFecha] = useState(feriado?.fecha ?? '')
  const [hasta, setHasta] = useState('')
  const [nombre, setNombre] = useState(feriado?.nombre ?? '')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (!fecha) return setError('Elige la fecha del feriado')
    if (!feriado && hasta && hasta < fecha) return setError('La fecha final no puede ser anterior a la inicial')
    if (nombre.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres')
    setError(null)
    setEnviando(true)
    const cuerpo = { fecha, nombre: nombre.trim() }
    try {
      if (feriado) {
        await api(`/feriados/${feriado.id}`, { method: 'PATCH', body: cuerpo })
        onGuardado('Feriado actualizado')
      } else if (hasta && hasta !== fecha) {
        const r = await api<{ creados: string[]; omitidos: string[] }>('/feriados', { method: 'POST', body: { ...cuerpo, hasta } })
        const omitidos = r?.omitidos?.length ?? 0
        onGuardado(
          `Feriado creado en ${r?.creados?.length ?? 0} días` +
          (omitidos ? ` (${omitidos} ya tenían feriado y se dejaron como estaban)` : ''),
        )
      } else {
        await api('/feriados', { method: 'POST', body: cuerpo })
        onGuardado('Feriado creado')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el feriado')
      setEnviando(false)
    }
  }

  return (
    <Modal titulo={feriado ? 'Editar feriado' : 'Nuevo feriado'} onCerrar={onCerrar}
      subtitulo={'Marcar asistencia en esta fecha generará una anomalía de «día no laborable» para todos.' +
        (feriado ? '' : ' Si dura varios días seguidos, indica también «Hasta»: se crea un feriado por cada día.')}>
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} />
        {!feriado && (
          <Campo etiqueta="Hasta (opcional)" type="date" value={hasta}
            onChange={(e) => setHasta(e.target.value)} />
        )}
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
