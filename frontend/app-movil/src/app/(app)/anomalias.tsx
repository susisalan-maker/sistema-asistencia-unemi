import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton, Enlace, Pantalla } from '../../components/ui'
import { ApiError } from '../../lib/api'
import { Insignia } from '../../components/Insignia'
import { type Anomalia, fechaHoraLocal, listarAnomalias, nombreDeAnomalia, tiempoRestante } from '../../lib/anomalias'
import { colores, fuentes } from '../../theme'

/** Las anomalías de la persona: primero las que puede justificar, luego el resto, de la más reciente a la más antigua. */
export default function MisAnomalias() {
  const router = useRouter()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setLista(await listarAnomalias())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus anomalías.')
    }
  }, [])
  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const porJustificar = (lista ?? []).filter((a) => a.puede_justificar)
  const resto = (lista ?? []).filter((a) => !a.puede_justificar)

  return (
    <Pantalla>
      <Enlace titulo="‹ Volver" onPress={() => router.back()} />
      <Text accessibilityRole="header" style={estilos.titulo}>Mis anomalías</Text>

      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton titulo="Reintentar" variante="marino" onPress={cargar} />
        </>
      )}
      {!error && lista === null && <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando tus anomalías" />}
      {!error && lista?.length === 0 && <Aviso tipo="ok">No tienes anomalías. ¡Todo en orden!</Aviso>}

      {porJustificar.length > 0 && (
        <>
          <Aviso tipo="aviso">
            {porJustificar.length === 1 ? 'Tienes 1 anomalía por justificar.' : `Tienes ${porJustificar.length} anomalías por justificar.`}
          </Aviso>
          {porJustificar.map((a) => <Fila key={a.id} a={a} onPress={() => router.push({ pathname: '/anomalia', params: { id: a.id } })} />)}
        </>
      )}
      {resto.length > 0 && (
        <>
          {porJustificar.length > 0 && <Text style={estilos.seccion}>Anteriores</Text>}
          {resto.map((a) => <Fila key={a.id} a={a} onPress={() => router.push({ pathname: '/anomalia', params: { id: a.id } })} />)}
        </>
      )}
    </Pantalla>
  )
}

function Fila({ a, onPress }: { a: Anomalia; onPress: () => void }) {
  const resta = a.puede_justificar ? tiempoRestante(a.vence) : null
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${a.caso}, ${nombreDeAnomalia(a.tipo)}`}
      onPress={onPress}
      style={({ pressed }) => [estilos.fila, pressed && { opacity: 0.85 }]}
    >
      <View style={estilos.filaArriba}>
        <Text style={estilos.caso}>{a.caso} · {fechaHoraLocal(a.creada)}</Text>
        <Insignia estado={a.estado} />
      </View>
      <Text style={estilos.nombre}>{nombreDeAnomalia(a.tipo)}</Text>
      {a.detalle ? <Text style={estilos.detalle} numberOfLines={2}>{a.detalle}</Text> : null}
      {resta && <Text style={estilos.plazo}>Te quedan {resta} para justificar</Text>}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 25, color: colores.marino },
  seccion: { fontFamily: fuentes.extranegrita, fontSize: 13, letterSpacing: 1, color: colores.etiqueta, textTransform: 'uppercase' },
  fila: { backgroundColor: colores.blanco, borderRadius: 18, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, gap: 6 },
  filaArriba: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  caso: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.etiqueta },
  nombre: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.marino },
  detalle: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave, lineHeight: 18 },
  plazo: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.aviso },
})
