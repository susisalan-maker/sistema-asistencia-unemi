import { Boton } from './ui'
import { Modal } from './Modal'

/** Ventana de confirmación para acciones que cambian el estado de algo (p. ej. desactivar). */
export function Confirmar({ titulo, texto, confirmar, onConfirmar, onCancelar }: {
  titulo: string; texto: string; confirmar: string; onConfirmar: () => void; onCancelar: () => void
}) {
  return (
    <Modal titulo={titulo} subtitulo={texto} onCerrar={onCancelar}>
      <div className="grid grid-cols-2 gap-3">
        <Boton variante="borde" onClick={onCancelar}>Cancelar</Boton>
        <Boton variante="marino" onClick={onConfirmar}>{confirmar}</Boton>
      </div>
    </Modal>
  )
}
