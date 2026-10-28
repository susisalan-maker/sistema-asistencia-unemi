import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { BotonAccion, Chip, IconoCirculo, PantallaPestana, Tarjeta2, type Tono } from '../../components/pestanas'
import { Aviso, Boton } from '../../components/ui'
import { AvisoSincronizacion } from '../../components/AvisoSincronizacion'
import { EsqueletoJornada } from '../../components/Esqueleto'
import { EsqueletoMapa } from '../../components/EsqueletoMapa'
import { MapaGeocerca } from '../../components/MapaGeocerca'
import { MenuAvatar } from '../../components/MenuAvatar'
import { formatoDistancia } from '../../lib/mapa'
import { useSincronizacion } from '../../lib/offline/SincronizacionContext'
import { cuandoFue, fechaConDia, hoyLocal, horaLocal, nombreDeTipo, simboloDeTipo, TIPOS, verboDeTipo, type EstadoHoy } from '../../lib/marcacion'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { useEstadoHoy, vincularEsteDispositivo } from '../../lib/useEstadoHoy'
import { useZona, type EstadoZona, type Zona } from '../../lib/useZona'
import { colores, fuentes } from '../../theme'

/** Pestaña Inicio (M2 del mockup). */
export default function Inicio() {
  const { perfil, cerrarSesion } = useAuth()
  if (!perfil) return null
  const esAdmin = perfil.rol === 'administrador'
  const avatar = (
    <MenuAvatar iniciales={iniciales(perfil.nombres, perfil.apellidos)} nombre={nombreCompleto(perfil)} correo={perfil.email}
      onCerrarSesion={() => void cerrarSesion()} />
  )
  return (
    <PantallaPestana antetitulo={fechaConDia(hoyLocal())} titulo={`Hola, ${perfil.nombres.split(' ')[0]}`} derecha={avatar}>
      {esAdmin ? (
        <Aviso tipo="aviso">Tu cuenta es de Administrador. El panel de gestión está en la versión web; en la app solo se registra la asistencia del personal.</Aviso>
      ) : (
        <JornadaDeHoy />
      )}
    </PantallaPestana>
  )
}

const CHIP_ZONA: Record<EstadoZona['fase'], { texto: string; tono: Tono }> = {
  buscando: { texto: 'Buscando ubicación…', tono: 'neutro' },
  lista: { texto: '', tono: 'ok' },
  sin_conexion: { texto: 'Sin conexión', tono: 'aviso' },
  error: { texto: 'Sin ubicación', tono: 'error' },
}

function JornadaDeHoy() {
  const router = useRouter()
  const { estado, error, cargando, sinConexion, avisoClave, recargar, reintentar } = useEstadoHoy()
  const { version } = useSincronizacion()
  const zona = useZona()
  const [vinculando, setVinculando] = useState(false)
  const [errorVinculo, setErrorVinculo] = useState<string | null>(null)
  const { medir } = zona

  // Al volver de otra pantalla (marcar, justificar) se refresca la jornada y la ubicación.
  useFocusEffect(useCallback(() => { void recargar(); void medir() }, [recargar, medir]))
  // Cuando lo que se guardó sin conexión llega al servidor, la jornada cambió: se vuelve a pedir.
  useEffect(() => { if (version > 0) void recargar() }, [version, recargar])

  async function vincular() {
    setVinculando(true)
    setErrorVinculo(await vincularEsteDispositivo())
    setVinculando(false)
    await recargar()
  }

  if (cargando) return <EsqueletoJornada />
  if (error || !estado) {
    return (
      <>
        <AvisoSincronizacion />
        <Aviso tipo="error">{error ?? 'No se pudo cargar tu jornada de hoy.'}</Aviso>
        <Boton titulo="Reintentar" variante="marino" onPress={reintentar} />
      </>
    )
  }

  const faltaRostro = estado.rostro_requerido && !estado.rostro_registrado
  const puedeMarcar = estado.dispositivo === 'este' && !faltaRostro && !!estado.siguiente
  // Hoy no le toca trabajar: el botón se ve, pero opaco y sin poder tocarse. Si le toca (p. ej. un sábado), Talento Humano
  // le habilita ese día en su horario.
  const noLaborable = estado.dia_laborable === false
  return (
    <>
      <AvisoSincronizacion />
      {sinConexion && (
        <Aviso tipo="aviso">Mostramos lo último que guardamos de tu jornada. Se actualizará cuando vuelvas a tener internet.</Aviso>
      )}
      <Tarjeta2>
        <ZonaDeMarcacion zona={zona.estado} onReintentar={medir} />
        {puedeMarcar && (
          <BotonAccion
            titulo={verboDeTipo(estado.siguiente!)}
            deshabilitado={noLaborable}
            onPress={() => router.push({ pathname: '/marcar', params: { tipo: estado.siguiente! } })}
          />
        )}
        {noLaborable && (
          <Aviso tipo="aviso">
            {estado.motivo_no_laborable ?? 'Hoy no es un día laborable para ti.'} Si te toca trabajar hoy, pide a Talento Humano que habilite este día en tu horario.
          </Aviso>
        )}
        {estado.dispositivo === 'este' && !faltaRostro && !estado.siguiente && (
          <Aviso tipo="ok">Completaste tus cuatro marcaciones de hoy. ¡Buen trabajo!</Aviso>
        )}
        {zona.estado.fase === 'lista' && !zona.estado.zona.dentro && !zona.estado.zona.permite_fuera && puedeMarcar && !noLaborable && (
          <Text style={estilos.nota}>Puedes marcar desde aquí, pero quedará una observación para revisión.</Text>
        )}
      </Tarjeta2>

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
      {estado.dispositivo === 'este' && avisoClave && <Aviso tipo="aviso">{avisoClave}</Aviso>}

      <View style={estilos.estadisticas}>
        <Dato etiqueta="Jornada" valor={estado.jornada ? `${estado.jornada.inicio} – ${estado.jornada.fin}` : '—'} />
        <Dato etiqueta="Marcaciones hoy" valor={`${estado.marcaciones.length} de ${TIPOS.length}`} />
      </View>

      <MarcacionesDeHoy estado={estado} />
      {estado.ultima && (
        <Tarjeta2 estilo={estilos.ultima}>
          <IconoCirculo simbolo={simboloDeTipo(estado.ultima.tipo)} />
          <View style={{ flex: 1 }}>
            <Text style={estilos.ultimaEtiqueta}>Última marcación</Text>
            <Text style={estilos.ultimaTexto}>{nombreDeTipo(estado.ultima.tipo)} · {cuandoFue(estado.ultima.fecha_hora)}</Text>
          </View>
          {estado.ultima.en_cola
            ? <Chip texto="Por enviar" tono="aviso" tamano="chico" />
            : <Chip texto="Sincronizado" tono="ok" tamano="chico" />}
        </Tarjeta2>
      )}
    </>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.dato}>
      <Text style={estilos.datoEtiqueta}>{etiqueta.toUpperCase()}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  )
}

function MarcacionesDeHoy({ estado }: { estado: EstadoHoy }) {
  const hechas = new Map(estado.marcaciones.map((m) => [m.tipo, m]))
  return (
    <Tarjeta2 estilo={{ gap: 10 }}>
      <Text style={estilos.tituloCard}>Tu jornada de hoy</Text>
      {TIPOS.map(({ tipo, nombre }) => {
        const m = hechas.get(tipo)
        return (
          <View key={tipo} style={estilos.fila}>
            <Text style={[estilos.filaNombre, !m && { color: colores.etiqueta }]}>{nombre}</Text>
            <Text style={[estilos.filaHora, { color: m ? (m.en_cola ? colores.aviso : colores.ok) : colores.etiqueta }]}>
              {m ? (m.en_cola ? `↑ ${horaLocal(m.fecha_hora)} · por enviar` : `✓ ${horaLocal(m.fecha_hora)}`) : 'Pendiente'}
            </Text>
          </View>
        )
      })}
    </Tarjeta2>
  )
}

/** Chip de perímetro, mapa de la zona y dónde estás, como la tarjeta principal del mockup (con un mapa real en vez del dibujo). */
function ZonaDeMarcacion({ zona, onReintentar }: { zona: EstadoZona; onReintentar: () => void }) {
  const lista = zona.fase === 'lista' ? zona : null
  const chip = lista
    ? lista.zona.dentro ? { texto: 'Dentro del perímetro', tono: 'ok' as Tono } : { texto: 'Fuera del perímetro', tono: 'aviso' as Tono }
    : CHIP_ZONA[zona.fase]
  const z = lista?.zona
  const lugar = z ? (z.lugar ?? z.sede) : null
  return (
    <>
      <View style={estilos.filaChips}>
        <Chip texto={chip.texto} tono={chip.tono} />
        {lista?.precision_m != null && <Text style={estilos.gps}>GPS ±{Math.round(lista.precision_m)} m</Text>}
        {zona.fase === 'sin_conexion' && zona.precision_m != null && <Text style={estilos.gps}>GPS ±{Math.round(zona.precision_m)} m</Text>}
      </View>
      {zona.fase === 'buscando' && <EsqueletoMapa />}
      {z?.centro && z.radio_m != null && (
        <MapaGeocerca datos={{ centro: z.centro, radio_m: z.radio_m, usuario: lista!.posicion, dentro: z.dentro }} />
      )}
      {z && lugar && (
        <View style={{ gap: 2 }}>
          <Text style={estilos.lugar}>
            {z.dentro || z.distancia_m == null ? `Estás en ${lugar}` : `A ${formatoDistancia(z.distancia_m)} de ${lugar}`}
          </Text>
          <Text style={estilos.distancia}>{detalleDeZona(z)}</Text>
        </View>
      )}
      {zona.fase === 'sin_conexion' && (
        <Text style={estilos.distancia}>
          Tu ubicación por GPS está lista, pero sin internet no podemos comprobar la zona. Puedes marcar: se verificará al enviarla.
        </Text>
      )}
      {zona.fase === 'error' && (
        <>
          <Text style={estilos.distancia}>{zona.mensaje}</Text>
          <Boton titulo="Reintentar ubicación" variante="borde" onPress={onReintentar} />
        </>
      )}
    </>
  )
}

function detalleDeZona(z: Zona): string {
  if (z.dentro) return z.distancia_m != null && z.radio_m != null ? `A ${z.distancia_m} m del centro · radio ${z.radio_m} m` : 'Dentro de tu zona de marcación'
  if (z.permite_fuera) return 'Tu sede permite marcar fuera de la zona.'
  return z.radio_m != null ? `Acércate a menos de ${z.radio_m} m del centro; si marcas desde aquí quedará una observación.` : 'Acércate a tu sede para marcar sin observación.'
}

const estilos = StyleSheet.create({
  filaChips: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gps: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta },
  lugar: { fontFamily: fuentes.extranegrita, fontSize: 19, color: colores.marino },
  distancia: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
  nota: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.aviso, textAlign: 'center' },
  estadisticas: { flexDirection: 'row', gap: 12 },
  dato: { flex: 1, backgroundColor: colores.blanco, borderRadius: 18, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 4 },
  datoEtiqueta: { fontFamily: fuentes.extranegrita, fontSize: 11, letterSpacing: 0.8, color: colores.etiqueta },
  datoValor: { fontFamily: fuentes.extranegrita, fontSize: 18, color: colores.marino },
  tituloCard: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.marino },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filaNombre: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.marino },
  filaHora: { fontFamily: fuentes.negrita, fontSize: 14 },
  ultima: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  ultimaEtiqueta: { fontFamily: fuentes.extranegrita, fontSize: 11, letterSpacing: 0.8, color: colores.etiqueta, textTransform: 'uppercase' },
  ultimaTexto: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
})
