import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Insignia } from '../../components/Insignia'
import { Aviso, Boton, Campo, Enlace, Pantalla } from '../../components/ui'
import { ApiError } from '../../lib/api'
import {
  type AnomaliaDetalle, explicacionDeEstado, fechaHoraLocal, justificarAnomalia, nombreDeAnomalia, obtenerAnomalia,
  problemaDeTexto, TEXTO_MAX, tiempoRestante,
} from '../../lib/anomalias'
import { colores, fuentes } from '../../theme'

/** Detalle de una anomalía: qué pasó, cómo va el caso y, si aún se puede, el formulario para justificarla. */
export default function Anomalia() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const [a, setA] = useState<AnomaliaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [enviada, setEnviada] = useState(false)

  useEffect(() => {
    let vivo = true
    obtenerAnomalia(id)
      .then((d) => { if (vivo) setA(d) })
      .catch((e) => { if (vivo) setError(e instanceof ApiError ? e.message : 'No se pudo cargar la anomalía.') })
    return () => { vivo = false }
  }, [id])

  async function enviar() {
    if (!a) return
    const problema = problemaDeTexto(texto)
    if (problema) { setErrorEnvio(problema); return }
    setEnviando(true)
    setErrorEnvio(null)
    try {
      setA(await justificarAnomalia(a.id, texto))
      setEnviada(true)
    } catch (e) {
      const mensaje = e instanceof ApiError ? e.message : 'No se pudo enviar tu justificación.'
      setErrorEnvio(mensaje)
      // Si el servidor dice que ya no se puede (plazo o ya justificada), se refresca para mostrar el estado real.
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        try { setA(await obtenerAnomalia(a.id)) } catch { /* se queda el aviso */ }
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Pantalla>
      <Enlace titulo="‹ Volver" onPress={() => router.back()} />
      {error && <Aviso tipo="error">{error}</Aviso>}
      {!error && !a && <ActivityIndicator color={colores.marino} accessibilityLabel="Cargando la anomalía" />}
      {a && (
        <>
          <View style={estilos.cabecera}>
            <Text style={estilos.caso}>{a.caso} · {fechaHoraLocal(a.creada)}</Text>
            <Insignia estado={a.estado} />
          </View>
          <Text accessibilityRole="header" style={estilos.titulo}>{nombreDeAnomalia(a.tipo)}</Text>
          {a.detalle ? <View style={estilos.cuadro}><Text style={estilos.cuadroTitulo}>Qué detectó el sistema</Text><Text style={estilos.cuadroTexto}>{a.detalle}</Text></View> : null}

          {enviada && <Aviso tipo="ok">Tu justificación se envió. Un administrador la revisará.</Aviso>}
          {!enviada && <Text style={estilos.explicacion}>{explicacionDeEstado(a)}</Text>}

          {a.mensajes.length > 0 && (
            <View style={estilos.cuadro}>
              <Text style={estilos.cuadroTitulo}>Tu explicación</Text>
              {a.mensajes.map((m, i) => (
                <View key={i} style={{ gap: 2 }}>
                  <Text style={estilos.cuadroTexto}>{m.contenido}</Text>
                  <Text style={estilos.fecha}>{fechaHoraLocal(m.fecha)}</Text>
                </View>
              ))}
            </View>
          )}
          {a.decision && (
            <Aviso tipo={a.decision === 'aprobada' ? 'ok' : 'error'}>
              {a.decision === 'aprobada' ? 'Aprobada.' : 'Rechazada.'}{a.comentario ? ` ${a.comentario}` : ''}
            </Aviso>
          )}

          {a.puede_justificar && (
            <>
              <Text style={estilos.plazo}>Te quedan {tiempoRestante(a.vence) ?? '0 min'} para justificar</Text>
              <Campo
                etiqueta="Tu explicación"
                multiline
                autoCapitalize="sentences"
                autoCorrect
                maxLength={TEXTO_MAX + 200}
                placeholder="Cuéntanos qué pasó"
                value={texto}
                onChangeText={(t) => { setTexto(t); setErrorEnvio(null) }}
              />
              <Text style={estilos.contador}>{texto.trim().length}/{TEXTO_MAX}</Text>
              {errorEnvio && <Aviso tipo="error">{errorEnvio}</Aviso>}
              <Boton titulo="Enviar justificación" cargando={enviando} onPress={enviar} />
            </>
          )}
          {!a.puede_justificar && errorEnvio && <Aviso tipo="error">{errorEnvio}</Aviso>}
        </>
      )}
    </Pantalla>
  )
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caso: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.etiqueta },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 25, color: colores.marino },
  explicacion: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave, lineHeight: 22 },
  cuadro: { backgroundColor: colores.blanco, borderRadius: 16, borderWidth: 1, borderColor: colores.bordeSuave, padding: 16, gap: 8 },
  cuadroTitulo: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta, textTransform: 'uppercase' },
  cuadroTexto: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.marino, lineHeight: 22 },
  fecha: { fontFamily: fuentes.media, fontSize: 12, color: colores.etiqueta },
  plazo: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.aviso },
  contador: { fontFamily: fuentes.media, fontSize: 12, color: colores.etiqueta, textAlign: 'right', marginTop: -8 },
})
