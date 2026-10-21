import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Aviso, Boton, Campo, Enlace, Logo, Pantalla, Tarjeta } from '../components/ui'
import { mensajeDeError } from '../lib/errores'
import { supabase, URL_PANEL_WEB } from '../lib/supabase'

export default function RecuperarContrasena() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (!email.trim()) return setError('Escribe tu correo institucional')
    setEnviando(true)
    setError(null)
    // El enlace del correo abre el panel web, donde se crea la nueva contraseña.
    const { error: fallo } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${URL_PANEL_WEB}/restablecer-contrasena`,
    })
    setEnviando(false)
    if (fallo) return setError(mensajeDeError(fallo))
    setEnviado(true) // mensaje neutro: Supabase responde igual aunque el correo no exista
  }

  return (
    <Pantalla>
      <Logo />
      <Tarjeta titulo="Recuperar contraseña" subtitulo="Te enviaremos un enlace para crear una nueva.">
        {enviado ? (
          <Aviso tipo="ok">Si el correo está registrado, recibirás un enlace en unos minutos. Revisa también el spam.</Aviso>
        ) : (
          <>
            <Campo etiqueta="Correo institucional" keyboardType="email-address" autoComplete="email"
              value={email} onChangeText={setEmail} onSubmitEditing={enviar} />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton titulo="Enviar enlace" cargando={enviando} onPress={enviar} />
          </>
        )}
        <Enlace titulo="Volver" onPress={() => router.back()} />
      </Tarjeta>
    </Pantalla>
  )
}
