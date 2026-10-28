import { CameraView, useCameraPermissions } from 'expo-camera'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton, Enlace, Pantalla, Tarjeta } from '../../components/ui'
import { UnaVisita } from '../../components/UnaVisita'
import { CONSENTIMIENTO_ROSTRO, PASOS_ROSTRO, registrarRostro } from '../../lib/rostro'
import { colores, fuentes } from '../../theme'

type Fase = 'consentimiento' | 'captura' | 'revision' | 'enviando' | 'fallo_envio' | 'listo'
interface Foto { uri: string; base64: string }

/** Registro guiado del rostro: consentimiento + 3 fotos. Se hace una sola vez; las fotos no se guardan. */
function RegistroRostroPantalla() {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('consentimiento')
  const [acepta, setAcepta] = useState(false)
  const [fotos, setFotos] = useState<Foto[]>([])
  const [pendiente, setPendiente] = useState<Foto | null>(null) // la que se acaba de tomar, por confirmar
  const [error, setError] = useState<string | null>(null)
  const camara = useRef<CameraView>(null)
  const [permisoCamara, pedirCamara] = useCameraPermissions()
  const paso = fotos.length // 0, 1 o 2: la foto que toca tomar

  async function tomarFoto() {
    setError(null)
    try {
      const f = await camara.current?.takePictureAsync({ quality: 0.5, base64: true })
      if (!f?.base64) throw new Error('sin foto')
      setPendiente({ uri: f.uri, base64: f.base64 })
      setFase('revision')
    } catch {
      setError('No se pudo tomar la foto. Inténtalo de nuevo.')
    }
  }

  function usarFoto() {
    if (!pendiente) return
    const nuevas = [...fotos, pendiente]
    setFotos(nuevas)
    setPendiente(null)
    setFase(nuevas.length === PASOS_ROSTRO.length ? 'enviando' : 'captura')
    if (nuevas.length === PASOS_ROSTRO.length) void enviar(nuevas)
  }

  function repetirFoto() {
    setPendiente(null)
    setError(null)
    setFase('captura')
  }

  async function enviar(lista: Foto[]) {
    setError(null)
    setFase('enviando')
    const r = await registrarRostro(lista.map((f) => f.base64))
    if (r.ok) {
      setFase('listo')
      return
    }
    setError(r.mensaje)
    if (r.foto && r.foto >= 1 && r.foto <= lista.length) {
      // El servidor rechazó una foto concreta (borrosa, oscura…): se repite desde esa.
      setFotos(lista.slice(0, r.foto - 1))
      setFase('captura')
    } else {
      setFase('fallo_envio') // red, servidor o fotos de personas distintas: se puede reintentar o empezar de nuevo
    }
  }

  function empezarDeNuevo() {
    setFotos([])
    setPendiente(null)
    setError(null)
    setFase('captura')
  }

  const actual = PASOS_ROSTRO[Math.min(paso, PASOS_ROSTRO.length - 1)]!

  return (
    <Pantalla>
      <Tarjeta titulo="Registro de tu rostro" subtitulo="Se hace una sola vez. Así comprobamos que eres tú cuando marcas.">
        {fase === 'consentimiento' && (
          <>
            <Text style={estilos.legal}>{CONSENTIMIENTO_ROSTRO}</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel="Acepto el tratamiento de mis datos biométricos"
              accessibilityState={{ checked: acepta }}
              onPress={() => setAcepta(!acepta)}
              style={estilos.casilla}
            >
              <View style={[estilos.caja, acepta && estilos.cajaMarcada]}>{acepta && <Text style={estilos.palomita}>✓</Text>}</View>
              <Text style={estilos.casillaTexto}>Acepto el tratamiento de mis datos biométricos</Text>
            </Pressable>
            <Boton titulo="Continuar" disabled={!acepta} onPress={() => setFase('captura')} />
          </>
        )}

        {fase === 'captura' && (
          !permisoCamara ? null : !permisoCamara.granted ? (
            <>
              <Aviso tipo="aviso">Necesitamos la cámara para registrar tu rostro.</Aviso>
              {permisoCamara.canAskAgain
                ? <Boton titulo="Permitir cámara" variante="marino" onPress={pedirCamara} />
                : <Boton titulo="Abrir ajustes" variante="marino" onPress={() => Linking.openSettings()} />}
            </>
          ) : (
            <>
              <Text style={estilos.paso}>Foto {paso + 1} de {PASOS_ROSTRO.length} · {actual.titulo}</Text>
              <View>
                <CameraView ref={camara} style={estilos.camara} facing="front" />
                <View pointerEvents="none" style={estilos.guia} />
              </View>
              <Text style={estilos.pista}>{actual.instruccion}</Text>
              <Text style={estilos.pistaChica}>Sin lentes oscuros ni gorra, con buena luz y solo tú en la foto.</Text>
              {error && <Aviso tipo="error">{error}</Aviso>}
              <Boton titulo="Tomar foto" onPress={tomarFoto} />
            </>
          )
        )}

        {fase === 'revision' && pendiente && (
          <>
            <Text style={estilos.paso}>Foto {paso + 1} de {PASOS_ROSTRO.length} · ¿Se ve bien tu rostro?</Text>
            <Image source={{ uri: pendiente.uri }} style={estilos.camara} accessibilityLabel="Tu foto" />
            <Boton titulo={paso + 1 === PASOS_ROSTRO.length ? 'Usar y registrar mi rostro' : 'Usar esta foto'} variante="ambar" onPress={usarFoto} />
            <Boton titulo="Repetir foto" variante="borde" onPress={repetirFoto} />
          </>
        )}

        {fase === 'enviando' && (
          <Boton titulo="Registrando tu rostro…" cargando disabled />
        )}

        {fase === 'fallo_envio' && (
          <>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <Boton titulo="Reintentar" onPress={() => void enviar(fotos)} />
            <Boton titulo="Tomar las fotos otra vez" variante="borde" onPress={empezarDeNuevo} />
          </>
        )}

        {fase === 'listo' && (
          <>
            <Aviso tipo="ok">Tu rostro quedó registrado. Ya puedes marcar tu asistencia.</Aviso>
            <Boton titulo="Listo" variante="marino" onPress={() => router.back()} />
          </>
        )}
      </Tarjeta>
      {fase !== 'listo' && fase !== 'enviando' && <Enlace titulo="Cancelar" onPress={() => router.back()} />}
    </Pantalla>
  )
}

const estilos = StyleSheet.create({
  legal: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave, lineHeight: 19 },
  casilla: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  caja: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colores.marino, alignItems: 'center', justifyContent: 'center' },
  cajaMarcada: { backgroundColor: colores.marino },
  palomita: { color: colores.blanco, fontFamily: fuentes.extranegrita, fontSize: 14 },
  casillaTexto: { flex: 1, fontFamily: fuentes.negrita, fontSize: 14, color: colores.marino },
  paso: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.marino },
  pista: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.marino, textAlign: 'center' },
  pistaChica: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, textAlign: 'center' },
  camara: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, overflow: 'hidden', backgroundColor: colores.celeste },
  // Óvalo guía para centrar el rostro.
  guia: {
    position: 'absolute', top: '12%', bottom: '12%', left: '18%', right: '18%', borderRadius: 999,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderStyle: 'dashed',
  },
})

/** Cada visita empieza desde cero (ver UnaVisita). */
export default function RegistroRostro() {
  return (<UnaVisita><RegistroRostroPantalla /></UnaVisita>)
}
