import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton, Logo, Pantalla } from '../../components/ui'
import { useAnomaliasPendientes } from '../../lib/useAnomaliasPendientes'
import { diaLargo, horaLocal, TIPOS, verboDeTipo } from '../../lib/marcacion'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { useEstadoHoy, vincularEsteDispositivo } from '../../lib/useEstadoHoy'
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
        <JornadaDeHoy />
      )}
      <Boton titulo="Cerrar sesión" variante="borde" onPress={cerrarSesion} />
    </Pantalla>
  )
}

function JornadaDeHoy() {
  const router = useRouter()
  const { estado, error, cargando, recargar, reintentar } = useEstadoHoy()
  const [vinculando, setVinculando] = useState(false)
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null)

  const pendientes = useAnomaliasPendientes()

  // Al volver de otra pantalla (marcar, justificar) se refresca la jornada y el aviso de anomalías.
  useFocusEffect(useCallback(() => { void recargar(); void pendientes.recargar() }, [recargar, pendientes.recargar]))

  async function vincular() {
    setVinculando(true)
    setErrorVinculo(await vincularEsteDispositivo())
    setVinculando(false)
    await recargar()
  }

  if (cargando) return <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando tu jornada" />
  if (error || !estado) {
    return (
      <>
        <Aviso tipo="error">{error ?? 'No se pudo cargar tu jornada de hoy.'}</Aviso>
        <Boton titulo="Reintentar" variante="marino" onPress={reintentar} />
      </>
    )
  }

  const hechas = new Map(estado.marcaciones.map((m) => [m.tipo, m]))
  const faltaRostro = estado.rostro_requerido && !estado.rostro_registrado
  const verAnomalias = (
    <>
      {pendientes.cantidad > 0 && (
        <Aviso tipo="aviso">
          {pendientes.cantidad === 1 ? 'Tienes 1 anomalía por justificar.' : `Tienes ${pendientes.cantidad} anomalías por justificar.`}
        </Aviso>
      )}
      <Boton titulo="Mis anomalías" variante={pendientes.cantidad > 0 ? 'marino' : 'borde'} onPress={() => router.push('/anomalias')} />
    </>
  )
  return (
    <>
      <View style={estilos.jornada}>
        <Text style={estilos.jornadaTitulo}>Hoy · {diaLargo(estado.fecha)}</Text>
        {TIPOS.map(({ tipo, nombre }) => {
          const m = hechas.get(tipo)
          return (
            <View key={tipo} style={estilos.fila}>
              <Text style={[estilos.filaNombre, !m && { color: colores.etiqueta }]}>{nombre}</Text>
              <Text style={[estilos.filaHora, m ? { color: colores.ok } : { color: colores.etiqueta }]}>
                {m ? `✓ ${horaLocal(m.fecha_hora)}` : 'Pendiente'}
              </Text>
            </View>
          )
        })}
      </View>

      {faltaRostro && (
        <>
          <Aviso tipo="aviso">Antes de marcar debes registrar tu rostro. Es un paso único: aceptas el consentimiento y te tomamos 3 fotos guiadas. Las fotos no se guardan.</Aviso>
          <Boton titulo="Registrar mi rostro" onPress={() => router.push('/registro-rostro')} />
        </>
      )}
      {estado.dispositivo === 'sin_vincular' && (
        <>
          <Aviso tipo="aviso">Para marcar tu asistencia debes vincular este celular a tu cuenta. Solo puedes tener un celular vinculado; para cambiarlo, Talento Humano debe reiniciarlo.</Aviso>
          {errorVinculo && <Aviso tipo="error">{errorVinculo}</Aviso>}
          <Boton titulo="Vincular este celular" cargando={vinculando} onPress={vincular} />
        </>
      )}
      {estado.dispositivo === 'otro' && (
        <Aviso tipo="error">Tu cuenta está vinculada a otro celular. Para marcar desde este, pide a Talento Humano que reinicie el vínculo.</Aviso>
      )}
      {estado.dispositivo === 'este' && !faltaRostro && (
        estado.siguiente ? (
          <Boton titulo={verboDeTipo(estado.siguiente)} onPress={() => router.push({ pathname: '/marcar', params: { tipo: estado.siguiente! } })} />
        ) : (
          <Aviso tipo="ok">Completaste tus cuatro marcaciones de hoy. ¡Buen trabajo!</Aviso>
        )
      )}
      {verAnomalias}
    </>
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
  jornada: { backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.bordeSuave, padding: 20, gap: 10 },
  jornadaTitulo: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.marino, marginBottom: 4 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filaNombre: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.marino },
  filaHora: { fontFamily: fuentes.negrita, fontSize: 14 },
})
