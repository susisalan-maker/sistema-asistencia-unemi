import { useState, type FormEvent } from 'react'
import { CamposHorario, type ValorHorario } from '../../components/CamposHorario'
import { Modal } from '../../components/Modal'
import { Aviso, Boton } from '../../components/ui'
import { api } from '../../lib/api'
import { horaCorta, validarHorario } from '../../lib/horario'
import { nombreCompleto } from '../../lib/texto'
import type { FilaUsuario } from './usuariosTipos'

export default function EditarHorario({ usuario, onCerrar, onGuardado }: {
  usuario: FilaUsuario; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const [valor, setValor] = useState<ValorHorario>({
    inicio: horaCorta(usuario.jornada_inicio), fin: horaCorta(usuario.jornada_fin), dias: usuario.dias_laborables,
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const problema = validarHorario(valor.inicio, valor.fin, valor.dias)
    if (problema) return setError(problema)
    setError(null)
    setEnviando(true)
    try {
      await api(`/usuarios/${usuario.id}/horario`, {
        method: 'PATCH',
        body: { jornada_inicio: valor.inicio, jornada_fin: valor.fin, dias_laborables: valor.dias },
      })
      onGuardado(`Horario de ${nombreCompleto(usuario)} actualizado`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el horario')
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Editar horario" subtitulo={`${nombreCompleto(usuario)} · rige para las marcaciones desde ahora`} onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <CamposHorario valor={valor} onCambio={setValor} />
        <Aviso tipo="aviso">
          Los feriados se administran en «Feriados». Los turnos rotativos, las vacaciones y los permisos todavía no se manejan aquí.
        </Aviso>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>Guardar horario</Boton>
        </div>
      </form>
    </Modal>
  )
}
