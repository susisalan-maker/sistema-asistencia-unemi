import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Crypto from 'expo-crypto'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BotonAccion, Chip } from '../../components/pestanas'
import { Aviso, Boton } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { etiquetaDispositivo, idDispositivo } from '../../lib/dispositivo'
import { avisoDeAnomalia, horaLocal, nombreDeTipo, registradoDe, type RespuestaMarcar } from '../../lib/marcacion'
import { ErrorUbicacion, obtenerPosicion, VIGENCIA_MS, type Posicion } from '../../lib/ubicacion'
import type { Zona } from '../../lib/useZona'
import { colores, fuentes } from '../../theme'

/** Los pasos del mockup: aviso previo (M3.1) → cámara (M3.2) → analizando → registrada (M3.3) o sin verificar (M3.4). */
type Fase = 'intro' | 'camara' | 'analizando' | 'listo' | 'rostro' | 'error'
interface Foto { uri: string; base64: string }

const PASOS = ['Rostro detectado', 'Comparando con el rostro registrado', 'Firmando la marcación']

export default function Marcar() {
  const router = useRouter()
  const { tipo } = useLocalSearchParams<{ tipo: string }>()
  const nombre = nombreDeTipo(tipo ?? '')

  const [fase, setFase] = useState<Fase>('intro')
  const [posicion, setPosicion] = useState<Posicion | null>(null)
  const [zona, setZona] = useState<Zona | null>(null)
  const [errorUbicacion, setErrorUbicacion] = useState<ErrorUbicacion | null>(null)
  const [buscando, setBuscando] = useState(true)
  const [foto, setFoto] = useState<Foto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallo, setFallo] = useState<{ mensaje: string; generico: boolean; intento: number | null } | null>(null)
  const [resultado, setResultado] = useState<RespuestaMarcar | null>(null)
  const [dispositivo, setDispositivo] = useState('')
  const [paso, setPaso] = useState(0)
  const camara = useRef<CameraView>(null)
  const [permisoCamara, pedirCamara] = useCameraPermissions()
  // El id y la hora se fijan en el primer envío: si falla la red y se reintenta, la marcación no se duplica.
  const intento = useRef<{ id: string; fechaHora: string } | null>(null)
  const [horaInicio] = useState(() => new Date().toISOString())

  async function buscarUbicacion() {
    setErrorUbicacion(null)
    setBuscando(true)
    try {
      const pos = await obtenerPosicion()
      setPosicion(pos)
      // La zona solo se muestra: si no se puede consultar, la marcación se valida igual en el servidor.
      try {
        setZona(await api<Zona>(`/marcaciones/zona?latitud=${pos.latitud}&longitud=${pos.longitud}`))
      } catch {
        setZona(null)
      }
    } catch (e) {
      setErrorUbicacion(e instanceof ErrorUbicacion ? e : new ErrorUbicacion('No pudimos obtener tu ubicación.'))
    } finally {
      setBuscando(false)
    }
  }
  useEffect(() => {
    void buscarUbicacion()
  }, [])

  // Los tres pasos de «Analizando» avanzan mientras el servidor responde.
  useEffect(() => {
    if (fase !== 'analizando') return
    setPaso(0)
    const uno = setTimeout(() => setPaso(1), 900)
    const dos = setTimeout(() => setPaso(2), 2200)
    return () => { clearTimeout(uno); clearTimeout(dos) }
  }, [fase])

  async function tomarFoto() {
    setError(null)
    let f: Foto
    try {
      const tomada = await camara.current?.takePictureAsync({ quality: 0.4, base64: true })
      if (!tomada?.base64) throw new Error('sin foto')
      f = { uri: tomada.uri, base64: tomada.base64 }
    } catch {
      setError('No se pudo tomar la foto. Inténtalo de nuevo.')
      return
    }
    setFoto(f)
    await enviar(f)
  }

  async function enviar(f: Foto | null = foto) {
    if (!posicion || !f || !tipo) return
    setError(null)
    setFase('analizando')
    try {
      // Si pasó mucho desde que se midió, la ubicación ya no vale: se mide otra vez.
      let pos = posicion
      if (Date.now() - posicion.tomadaEn > VIGENCIA_MS) {
        pos = await obtenerPosicion()
        setPosicion(pos)
      }
      intento.current ??= { id: Crypto.randomUUID(), fechaHora: new Date().toISOString() }
      const id = await idDispositivo()
      setDispositivo(etiquetaDispositivo(id))
      const respuesta = await api<RespuestaMarcar>('/marcaciones', {
        method: 'POST',
        body: {
          id: intento.current.id,
          tipo,
          fecha_hora: intento.current.fechaHora,
          latitud: pos.latitud,
          longitud: pos.longitud,
          precision_m: pos.precision_m,
          origen: 'app',
          dispositivo_id: id,
          selfie_b64: f.base64,
        },
      })
      setResultado(respuesta)
      setFase('listo')
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        // Rostro que no coincide (con código) o foto sin calidad suficiente (solo mensaje): se repite la verificación.
        setFallo({ mensaje: e.message, generico: e.codigo === 'rostro_no_verificado', intento: e.intento ?? null })
        setFase('rostro')
        return
      }
      setError(e instanceof ErrorUbicacion || e instanceof ApiError ? e.message : 'No se pudo registrar la marcación. Inténtalo de nuevo.')
      setFase('error')
    }
  }

  function reintentarVerificacion() {
    setFoto(null)
    setError(null)
    setFallo(null)
    setFase('camara')
  }

  const cancelar = () => router.back()
  const hora = horaLocal(intento.current?.fechaHora ?? horaInicio)

  if (fase === 'camara' || fase === 'analizando') {
    return (
      <SafeAreaView style={estilos.oscura}>
        <View style={estilos.camaraTop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar verificación" onPress={() => setFase('intro')} disabled={fase === 'analizando'} style={estilos.cerrar}>
            <Text style={estilos.cerrarTexto}>✕</Text>
          </Pressable>
          <Text accessibilityRole="header" style={estilos.camaraTitulo}>Verificación facial</Text>
          <View style={estilos.cerrar} />
        </View>
        <View style={estilos.pista}><Text style={estilos.pistaTexto}>Centra tu rostro dentro del óvalo</Text></View>
        <View style={estilos.centroOvalo}>
          <View style={estilos.ovalo}>
            {fase === 'analizando' && foto
              ? <Image source={{ uri: foto.uri }} style={estilos.llena} accessibilityLabel="Tu foto" />
              : !permisoCamara ? <ActivityIndicator color={colores.blanco} />
              : permisoCamara.granted ? <CameraView ref={camara} style={estilos.llena} facing="front" />
              : null}
          </View>
        </View>

        <View style={estilos.hoja}>
          {fase === 'analizando' ? (
            <Analizando paso={paso} />
          ) : permisoCamara && !permisoCamara.granted ? (
            <>
              <Aviso tipo="aviso">Necesitamos la cámara para verificar que eres tú.</Aviso>
              {permisoCamara.canAskAgain
                ? <Boton titulo="Permitir cámara" variante="marino" onPress={pedirCamara} />
                : <Boton titulo="Abrir ajustes" variante="marino" onPress={() => Linking.openSettings()} />}
            </>
          ) : (
            <>
              <Text style={estilos.hojaTitulo}>Mira de frente a la cámara</Text>
              <Text style={estilos.hojaSub}>Con buena luz, sin gafas oscuras ni gorra.</Text>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <BotonAccion titulo="Tomar foto" onPress={tomarFoto} deshabilitado={!permisoCamara} />
            </>
          )}
        </View>
      </SafeAreaView>
    )
  }

  if (fase === 'listo' && resultado) {
    const m = resultado.marcacion
    const lugar = zona?.lugar ?? zona?.sede ?? null
    return (
      <SafeAreaView style={estilos.clara}>
        <View style={estilos.contenido}>
          <View style={estilos.tarjetaExito}>
            <View style={estilos.exitoIcono}><Text style={estilos.exitoIconoTexto}>✓</Text></View>
            <Text accessibilityRole="header" style={estilos.exitoTitulo}>
              {resultado.reintento ? `${nombreDeTipo(m.tipo)} ya estaba ${registradoDe(m.tipo).split(' ').pop()}` : registradoDe(m.tipo)} · {horaLocal(m.fecha_hora)}
            </Text>
            <Text style={estilos.exitoSub}>{lugar ? `${lugar} · ` : ''}Identidad verificada</Text>
          </View>

          <View style={estilos.filas}>
            <FilaDato etiqueta="Sede" valor={zona?.sede ?? '—'} />
            <FilaDato etiqueta="Coordenadas" valor={posicion ? `${posicion.latitud.toFixed(5)}, ${posicion.longitud.toFixed(5)}` : '—'} />
            <FilaDato etiqueta="Dispositivo" valor={dispositivo || '—'} sinBorde />
          </View>

          {resultado.anomalias.length > 0 && (
            <View style={estilos.nota} accessibilityRole="alert">
              {resultado.anomalias.map((a) => <Text key={a.tipo} style={estilos.notaTexto}>{avisoDeAnomalia(a.tipo)}</Text>)}
              <Text style={estilos.notaTexto}>Quedó una observación: puedes explicarla desde Avisos.</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />
          <BotonAccion titulo="Volver al inicio" onPress={cancelar} />
          <BotonAccion titulo="Ver historial" variante="blanco" onPress={() => router.navigate('/historial')} />
        </View>
      </SafeAreaView>
    )
  }

  if (fase === 'rostro' && fallo) {
    return (
      <SafeAreaView style={estilos.clara}>
        <View style={estilos.contenido}>
          <View style={estilos.tarjetaFallo}>
            <View style={estilos.falloIcono}><Text style={estilos.falloIconoTexto}>!</Text></View>
            <Text accessibilityRole="header" style={estilos.falloTitulo}>No pudimos verificar tu identidad</Text>
            <Text style={estilos.falloTexto}>
              {fallo.generico ? 'No pudimos reconocer tu rostro' : fallo.mensaje.replace(/[.\s]+$/, '')}. Tu marcación de las {hora} no se ha guardado.
            </Text>
          </View>

          <Text style={estilos.antes}>ANTES DE REINTENTAR</Text>
          <View style={estilos.filas}>
            {['Busca una zona con buena iluminación', 'Quítate gafas oscuras o gorra', 'Mira de frente a la cámara'].map((t, i, a) => (
              <FilaDato key={t} etiqueta={t} valor="✓" sinBorde={i === a.length - 1} />
            ))}
          </View>
          {fallo.intento != null && <Text style={estilos.intento}>Intento {fallo.intento}</Text>}

          <View style={{ flex: 1 }} />
          <BotonAccion titulo="Reintentar verificación" onPress={reintentarVerificacion} />
          <BotonAccion titulo="Cancelar marcación" variante="blanco" onPress={cancelar} />
        </View>
      </SafeAreaView>
    )
  }

  if (fase === 'error') {
    return (
      <SafeAreaView style={estilos.clara}>
        <View style={estilos.contenido}>
          <Text accessibilityRole="header" style={estilos.titulo}>{nombre}</Text>
          <Aviso tipo="error">{error ?? 'No se pudo registrar la marcación.'}</Aviso>
          <View style={{ flex: 1 }} />
          <BotonAccion titulo="Reintentar" onPress={() => enviar()} />
          <BotonAccion titulo="Cancelar marcación" variante="blanco" onPress={cancelar} />
        </View>
      </SafeAreaView>
    )
  }

  // fase === 'intro' (M3.1)
  const listo = !!posicion && !buscando
  return (
    <SafeAreaView style={estilos.introFondo}>
      <View style={estilos.introTarjeta}>
        <Text style={estilos.introEtiqueta}>MARCACIÓN DE {nombre.toUpperCase()}</Text>
        <Text style={estilos.introHora}>{hora}</Text>
        {buscando ? (
          <View style={estilos.buscando} accessibilityRole="progressbar" accessibilityLabel="Obteniendo tu ubicación">
            <ActivityIndicator color={colores.marino} />
            <Text style={estilos.introSub}>Obteniendo tu ubicación…</Text>
          </View>
        ) : zona ? (
          <View style={{ gap: 8, alignItems: 'flex-start' }}>
            <Chip texto={zona.dentro ? 'Dentro del perímetro' : 'Fuera del perímetro'} tono={zona.dentro ? 'ok' : 'aviso'} />
            <Text style={estilos.introSub}>{zona.lugar ?? zona.sede}</Text>
          </View>
        ) : null}
      </View>

      <View style={estilos.hoja}>
        <Text accessibilityRole="header" style={estilos.hojaTitulo}>Verifica tu identidad</Text>
        <Text style={estilos.hojaSub}>Para registrar tu {nombre.toLowerCase()} necesitamos comprobar que eres tú.</Text>
        <View style={{ gap: 6 }}>
          <Text style={estilos.consejo}>• Busca un lugar con buena luz</Text>
          <Text style={estilos.consejo}>• Sin gafas oscuras ni gorra</Text>
        </View>
        {errorUbicacion && (
          <>
            <Aviso tipo="error">{errorUbicacion.message}</Aviso>
            {errorUbicacion.abrirAjustes && <Boton titulo="Abrir ajustes" variante="marino" onPress={() => Linking.openSettings()} />}
            <Boton titulo="Reintentar" onPress={buscarUbicacion} />
          </>
        )}
        {!errorUbicacion && zona && !zona.dentro && !zona.permite_fuera && (
          <Text style={estilos.avisoFuera}>Estás fuera de la zona: puedes marcar, pero quedará una observación para revisión.</Text>
        )}
        <BotonAccion titulo="Iniciar verificación facial" deshabilitado={!listo} onPress={() => setFase('camara')} />
        <Pressable accessibilityRole="button" accessibilityLabel="Cancelar marcación" onPress={cancelar} hitSlop={8}>
          <Text style={estilos.cancelar}>Cancelar marcación</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

function Analizando({ paso }: { paso: number }) {
  return (
    <View style={{ gap: 12 }} accessibilityRole="progressbar" accessibilityLabel="Analizando rostro">
      <Text style={estilos.hojaTitulo}>Analizando rostro…</Text>
      <Text style={estilos.hojaSub}>Mantén el teléfono estable</Text>
      <View style={estilos.barra}><View style={[estilos.barraRelleno, { width: `${Math.round(((paso + 1) / PASOS.length) * 100)}%` }]} /></View>
      {PASOS.map((t, i) => (
        <Text key={t} style={[estilos.paso, i > paso && { color: colores.textoInactivo }]}>{i < paso ? '✓' : i === paso ? '•' : '○'} {t}</Text>
      ))}
    </View>
  )
}

function FilaDato({ etiqueta, valor, sinBorde }: { etiqueta: string; valor: string; sinBorde?: boolean }) {
  return (
    <View style={[estilos.filaDato, !sinBorde && estilos.filaDatoBorde]}>
      <Text style={estilos.filaEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.filaValor}>{valor}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  oscura: { flex: 1, backgroundColor: colores.marino },
  clara: { flex: 1, backgroundColor: colores.lienzo },
  introFondo: { flex: 1, backgroundColor: colores.lienzo, justifyContent: 'space-between' },
  contenido: { flex: 1, padding: 20, gap: 14 },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 24, color: colores.marino },
  llena: { width: '100%', height: '100%' },
  camaraTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  cerrar: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  cerrarTexto: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.blanco },
  camaraTitulo: { fontFamily: fuentes.extranegrita, fontSize: 17, color: colores.blanco },
  pista: { alignSelf: 'center', marginTop: 18, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8 },
  pistaTexto: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.blanco },
  centroOvalo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ovalo: { width: 240, height: 310, borderRadius: 155, borderWidth: 4, borderColor: colores.ambar, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  hoja: { backgroundColor: colores.blanco, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 28, gap: 14 },
  hojaTitulo: { fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.marino },
  hojaSub: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave },
  barra: { height: 6, borderRadius: 3, backgroundColor: colores.celeste, overflow: 'hidden' },
  barraRelleno: { height: 6, backgroundColor: colores.ambar },
  paso: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.marino },
  introTarjeta: { margin: 20, backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.bordeSuave, padding: 22, gap: 8 },
  introEtiqueta: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta },
  introHora: { fontFamily: fuentes.extranegrita, fontSize: 34, color: colores.marino },
  introSub: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave },
  buscando: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  consejo: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.texto },
  avisoFuera: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.aviso, textAlign: 'center' },
  cancelar: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.etiqueta, textAlign: 'center' },
  tarjetaExito: { backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.okBorde, padding: 24, alignItems: 'center', gap: 8 },
  exitoIcono: { width: 56, height: 56, borderRadius: 28, backgroundColor: colores.ok, alignItems: 'center', justifyContent: 'center' },
  exitoIconoTexto: { fontFamily: fuentes.extranegrita, fontSize: 28, color: colores.blanco },
  exitoTitulo: { fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.marino, textAlign: 'center' },
  exitoSub: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave, textAlign: 'center' },
  filas: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  filaDato: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 14 },
  filaDatoBorde: { borderBottomWidth: 1, borderBottomColor: colores.lienzo },
  filaEtiqueta: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave, flexShrink: 1 },
  filaValor: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.marino, textAlign: 'right', flexShrink: 1 },
  nota: { backgroundColor: colores.avisoFondo, borderWidth: 1, borderColor: colores.avisoBorde, borderRadius: 14, padding: 14, gap: 4 },
  notaTexto: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.aviso },
  tarjetaFallo: { backgroundColor: colores.avisoFondo, borderRadius: 22, borderWidth: 1, borderColor: colores.avisoBorde, padding: 24, alignItems: 'center', gap: 8 },
  falloIcono: { width: 56, height: 56, borderRadius: 28, backgroundColor: colores.ambar, alignItems: 'center', justifyContent: 'center' },
  falloIconoTexto: { fontFamily: fuentes.extranegrita, fontSize: 28, color: colores.ambarTinta },
  falloTitulo: { fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.marino, textAlign: 'center' },
  falloTexto: { fontFamily: fuentes.seminegrita, fontSize: 14, lineHeight: 20, color: colores.aviso, textAlign: 'center' },
  antes: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta, paddingLeft: 4 },
  intento: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, textAlign: 'center' },
})
