import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Boton, Campo, TarjetaAcceso } from '../components/ui'
import { supabase } from '../lib/supabase'

export default function RecuperarContrasena() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    })
    setEnviando(false)
    setEnviado(true) // mensaje neutro: no revela si el correo existe
  }

  return (
    <TarjetaAcceso titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace para crear una nueva.">
      {enviado ? (
        <Aviso tipo="ok">Si el correo está registrado, recibirás un enlace en unos minutos. Revisa también el spam.</Aviso>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <Campo etiqueta="Correo institucional" type="email" autoComplete="username" required value={email}
            onChange={(e) => setEmail(e.target.value)} />
          <Boton type="submit" cargando={enviando}>Enviar enlace</Boton>
        </form>
      )}
      <Link to="/login" className="mt-4 block text-center text-sm text-blue-700 hover:underline">Volver</Link>
    </TarjetaAcceso>
  )
}
