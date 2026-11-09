import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { EsqueletoLista } from '../../components/Esqueleto'
import { Aviso, Boton } from '../../components/ui'
import { Chip, IconoCirculo, PantallaPestana, Seccion, Tarjeta2 } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import { cargarHistorial, type Historial as HistorialDatos } from '../../lib/historial'
import { horaLocal, hoyLocal, iconoDeTipo, nombreDeTipo, rotuloDeDia, TIPOS } from '../../lib/marcacion'
import { useSincronizacion } from '../../lib/offline/SincronizacionContext'
import { colores, fuentes } from '../../theme'

const PERIODOS = [7, 30] as const
const ESTADO_ANOMALIA: Record<string, string> = {
  pendiente: 'abierta', en_revision: 'en revisión', justificada: 'justificada', rechazada: 'rechazada', sin_justificar: 'sin justificar',
}

/** Pestaña Historial (M4 del mockup): agrupado por día; se elige entre los últimos 7 o 30 días. Una observación abierta se toca para explicarla. */
export default function Historial() {
  const router = useRouter()
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(7)
  const [datos, setDatos] = useState<HistorialDatos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { pendientes, version } = useSincronizacion()

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setDatos(await cargarHistorial(dias))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar tu historial.')
    }
  }, [dias])
  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))
  useEffect(() => { if (version > 0) void cargar() }, [version, cargar])

  const subtitulo = datos ? `Últimos ${dias} días · ${datos.total} ${datos.total === 1 ? 'marcación' : 'marcaciones'}` : `Últimos ${dias} días`
  return (
    <PantallaPestana titulo="Historial" subtitulo={subtitulo} alRefrescar={cargar}>
      <View accessibilityRole="tablist" accessibilityLabel="Período" style={estilos.selector}>
        {PERIODOS.map((p) => (
          <Pressable
            key={p} accessibilityRole="tab" accessibilityLabel={`${p} días`} accessibilityState={{ selected: dias === p }}
            onPress={() => { if (p !== dias) { setDatos(null); setDias(p) } }}
            style={[estilos.opcion, dias === p && estilos.opcionActiva]}
          >
            <Text style={[estilos.opcionTexto, dias === p && { color: colores.blanco }]}>{p} días</Text>
          </Pressable>
        ))}
      </View>
      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton titulo="Reintentar" variante="marino" onPress={cargar} />
        </>
      )}
      {!error && !datos && <EsqueletoLista etiqueta="Cargando tu historial" />}
      {pendientes.length > 0 && (
        <View style={{ gap: 10 }}>
          <Seccion texto="Por enviar" />
          <View style={estilos.lista}>
            {pendientes.map((p, i) => (
              <View key={p.id} style={[estilos.fila, i > 0 && estilos.filaConBorde]}>
                <IconoCirculo icono="subida" tono="aviso" />
                <View style={{ flex: 1 }}>
                  <Text style={estilos.titulo}>{nombreDeTipo(p.tipo)} {horaLocal(p.fecha_hora)}</Text>
                  <Text style={estilos.sub}>{rotuloDeDia(hoyLocal(new Date(p.fecha_hora)))} · guardada en tu celular</Text>
                </View>
                <Chip texto="Por enviar" tono="aviso" tamano="chico" />
              </View>
            ))}
          </View>
        </View>
      )}
      {!error && datos?.total === 0 && pendientes.length === 0 && (
        <Tarjeta2><Text style={estilos.vacio}>Aún no tienes marcaciones en los últimos {dias} días.</Text></Tarjeta2>
      )}
      {datos?.dias.map((dia) => (
        <View key={dia.fecha} style={{ gap: 10 }}>
          <View style={estilos.cabeceraDia}>
            <View style={{ flex: 1 }}><Seccion texto={rotuloDeDia(dia.fecha)} /></View>
            <Text style={estilos.resumenDia}>{`${dia.marcaciones.length} de ${TIPOS.length}`}</Text>
          </View>
          <View style={estilos.lista}>
            {dia.marcaciones.map((m, i) => {
              const abrible = !!m.anomalia?.id
              const contenido = (
                <>
                  <IconoCirculo icono={m.anomalia ? 'alerta' : iconoDeTipo(m.tipo)} tono={m.anomalia ? 'aviso' : 'celeste'} />
                  <View style={{ flex: 1 }}>
                    <Text style={estilos.titulo}>{nombreDeTipo(m.tipo)} {horaLocal(m.fecha_hora)}</Text>
                    {m.lugar ? <Text style={estilos.sub}>{m.lugar}</Text> : null}
                    {m.anomalia && (
                      <Text style={estilos.anomalia}>Observación {ESTADO_ANOMALIA[m.anomalia.estado] ?? m.anomalia.estado}{abrible ? ' · toca para ver' : ''}</Text>
                    )}
                  </View>
                  {/* Solo se marca lo que no es lo normal: una marcación enviada sin conexión. */}
                  {m.sin_conexion && <Chip texto="Enviada sin conexión" tono="aviso" tamano="chico" />}
                </>
              )
              const estiloFila = [estilos.fila, i > 0 && estilos.filaConBorde]
              return abrible ? (
                <Pressable
                  key={m.id} accessibilityRole="button"
                  accessibilityLabel={`${nombreDeTipo(m.tipo)} ${horaLocal(m.fecha_hora)}, observación ${ESTADO_ANOMALIA[m.anomalia!.estado] ?? m.anomalia!.estado}. Abrir`}
                  onPress={() => router.push({ pathname: '/justificar', params: { id: m.anomalia!.id! } })}
                  style={estiloFila}
                >
                  {contenido}
                </Pressable>
              ) : (
                <View key={m.id} style={estiloFila}>{contenido}</View>
              )
            })}
          </View>
        </View>
      ))}
    </PantallaPestana>
  )
}

const estilos = StyleSheet.create({
  selector: { flexDirection: 'row', backgroundColor: '#dfe5ef', borderRadius: 14, padding: 4, gap: 4 },
  opcion: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  opcionActiva: { backgroundColor: colores.marino },
  opcionTexto: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.texto },
  cabeceraDia: { flexDirection: 'row', alignItems: 'flex-end' },
  resumenDia: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.textoSuave, paddingRight: 4 },
  vacio: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave, textAlign: 'center' },
  lista: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14 },
  filaConBorde: { borderTopWidth: 1, borderTopColor: colores.lienzo },
  titulo: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
  sub: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
  anomalia: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.aviso },
})
