import EnlaceContrasena from './EnlaceContrasena'

export default function AceptarInvitacion() {
  return (
    <EnlaceContrasena
      titulo="Crea tu contraseña"
      subtitulo="Te invitaron al sistema de asistencia. Elige una contraseña para tu cuenta."
      textoBoton="Guardar contraseña"
      mensajeFinal="Tu contraseña fue creada. Ya puedes iniciar sesión en la app móvil o en la web."
    />
  )
}
