import { CameraView, useCameraPermissions } from 'expo-camera'
import * as Crypto from 'expo-crypto'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Linking, StyleSheet, Text, View } from 'react-native'
import { ApiError, api } from '../../lib/api'
import { idDispositivo } from '../../lib/dispositivo'
import { avisoDeAnomalia, horaLocal, nombreDeTipo, type RespuestaMarcar } from '../../lib/marcacion'
import { ErrorUbicacion, obtenerPosicion, VIGENCIA_MS, type Posicion } from '../../lib/ubicacion'
import { Aviso, Boton, Enlace, Pantalla, Tarjeta } from '../../components/ui'
import { colores, fuentes } from '../../theme'

type Fase = 'ubicacion' | 'selfie' | 'confirmar' | 'enviando' | 'listo'
interface Foto { uri: string; base64: string }

export default function Marcar() {
  const router = useRouter()
  const { tipo } = useLocalSearchParams<{ tipo: string }>()
  const nombre = nombreDeTipo(tipo ?? '')

  const [fase, setFase] = useState<Fase>('ubicacion')
  const [posicion, setPosicion] = useState<Posicion | null>(null)
  const [errorUbicacion, setErrorUbicacion] = useState<ErrorUbicacion | null>(null)
  const [foto, setFoto] = useState<Foto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<RespuestaMarcar | null>(null)
  const camara = useRef<CameraView>(null)
  const [permisoCamara, pedirCamara] = useCameraPermissions()
  // El id y la hora se fijan en el primer envío: si falla la red y se reintenta, la marcación no se duplica.
  const intento = useRef<{ id: string; fechaHora: string } | null>(null)

  async function buscarUbicacion() {
    setErrorUbicacion(null)
    setFase('ubicacion')
    try {
      setPosicion(await obtenerPosicion())
      setFase('selfie')
    } catch (e) {
      setErrorUbicacion(e instanceof ErrorUbicacion ? e : new ErrorUbicacion('No pudimos obtener tu ubicación.'))
    }
  }
  useEffect(() => {
    void buscarUbicacion()
  }, [])

  async function tomarFoto() {
    setError(null)
    try {
      const f = await camara.current?.takePictureAsync({ quality: 0.4, base64: true })
      if (!f?.base64) throw new Error('sin foto')
      setFoto({ uri: f.uri, base64: f.base64 })
      setFase('confirmar')
    } catch {
      setError('No se pudo tomar la foto. Inténtalo de nuevo.')
    }
  }

  async function enviar() {
    if (!posicion || !foto || !tipo) return
    setError(null)
    setFase('enviando')
    try {
      // Si pasó mucho desde que se midió, la ubicación ya no vale: se mide otra vez.
      let pos = posicion
      if (Date.now() - posicion.tomadaEn > VIGENCIA_MS) {
        pos = await obtenerPosicion()
        setPosicion(pos)
      }
      intento.current ??= { id: Crypto.randomUUID(), fechaHora: new Date().toISOString() }
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
          dispositivo_id: await idDispositivo(),
          selfie_b64: foto.base64,
        },
      })
      setResultado(respuesta)
      setFase('listo')
    } catch (e) {
      setError(e instanceof ErrorUbicacion || e instanceof ApiError ? e.message : 'No se pudo registrar la marcación. Inténtalo de nuevo.')
      setFase('confirmar')
    }
  }

  function repetirFoto() {
    setFoto(null)
    setError(null)
    setFase('selfie')
  }

  return (
    <Pantalla>
      <Tarjeta titulo={nombre} subtitulo="Comprobamos tu ubicación y tu rostro antes de registrarla.">
        {fase === 'ubicacion' && (
          errorUbicacion ? (
            <>
              <Aviso tipo="error">{errorUbicacion.message}</Aviso>
              {errorUbicacion.abrirAjustes && <Boton titulo="Abrir ajustes" variante="marino" onPress={() => Linking.openSettings()} />}
              <Boton titulo="Reintentar" onPress={buscarUbicacion} />
            </>
          ) : (
            <View style={estilos.centro} accessibilityRole="progressbar" accessibilityLabel="Obteniendo tu ubicación">
              <ActivityIndicator color={colores.marino} />
              <Text style={estilos.texto}>Obteniendo tu ubicación…</Text>
            </View>
          )
        )}

        {fase === 'selfie' && (
          !permisoCamara ? (
            <ActivityIndicator color={colores.marino} />
          ) : !permisoCamara.granted ? (
            <>
              <Aviso tipo="aviso">Necesitamos la cámara para verificar que eres tú.</Aviso>
              {permisoCamara.canAskAgain
                ? <Boton titulo="Permitir cámara" variante="marino" onPress={pedirCamara} />
                : <Boton titulo="Abrir ajustes" variante="marino" onPress={() => Linking.openSettings()} />}
            </>
          ) : (
            <>
              <CameraView ref={camara} style={estilos.camara} facing="front" />
              <Text style={estilos.pista}>Mira de frente a la cámara, con buena luz.</Text>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <Boton titulo="Tomar foto" onPress={tomarFoto} />
            </>
          )
        )}

        {(fase === 'confirmar' || fase === 'enviando') && foto && (
          <>
            <Image source={{ uri: foto.uri }} style={estilos.camara} accessibilityLabel="Tu foto" />
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton titulo={error ? 'Reintentar' : 'Enviar marcación'} variante="ambar" cargando={fase === 'enviando'} onPress={enviar} />
            <Boton titulo="Repetir foto" variante="borde" disabled={fase === 'enviando'} onPress={repetirFoto} />
          </>
        )}

        {fase === 'listo' && resultado && (
          <>
            <Aviso tipo="ok">
              {resultado.reintento
                ? `${nombre} ya estaba registrada a las ${horaLocal(resultado.marcacion.fecha_hora)}.`
                : `${nombre} registrada a las ${horaLocal(resultado.marcacion.fecha_hora)}.`}
            </Aviso>
            {resultado.anomalias.map((a) => (
              <Aviso key={a.tipo} tipo="aviso">{avisoDeAnomalia(a.tipo)}</Aviso>
            ))}
            <Boton titulo="Listo" variante="marino" onPress={() => router.back()} />
          </>
        )}
      </Tarjeta>
      {fase !== 'listo' && fase !== 'enviando' && <Enlace titulo="Cancelar" onPress={() => router.back()} />}
    </Pantalla>
  )
}

const estilos = StyleSheet.create({
  centro: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  texto: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave },
  pista: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave, textAlign: 'center' },
  camara: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: colores.celeste },
})
