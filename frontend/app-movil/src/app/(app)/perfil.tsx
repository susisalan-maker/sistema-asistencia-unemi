import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton } from '../../components/ui'
import { Chip, PantallaPestana, Tarjeta2 } from '../../components/pestanas'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { colores, fuentes } from '../../theme'

/** Pestaña Perfil. El mockup no la dibuja: se conserva la tarjeta de perfil y el cierre de sesión que ya tenía la app. */
export default function Perfil() {
  const { perfil, cerrarSesion } = useAuth()
  if (!perfil) return null
  const esAdmin = perfil.rol === 'administrador'
  return (
    <PantallaPestana titulo="Perfil">
      <Tarjeta2 estilo={{ alignItems: 'center', gap: 6 }}>
        <View style={estilos.avatar}><Text style={estilos.avatarTexto}>{iniciales(perfil.nombres, perfil.apellidos)}</Text></View>
        <Text style={estilos.nombre}>{nombreCompleto(perfil)}</Text>
        <Text style={estilos.correo}>{perfil.email}</Text>
        <Chip texto={esAdmin ? 'Administrador' : 'Usuario'} tono="celeste" />
      </Tarjeta2>
      {esAdmin && (
        <Aviso tipo="aviso">Tu cuenta es de Administrador. El panel de gestión está en la versión web; en la app solo se registra la asistencia del personal.</Aviso>
      )}
      <Boton titulo="Cerrar sesión" variante="borde" onPress={cerrarSesion} />
    </PantallaPestana>
  )
}

const estilos = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarTexto: { fontFamily: fuentes.extranegrita, fontSize: 22, color: colores.marino },
  nombre: { fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.marino, textAlign: 'center' },
  correo: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave, marginBottom: 4 },
})
