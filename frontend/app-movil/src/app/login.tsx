import { useRouter } from 'expo-router'
import { useState } from 'react'
import { Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { Aviso, Boton, Campo, Enlace, Logo, Pantalla, Tarjeta } from '../components/ui'
import { configuracionCompleta } from '../lib/supabase'
import { colores, fuentes } from '../theme'

export default function Login() {
  const router = useRouter()
  const { session, perfil, iniciarSesion, cerrarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    if (!email.trim() || !contrasena) return setError('Escribe tu correo y tu contraseña')
    setError(null)
    setEnviando(true)
    const mensaje = await iniciarSesion(email, contrasena)
    setEnviando(false)
    if (mensaje) setError(mensaje)
  }

  return (
    <Pantalla>
      <Logo />
      <Tarjeta titulo="Iniciar sesión" subtitulo="Sistema de control de asistencia">
        {!configuracionCompleta && (
          <Aviso tipo="error">Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver .env.example).</Aviso>
        )}
        {session && perfil && !perfil.activo && (
          <>
            <Aviso tipo="error">Tu cuenta está desactivada. Comunícate con Talento Humano.</Aviso>
            <Enlace titulo="Salir" onPress={cerrarSesion} />
          </>
        )}
        {session && !perfil && (
          <>
            <Aviso tipo="error">Tu cuenta no tiene un perfil asignado. Comunícate con Talento Humano.</Aviso>
            <Enlace titulo="Salir" onPress={cerrarSesion} />
          </>
        )}
        <Campo etiqueta="Correo institucional" keyboardType="email-address" autoComplete="email" textContentType="username"
          value={email} onChangeText={setEmail} />
        <Campo etiqueta="Contraseña" secureTextEntry autoComplete="current-password" textContentType="password"
          value={contrasena} onChangeText={setContrasena} onSubmitEditing={enviar} />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton titulo="Entrar" cargando={enviando} onPress={enviar} />
        <Enlace titulo="¿Olvidaste tu contraseña?" onPress={() => router.push('/recuperar-contrasena')} />
      </Tarjeta>
      <View>
        <Text style={{ fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, textAlign: 'center' }}>
          No hay registro público: Talento Humano te envía una invitación por correo.
        </Text>
      </View>
    </Pantalla>
  )
}
