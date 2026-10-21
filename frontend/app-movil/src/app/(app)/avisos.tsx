import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton } from '../../components/ui'
import { BotonAccion, IconoCirculo, PantallaPestana, Seccion, Tarjeta2 } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import {
  type Anomalia, ESTADOS, etiquetaDia, fechaCorta, iconoDeAnomalia, listarAnomalias, nombreDeAnomalia, textoCaso, tiempoRestante,
} from '../../lib/anomalias'
import { colores, fuentes } from '../../theme'

/** Pestaña Avisos (M5 del mockup): las anomalías que esperan explicación y, debajo, las anteriores. */
export default function Avisos() {
  const router = useRouter()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setLista(await listarAnomalias())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus avisos.')
    }
  }, [])
  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const abrir = (id: string) => router.push({ pathname: '/justificar', params: { id } })
  const porExplicar = (lista ?? []).filter((a) => a.puede_justificar)
  const anteriores = (lista ?? []).filter((a) => !a.puede_justificar)
  const subtitulo =
    lista === null ? undefined
    : porExplicar.length === 0 ? 'No tienes anomalías por explicar'
    : porExplicar.length === 1 ? '1 anomalía requiere tu explicación'
    : `${porExplicar.length} anomalías requieren tu explicación`

  return (
    <PantallaPestana titulo="Avisos" subtitulo={subtitulo}>
      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton titulo="Reintentar" variante="marino" onPress={cargar} />
        </>
      )}
      {!error && lista === null && <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando tus avisos" />}
      {!error && lista?.length === 0 && (
        <Tarjeta2><Text style={estilos.vacio}>No tienes avisos. ¡Todo en orden!</Text></Tarjeta2>
      )}

      {porExplicar.map((a) => <TarjetaAviso key={a.id} a={a} onExplicar={() => abrir(a.id)} onDespues={() => router.navigate('/')} />)}

      {anteriores.length > 0 && (
        <>
          <Seccion texto="Anteriores" />
          <View style={estilos.listaBlanca}>
            {anteriores.map((a, i) => (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`${textoCaso(a.caso)}, ${nombreDeAnomalia(a.tipo)}`}
                onPress={() => abrir(a.id)}
                style={[estilos.fila, i > 0 && estilos.filaConBorde]}
              >
                <IconoCirculo simbolo={iconoDeAnomalia(a.tipo)} />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.filaTitulo}>{nombreDeAnomalia(a.tipo)}</Text>
                  <Text style={estilos.filaSub}>{fechaCorta(a.creada)} · {ESTADOS[a.estado].texto.toLowerCase()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </PantallaPestana>
  )
}

function TarjetaAviso({ a, onExplicar, onDespues }: { a: Anomalia; onExplicar: () => void; onDespues: () => void }) {
  const resta = tiempoRestante(a.vence)
  return (
    <View style={estilos.tarjetaAviso}>
      <View style={estilos.encabezado}>
        <IconoCirculo simbolo="!" tono="aviso" tamano={48} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.avisoTitulo}>Anomalía detectada</Text>
          <Text style={estilos.avisoSub}>{etiquetaDia(a.creada)} h · {textoCaso(a.caso)}</Text>
        </View>
        <View style={estilos.punto} />
      </View>
      <Text style={estilos.cuerpo}>
        <Text style={estilos.cuerpoNegrita}>{nombreDeAnomalia(a.tipo)}</Text>
        {a.detalle ? `. ${a.detalle}` : ''}
      </Text>
      {resta && <Text style={estilos.plazo}>Te quedan {resta} para explicarlo</Text>}
      <BotonAccion titulo="Explicar" onPress={onExplicar} />
      <Pressable accessibilityRole="button" accessibilityLabel="Recuérdame más tarde" onPress={onDespues} hitSlop={8}>
        <Text style={estilos.despues}>Recuérdame más tarde</Text>
      </Pressable>
    </View>
  )
}

const estilos = StyleSheet.create({
  vacio: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave, textAlign: 'center' },
  tarjetaAviso: {
    backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: '#f0ddb7', padding: 20, gap: 15,
    shadowColor: colores.ambar, shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2,
  },
  encabezado: { flexDirection: 'row', gap: 13, alignItems: 'flex-start' },
  avisoTitulo: { fontFamily: fuentes.extranegrita, fontSize: 18, color: colores.marino },
  avisoSub: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.etiqueta, marginTop: 3 },
  punto: { width: 8, height: 8, borderRadius: 4, backgroundColor: colores.ambar, marginTop: 8 },
  cuerpo: { fontFamily: fuentes.media, fontSize: 15, lineHeight: 23, color: colores.texto },
  cuerpoNegrita: { fontFamily: fuentes.extranegrita, color: colores.marino },
  plazo: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.aviso },
  despues: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.etiqueta, textAlign: 'center' },
  listaBlanca: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15 },
  filaConBorde: { borderTopWidth: 1, borderTopColor: colores.lienzo },
  filaTitulo: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
  filaSub: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta },
})
