import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton, Logo, Pantalla } from '../../components/ui'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { colores, fuentes } from '../../theme'

export default function Inicio() {
  const { perfil, cerrarSesion } = useAuth()
  if (!perfil) return null
  const esAdmin = perfil.rol === 'administrador'

  return (
    <Pantalla>
      <Logo />
      <View style={estilos.tarjeta}>
        <View style={estilos.avatar}><Text style={estilos.avatarTexto}>{iniciales(perfil.nombres, perfil.apellidos)}</Text></View>
        <Text style={estilos.saludo}>Hola, {perfil.nombres}</Text>
        <Text style={estilos.nombre}>{nombreCompleto(perfil)}</Text>
        <View style={estilos.chip}><Text style={estilos.chipTexto}>{esAdmin ? 'Administrador' : 'Usuario'}</Text></View>
      </View>
      {esAdmin ? (
        <Aviso tipo="aviso">Tu cuenta es de Administrador. El panel de gestión está en la versión web; en la app solo se registra la asistencia del personal.</Aviso>
      ) : (
        <Aviso tipo="aviso">Próximamente: aquí podrás vincular tu dispositivo, registrar tu rostro y marcar tu asistencia.</Aviso>
      )}
      <Boton titulo="Cerrar sesión" variante="borde" onPress={cerrarSesion} />
    </Pantalla>
  )
}

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.bordeSuave, padding: 24, alignItems: 'center', gap: 6,
  },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  avatarTexto: { fontFamily: fuentes.extranegrita, fontSize: 22, color: colores.marino },
  saludo: { fontFamily: fuentes.extranegrita, fontSize: 24, color: colores.marino },
  nombre: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave },
  chip: { marginTop: 6, backgroundColor: colores.celeste, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  chipTexto: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.marino },
})
