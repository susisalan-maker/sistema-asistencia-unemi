import { useState, type FormEvent } from 'react'
import { validarContrasena } from '../lib/password'
import { Aviso, Boton, Campo } from './ui'

/** Formulario de «nueva contraseña» compartido por la invitación y el restablecimiento. */
export default function FormularioContrasena({
  textoBoton,
  onGuardar,
}: {
  textoBoton: string
  /** Devuelve un mensaje de error, o null si salió bien. */
  onGuardar: (contrasena: string) => Promise<string | null>
}) {
  const [contrasena, setContrasena] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const problema = validarContrasena(contrasena, confirmacion)
    if (problema) return setError(problema)
    setError(null)
    setEnviando(true)
    const resultado = await onGuardar(contrasena)
    setEnviando(false)
    if (resultado) setError(resultado)
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Nueva contraseña" type="password" autoComplete="new-password" value={contrasena}
        onChange={(e) => setContrasena(e.target.value)} />
      <Campo etiqueta="Confirmar contraseña" type="password" autoComplete="new-password" value={confirmacion}
        onChange={(e) => setConfirmacion(e.target.value)} />
      <p className="text-xs font-semibold text-texto-suave">Mínimo 8 caracteres, con letras y números.</p>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <Boton type="submit" cargando={enviando}>{textoBoton}</Boton>
    </form>
  )
}
