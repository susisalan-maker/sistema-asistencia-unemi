import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton } from '../../components/ui'
import { Chip, IconoCirculo, PantallaPestana, Seccion, Tarjeta2 } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import { cargarHistorial, type Historial as HistorialDatos } from '../../lib/historial'
import { horaLocal, nombreDeTipo, rotuloDeDia, simboloDeTipo } from '../../lib/marcacion'
import { colores, fuentes } from '../../theme'

const DIAS = 7
const ESTADO_ANOMALIA: Record<string, string> = {
  pendiente: 'abierta', en_revision: 'en revisión', justificada: 'justificada', rechazada: 'rechazada', sin_justificar: 'sin justificar',
}

/** Pestaña Historial (M4 del mockup): solo consulta, agrupado por día. */
export default function Historial() {
  const [datos, setDatos] = useState<HistorialDatos | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setDatos(await cargarHistorial(DIAS))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu historial.')
    }
  }, [])
  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const subtitulo = datos ? `Últimos ${DIAS} días · ${datos.total} ${datos.total === 1 ? 'marcación' : 'marcaciones'}` : `Últimos ${DIAS} días`
  return (
    <PantallaPestana titulo="Historial" subtitulo={subtitulo}>
      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton titulo="Reintentar" variante="marino" onPress={cargar} />
        </>
      )}
      {!error && !datos && <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando tu historial" />}
      {!error && datos?.total === 0 && (
        <Tarjeta2><Text style={estilos.vacio}>Aún no tienes marcaciones en los últimos {DIAS} días.</Text></Tarjeta2>
      )}
      {datos?.dias.map((dia) => (
        <View key={dia.fecha} style={{ gap: 10 }}>
          <Seccion texto={rotuloDeDia(dia.fecha)} />
          <View style={estilos.lista}>
            {dia.marcaciones.map((m, i) => (
              <View key={m.id} style={[estilos.fila, i > 0 && estilos.filaConBorde]}>
                <IconoCirculo simbolo={m.anomalia ? '!' : simboloDeTipo(m.tipo)} tono={m.anomalia ? 'aviso' : 'celeste'} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.titulo}>{nombreDeTipo(m.tipo)} {horaLocal(m.fecha_hora)}</Text>
                  {m.lugar ? <Text style={estilos.sub}>{m.lugar}</Text> : null}
                  {m.anomalia && (
                    <Text style={estilos.anomalia}>Anomalía {ESTADO_ANOMALIA[m.anomalia.estado] ?? m.anomalia.estado}</Text>
                  )}
                </View>
                <Chip texto="Sincronizado" tono="ok" tamano="chico" />
              </View>
            ))}
          </View>
        </View>
      ))}
    </PantallaPestana>
  )
}

const estilos = StyleSheet.create({
  vacio: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave, textAlign: 'center' },
  lista: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14 },
  filaConBorde: { borderTopWidth: 1, borderTopColor: colores.lienzo },
  titulo: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
  sub: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta },
  anomalia: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.aviso },
})
