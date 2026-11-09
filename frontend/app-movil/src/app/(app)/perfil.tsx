import Constants from 'expo-constants'
import { useFocusEffect } from 'expo-router'
import { useCallback, type ReactNode } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton } from '../../components/ui'
import { Chip, PantallaPestana, Seccion, Tarjeta2 } from '../../components/pestanas'
import { textoDias } from '../../lib/marcacion'
import { useSincronizacion } from '../../lib/offline/SincronizacionContext'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { useEstadoHoy } from '../../lib/useEstadoHoy'
import { colores, fuentes } from '../../theme'

/** Pestaña Perfil: quién eres, tu jornada, el estado de tu celular y de tu rostro, y el cierre de sesión (con confirmación). */
export default function Perfil() {
  const { perfil, cerrarSesion } = useAuth()
  const { pendientes } = useSincronizacion()
  const { estado, recargar } = useEstadoHoy()
  const esAdmin = perfil?.rol === 'administrador'
  useFocusEffect(useCallback(() => { if (!esAdmin) void recargar() }, [esAdmin, recargar]))
  if (!perfil) return null

  const preguntarSalida = () => {
    const sinEnviar = pendientes.length > 0
      ? `\n\nTienes ${pendientes.length} ${pendientes.length === 1 ? 'marcación guardada' : 'marcaciones guardadas'} sin enviar. Conéctate a internet para que se envíen antes de salir.`
      : ''
    Alert.alert('¿Cerrar sesión?', `Tendrás que volver a ingresar con tu correo y contraseña.${sinEnviar}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void cerrarSesion() },
    ])
  }

  const version = Constants.expoConfig?.version
  return (
    <PantallaPestana titulo="Perfil" alRefrescar={esAdmin ? undefined : recargar}>
      <Tarjeta2 estilo={estilos.identidad}>
        <View style={estilos.avatar}><Text style={estilos.avatarTexto}>{iniciales(perfil.nombres, perfil.apellidos)}</Text></View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={estilos.nombre}>{nombreCompleto(perfil)}</Text>
          <Text style={estilos.correo}>{perfil.email}</Text>
          <View style={{ alignSelf: 'flex-start' }}><Chip texto={esAdmin ? 'Administrador' : 'Usuario'} tono="celeste" tamano="chico" /></View>
        </View>
      </Tarjeta2>
      {esAdmin && (
        <Aviso tipo="aviso">Tu cuenta es de Administrador. El panel de gestión está en la versión web; en la app solo se registra la asistencia del personal.</Aviso>
      )}

      {!esAdmin && (
        <>
          <Seccion texto="Mi jornada" />
          <View style={estilos.lista}>
            <Fila etiqueta="Horario" valor={estado?.jornada ? `${estado.jornada.inicio} – ${estado.jornada.fin}` : '—'} />
            <Fila etiqueta="Días" valor={estado?.dias_laborables ? textoDias(estado.dias_laborables) : '—'} sinBorde />
          </View>

          <Seccion texto="Mi celular y mi rostro" />
          <View style={estilos.lista}>
            <Fila etiqueta="Celular" detalle="Solo uno puede marcar por cuenta" derecha={estado ? <ChipCelular estado={estado.dispositivo} /> : null} />
            <Fila
              etiqueta="Rostro" detalle="Para verificar tu identidad al marcar" sinBorde
              derecha={estado ? <Chip texto={estado.rostro_registrado ? '✓ Registrado' : 'Falta registrarlo'} tono={estado.rostro_registrado ? 'ok' : 'aviso'} tamano="chico" /> : null}
            />
          </View>
          <Text style={estilos.nota}>Para cambiar de celular, Talento Humano debe reiniciar el vínculo.</Text>
        </>
      )}

      <Boton titulo="Cerrar sesión" variante="borde" onPress={preguntarSalida} />
      {version ? <Text style={estilos.version}>Versión {version}</Text> : null}
    </PantallaPestana>
  )
}

function ChipCelular({ estado }: { estado: 'sin_vincular' | 'este' | 'otro' }) {
  if (estado === 'este') return <Chip texto="✓ Vinculado" tono="ok" tamano="chico" />
  if (estado === 'otro') return <Chip texto="Es otro celular" tono="error" tamano="chico" />
  return <Chip texto="Sin vincular" tono="aviso" tamano="chico" />
}

function Fila({ etiqueta, valor, detalle, derecha, sinBorde }: { etiqueta: string; valor?: string; detalle?: string; derecha?: ReactNode; sinBorde?: boolean }) {
  return (
    <View style={[estilos.fila, !sinBorde && estilos.filaConBorde]}>
      <View style={{ flex: 1 }}>
        <Text style={valor !== undefined ? estilos.filaEtiqueta : estilos.filaTitulo}>{etiqueta}</Text>
        {detalle ? <Text style={estilos.filaDetalle}>{detalle}</Text> : null}
      </View>
      {valor !== undefined ? <Text style={estilos.filaValor}>{valor}</Text> : null}
      {derecha}
    </View>
  )
}

const estilos = StyleSheet.create({
  identidad: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.extranegrita, fontSize: 21, color: colores.marino },
  nombre: { fontFamily: fuentes.extranegrita, fontSize: 18, color: colores.marino },
  correo: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
  lista: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8 },
  filaConBorde: { borderBottomWidth: 1, borderBottomColor: colores.lienzo },
  filaEtiqueta: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave },
  filaTitulo: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.marino },
  filaDetalle: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave },
  filaValor: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.marino, textAlign: 'right' },
  nota: { fontFamily: fuentes.seminegrita, fontSize: 12, lineHeight: 17, color: colores.textoSuave, paddingHorizontal: 4 },
  version: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, textAlign: 'center' },
})
