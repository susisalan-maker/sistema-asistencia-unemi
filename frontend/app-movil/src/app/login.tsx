import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'
import { Aviso, Boton, Campo, Enlace, Pantalla } from '../components/ui'
import { idDispositivo } from '../lib/dispositivo'
import { avisoDeSalida, olvidarAvisoDeSalida, TEXTO_SALIDA } from '../lib/sesion'
import { configuracionCompleta } from '../lib/supabase'
import { vincularEsteDispositivo } from '../lib/useEstadoHoy'
import { colores, fuentes } from '../theme'

/** Ingreso a la app (M1 del mockup). «Ingresar y vincular» inicia sesión y deja este celular como el de marcación. */
export default function Login() {
  const router = useRouter()
  const { session, perfil, iniciarSesion, cerrarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [verContrasena, setVerContrasena] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [idCorto, setIdCorto] = useState('')
  // Si llegó aquí porque la sesión terminó sola (o desactivaron la cuenta), se le explica. Se lee una vez y se olvida.
  const [motivoSalida] = useState(avisoDeSalida)
  useEffect(() => { olvidarAvisoDeSalida() }, [])

  useEffect(() => {
    let vivo = true
    idDispositivo().then((id) => { if (vivo) setIdCorto(id.slice(-4)) }).catch(() => {})
    return () => { vivo = false }
  }, [])

  async function enviar() {
    if (!email.trim() || !contrasena) return setError('Escribe tu correo y tu contraseña')
    setError(null)
    setEnviando(true)
    const mensaje = await iniciarSesion(email, contrasena)
    if (mensaje) {
      setError(mensaje)
    } else {
      // Se vincula al entrar. Si no se puede (otro celular ya vinculado, cuenta de administrador…), no importa:
      // el inicio explica el estado y ofrece vincular de nuevo cuando corresponde.
      await vincularEsteDispositivo()
    }
    setEnviando(false)
  }

  const plataforma = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'Navegador'
  return (
    <Pantalla blanca>
      <View style={estilos.cabecera}>
        <View style={estilos.logo}><Text style={estilos.logoSiglas}>UA</Text></View>
        <Text accessibilityRole="header" style={estilos.titulo}>Control de asistencia</Text>
        <Text style={estilos.subtitulo}>Ingresa con tu correo institucional</Text>
      </View>

      <View style={{ gap: 16 }}>
        {!configuracionCompleta && (
          <Aviso tipo="error">Falta configurar EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ver .env.example).</Aviso>
        )}
        {motivoSalida && !session && <Aviso tipo="aviso">{TEXTO_SALIDA[motivoSalida]}</Aviso>}
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
        <Campo
          etiqueta="Contraseña" secureTextEntry={!verContrasena} autoComplete="current-password" textContentType="password"
          value={contrasena} onChangeText={setContrasena} onSubmitEditing={enviar}
          derecha={
            <Pressable accessibilityRole="button" accessibilityLabel={verContrasena ? 'Ocultar contraseña' : 'Ver contraseña'} onPress={() => setVerContrasena((v) => !v)} hitSlop={10}>
              <Text style={estilos.ver}>{verContrasena ? 'Ocultar' : 'Ver'}</Text>
            </Pressable>
          }
        />

        <View style={estilos.dispositivo}>
          <View style={estilos.dispositivoIcono}><Text style={estilos.dispositivoIconoTexto}>▯</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={estilos.dispositivoTitulo}>Este dispositivo</Text>
            <Text style={estilos.dispositivoDetalle}>{plataforma}{idCorto ? ` · ID …${idCorto}` : ''}</Text>
            <Text style={estilos.dispositivoNota}>Se vinculará a tu cuenta como dispositivo único de marcación.</Text>
          </View>
        </View>

        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton titulo="Ingresar y vincular" cargando={enviando} onPress={enviar} />
        <Enlace titulo="¿Olvidaste tu contraseña?" onPress={() => router.push('/recuperar-contrasena')} />
      </View>

      <Text style={estilos.pie}>
        No hay registro público: Talento Humano te envía una invitación por correo. Solo puedes tener un celular vinculado; para cambiarlo, Talento Humano debe reiniciarlo.
      </Text>
    </Pantalla>
  )
}

const estilos = StyleSheet.create({
  cabecera: { alignItems: 'center', gap: 6, marginTop: 12 },
  logo: { width: 64, height: 64, borderRadius: 32, backgroundColor: colores.ambar, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  logoSiglas: { fontFamily: fuentes.extranegrita, fontSize: 22, color: colores.ambarTinta },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 28, color: colores.marino, letterSpacing: -0.5 },
  subtitulo: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave },
  ver: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.marino },
  dispositivo: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: colores.lienzo, borderRadius: 16, padding: 14 },
  dispositivoIcono: { width: 38, height: 38, borderRadius: 12, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  dispositivoIconoTexto: { fontFamily: fuentes.extranegrita, fontSize: 18, color: colores.marino },
  dispositivoTitulo: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.marino },
  dispositivoDetalle: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
  dispositivoNota: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta, marginTop: 4 },
  pie: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, textAlign: 'center', lineHeight: 18 },
})
