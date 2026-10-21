import EnlaceContrasena from './EnlaceContrasena'

export default function RestablecerContrasena() {
  return (
    <EnlaceContrasena
      titulo="Nueva contraseña"
      subtitulo="Escribe la nueva contraseña de tu cuenta."
      textoBoton="Cambiar contraseña"
      mensajeFinal="Tu contraseña fue cambiada. Inicia sesión con la nueva."
    />
  )
}
