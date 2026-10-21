import { useState } from 'react'
import { Link } from 'react-router-dom'
import FormularioContrasena from '../components/FormularioContrasena'
import { Aviso, Cargando, TarjetaAcceso } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useEnlaceCorreo } from '../lib/useEnlaceCorreo'

/** Pantalla común a «aceptar invitación» y «restablecer contraseña»: el usuario llega desde un correo. */
export default function EnlaceContrasena({
  titulo, subtitulo, textoBoton, mensajeFinal,
}: { titulo: string; subtitulo: string; textoBoton: string; mensajeFinal: string }) {
  const estado = useEnlaceCorreo()
  const [hecho, setHecho] = useState(false)

  if (estado === 'cargando') return <Cargando />

  if (hecho) {
    return (
      <TarjetaAcceso titulo="¡Listo!">
        <Aviso tipo="ok">{mensajeFinal}</Aviso>
        <Link to="/login" className="mt-4 block text-center text-sm font-bold text-marino hover:underline">Ir a iniciar sesión</Link>
      </TarjetaAcceso>
    )
  }

  if (estado === 'invalido') {
    return (
      <TarjetaAcceso titulo="Enlace no válido">
        <Aviso tipo="error">
          Este enlace venció o ya fue usado. Pide a Talento Humano que te reenvíe la invitación, o usa «¿Olvidaste tu contraseña?».
        </Aviso>
        <Link to="/login" className="mt-4 block text-center text-sm font-bold text-marino hover:underline">Volver al inicio de sesión</Link>
      </TarjetaAcceso>
    )
  }

  return (
    <TarjetaAcceso titulo={titulo} subtitulo={subtitulo}>
      <FormularioContrasena
        textoBoton={textoBoton}
        onGuardar={async (contrasena) => {
          const { error } = await supabase.auth.updateUser({ password: contrasena })
          if (error) {
            return error.message.toLowerCase().includes('different')
              ? 'La nueva contraseña debe ser distinta de la anterior'
              : 'No se pudo guardar la contraseña. Intenta de nuevo.'
          }
          await supabase.auth.signOut() // vuelve a iniciar sesión con su nueva contraseña
          setHecho(true)
          return null
        }}
      />
    </TarjetaAcceso>
  )
}
