import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Aviso } from '../../components/ui'
import { BotonAccion, Chip } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import {
  type AnomaliaDetalle, cierreDeConversacion, ESTADOS, etiquetaDia, justificarAnomalia, mensajeInicial, nombreDeAnomalia,
  obtenerAnomalia, problemaDeTexto, textoCaso,
} from '../../lib/anomalias'
import { colores, fuentes } from '../../theme'

/** Justificar anomalía (M6 del mockup): chat con el asistente. Termina con «Enviado a revisión». */
export default function Justificar() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [a, setA] = useState<AnomaliaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const lista = useRef<ScrollView>(null)

  useEffect(() => {
    let vivo = true
    obtenerAnomalia(id)
      .then((d) => { if (vivo) setA(d) })
      .catch((e) => { if (vivo) setError(e instanceof ApiError ? e.message : 'No se pudo cargar la anomalía.') })
    return () => { vivo = false }
  }, [id])

  async function enviar() {
    if (!a || enviando) return
    const problema = problemaDeTexto(texto, a.mensajes.length > 0)
    if (problema) { setErrorEnvio(problema); return }
    setEnviando(true)
    setErrorEnvio(null)
    try {
      setA(await justificarAnomalia(a.id, texto))
      setTexto('')
    } catch (e) {
      setErrorEnvio(e instanceof ApiError ? e.message : 'No se pudo enviar tu justificación.')
      // Si el servidor dice que ya no se puede (plazo vencido o ya justificada), se muestra el estado real.
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        try { setA(await obtenerAnomalia(a.id)) } catch { /* se queda el aviso */ }
      }
    } finally {
      setEnviando(false)
    }
  }

  // Siempre a Avisos: con router.back() una pestaña oculta regresaba a Inicio, que es la primera pestaña.
  const volver = () => router.navigate('/avisos')
  const estado = a ? ESTADOS[a.estado] : null

  return (
    <SafeAreaView style={estilos.pantalla}>
      <View style={estilos.barra}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={volver} style={estilos.atras}>
          <Text style={estilos.atrasTexto}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={estilos.barraTitulo}>Justificar anomalía</Text>
          {a && <Text style={estilos.barraSub} numberOfLines={2}>{textoCaso(a.caso)} · {nombreDeAnomalia(a.tipo)}</Text>}
        </View>
        {a && estado && <Chip texto={estado.texto} tono={estado.tono} tamano="chico" />}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={lista}
          contentContainerStyle={estilos.conversacion}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: true })}
        >
          {error && <Aviso tipo="error">{error}</Aviso>}
          {!error && !a && <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando la anomalía" />}
          {a && (
            <>
              <View style={estilos.fecha}><Text style={estilos.fechaTexto}>{etiquetaDia(a.creada)}</Text></View>
              <BurbujaAsistente texto={mensajeInicial(a)} />
              {a.mensajes.map((m, i) =>
                m.emisor === 'usuario'
                  ? <BurbujaUsuario key={i} texto={m.contenido} />
                  : <BurbujaAsistente key={i} texto={m.contenido} />,
              )}
              {enviando && (
                <>
                  <BurbujaUsuario texto={texto.trim()} />
                  <BurbujaAsistente texto="Escribiendo…" />
                </>
              )}
              <Cierre a={a} />
            </>
          )}
        </ScrollView>

        {a && (
          <View style={estilos.pie}>
            {a.puede_justificar ? (
              <>
                {errorEnvio && <Aviso tipo="error">{errorEnvio}</Aviso>}
                <View style={estilos.entradaFila}>
                  <TextInput
                    accessibilityLabel="Tu respuesta"
                    multiline
                    autoCapitalize="sentences"
                    placeholder={a.mensajes.length > 0 ? 'Escribe tu respuesta' : 'Cuéntanos qué ocurrió'}
                    placeholderTextColor={colores.placeholder}
                    value={texto}
                    onChangeText={(t) => { setTexto(t); setErrorEnvio(null) }}
                    style={estilos.entrada}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Enviar respuesta"
                    accessibilityState={{ disabled: enviando, busy: enviando }}
                    disabled={enviando}
                    onPress={enviar}
                    style={[estilos.enviar, enviando && { opacity: 0.6 }]}
                  >
                    {enviando ? <ActivityIndicator color={colores.ambarTinta} /> : <Text style={estilos.enviarTexto}>↑</Text>}
                  </Pressable>
                </View>
                <Text style={estilos.nota}>Tu justificación será revisada por Talento Humano</Text>
              </>
            ) : (
              <>
                <Text style={estilos.cerrada}>{cierreDeConversacion(a.estado)}</Text>
                <BotonAccion titulo="Volver a avisos" onPress={volver} />
              </>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function BurbujaAsistente({ texto }: { texto: string }) {
  return (
    <View style={estilos.filaAsistente}>
      <View style={estilos.avatar}><Text style={estilos.avatarTexto}>SA</Text></View>
      <View style={estilos.burbujaAsistente}><Text style={estilos.burbujaTextoAsistente}>{texto}</Text></View>
    </View>
  )
}

function BurbujaUsuario({ texto }: { texto: string }) {
  return (
    <View style={estilos.filaUsuario}>
      <View style={estilos.burbujaUsuario}><Text style={estilos.burbujaTextoUsuario}>{texto}</Text></View>
    </View>
  )
}

/** Cómo termina la conversación según el estado del caso. */
function Cierre({ a }: { a: AnomaliaDetalle }) {
  if (a.puede_justificar) return null
  if (a.decision) {
    const ok = a.decision === 'aprobada'
    return (
      <Tarjeta2Cierre
        tono={ok ? 'ok' : 'error'}
        titulo={ok ? 'Justificación aceptada' : 'Justificación rechazada'}
        texto={a.comentario ?? (ok
          ? (a.automatica ? 'Revisamos tu explicación y la aceptamos automáticamente.' : 'Talento Humano aceptó tu explicación.')
          : 'Talento Humano no aceptó tu explicación.')}
      />
    )
  }
  if (a.estado === 'en_revision') {
    return (
      <Tarjeta2Cierre
        tono="ok" titulo="Enviado a revisión"
        texto={`Talento Humano responderá en un plazo de ${a.plazo_revision_h} h. Estado actual: En revisión.`}
      />
    )
  }
  return (
    <Tarjeta2Cierre
      tono="error" titulo="El plazo terminó"
      texto="No se justificó a tiempo. El caso pasará a revisión de Talento Humano."
    />
  )
}

function Tarjeta2Cierre({ tono, titulo, texto }: { tono: 'ok' | 'error'; titulo: string; texto: string }) {
  const c = tono === 'ok'
    ? { fondo: colores.okFondo, borde: colores.okBorde, texto: colores.ok, icono: '✓', circulo: colores.ok }
    : { fondo: colores.errorFondo, borde: colores.errorBorde, texto: colores.error, icono: '!', circulo: colores.error }
  return (
    <View accessibilityRole="alert" style={[estilos.cierre, { backgroundColor: c.fondo, borderColor: c.borde }]}>
      <View style={[estilos.cierreIcono, { backgroundColor: c.circulo }]}><Text style={estilos.cierreIconoTexto}>{c.icono}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={[estilos.cierreTitulo, { color: c.texto }]}>{titulo}</Text>
        <Text style={[estilos.cierreTexto, { color: tono === 'ok' ? colores.textoSuave : c.texto }]}>{texto}</Text>
      </View>
    </View>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.lienzo },
  barra: {
    flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colores.blanco, borderBottomWidth: 1, borderBottomColor: colores.bordeSuave,
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
  },
  atras: { width: 38, height: 38, borderRadius: 19, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  atrasTexto: { fontFamily: fuentes.extranegrita, fontSize: 22, color: colores.marino, marginTop: -2 },
  barraTitulo: { fontFamily: fuentes.extranegrita, fontSize: 17, color: colores.marino },
  barraSub: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta },
  conversacion: { padding: 20, gap: 14, flexGrow: 1 },
  fecha: { alignSelf: 'center', backgroundColor: colores.fechaChat, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  fechaTexto: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.textoSuave },
  filaAsistente: { flexDirection: 'row', gap: 10, alignItems: 'flex-end' },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.extranegrita, fontSize: 12, color: colores.marino },
  burbujaAsistente: {
    maxWidth: '78%', backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16, paddingVertical: 14,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6,
  },
  burbujaTextoAsistente: { fontFamily: fuentes.media, fontSize: 15, lineHeight: 22, color: colores.texto },
  filaUsuario: { flexDirection: 'row', justifyContent: 'flex-end' },
  burbujaUsuario: {
    maxWidth: '78%', backgroundColor: colores.marino, paddingHorizontal: 16, paddingVertical: 14,
    borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6,
  },
  burbujaTextoUsuario: { fontFamily: fuentes.media, fontSize: 15, lineHeight: 22, color: colores.blanco },
  cierre: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16, borderWidth: 1, padding: 16 },
  cierreIcono: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  cierreIconoTexto: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.blanco },
  cierreTitulo: { fontFamily: fuentes.extranegrita, fontSize: 15 },
  cierreTexto: { fontFamily: fuentes.seminegrita, fontSize: 13, lineHeight: 19, marginTop: 2 },
  pie: {
    backgroundColor: colores.blanco, borderTopWidth: 1, borderTopColor: colores.bordeSuave, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 18, gap: 10,
  },
  entradaFila: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  entrada: {
    flex: 1, minHeight: 48, maxHeight: 130, borderWidth: 1.5, borderColor: colores.marino, borderRadius: 22, backgroundColor: colores.blanco,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontFamily: fuentes.seminegrita, fontSize: 15, lineHeight: 21, color: colores.marino,
  },
  enviar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colores.ambar, alignItems: 'center', justifyContent: 'center',
    shadowColor: colores.ambar, shadowOpacity: 0.32, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  enviarTexto: { fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.ambarTinta },
  nota: { fontFamily: fuentes.seminegrita, fontSize: 11, color: colores.textoInactivo, textAlign: 'center' },
  cerrada: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.etiqueta, textAlign: 'center' },
})
