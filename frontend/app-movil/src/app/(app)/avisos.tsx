import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton } from '../../components/ui'
import { EsqueletoLista } from '../../components/Esqueleto'
import { BotonAccion, Chip, IconoCirculo, PantallaPestana, Seccion, Tarjeta2 } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import {
  type Anomalia, esUrgente, estadoVisible, etiquetaDia, fechaCorta, iconoDeAnomalia, listarAnomalias, nombreDeAnomalia, porVencer, textoCaso, tiempoRestante,
} from '../../lib/anomalias'
import { guardarAnomalias, leerAnomalias } from '../../lib/offline/cacheAnomalias'
import { useSincronizacion } from '../../lib/offline/SincronizacionContext'
import { colores, fuentes } from '../../theme'

/** Pestaña Avisos (M5 del mockup): las anomalías que esperan explicación y, debajo, las anteriores. */
export default function Avisos() {
  const router = useRouter()
  const { usuarioId } = useSincronizacion()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sinConexion, setSinConexion] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const nueva = await listarAnomalias()
      setLista(nueva)
      setSinConexion(false)
      if (usuarioId) void guardarAnomalias(usuarioId, nueva)
    } catch (e) {
      // Sin red se muestra lo último que se pudo ver; sin esa copia no hay nada que mostrar.
      if (e instanceof ApiError && e.status === 0 && usuarioId) {
        const copia = await leerAnomalias(usuarioId)
        if (copia) {
          const ahora = Date.now()
          // El plazo siguió corriendo mientras no hubo internet: se vuelve a calcular con la hora de ahora.
          setLista(copia.map((a) => ({ ...a, puede_justificar: a.estado === 'pendiente' && new Date(a.vence).getTime() > ahora })))
          setSinConexion(true)
          return
        }
      }
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus avisos.')
    }
  }, [usuarioId])
  useFocusEffect(useCallback(() => { void cargar() }, [cargar]))

  const abrir = (id: string) => router.push({ pathname: '/justificar', params: { id } })
  // Lo más urgente primero: el caso que vence antes. Las listas de abajo conservan el orden del servidor (lo más reciente primero).
  const porExplicar = (lista ?? []).filter((a) => a.puede_justificar).sort(porVencer)
  const enRevision = (lista ?? []).filter((a) => !a.puede_justificar && a.estado === 'en_revision')
  const anteriores = (lista ?? []).filter((a) => !a.puede_justificar && a.estado !== 'en_revision')
  const subtitulo =
    lista === null ? undefined
    : porExplicar.length === 0 ? 'No tienes anomalías por explicar'
    : porExplicar.length === 1 ? '1 anomalía requiere tu explicación'
    : `${porExplicar.length} anomalías requieren tu explicación`

  return (
    <PantallaPestana titulo="Avisos" subtitulo={subtitulo} alRefrescar={cargar}>
      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <Boton titulo="Reintentar" variante="marino" onPress={cargar} />
        </>
      )}
      {sinConexion && <Aviso tipo="aviso">Mostramos lo último que guardamos de tus avisos. Para explicar un caso necesitas internet.</Aviso>}
      {!error && lista === null && <EsqueletoLista etiqueta="Cargando tus avisos" />}
      {!error && lista?.length === 0 && (
        <Tarjeta2><Text style={estilos.vacio}>No tienes avisos. ¡Todo en orden!</Text></Tarjeta2>
      )}

      {porExplicar.map((a) => <TarjetaAviso key={a.id} a={a} onExplicar={() => abrir(a.id)} onDespues={() => router.navigate('/')} />)}

      {enRevision.length > 0 && <GrupoDeFilas titulo="En revisión" filas={enRevision} onAbrir={abrir} />}
      {anteriores.length > 0 && <GrupoDeFilas titulo="Anteriores" filas={anteriores} onAbrir={abrir} />}
    </PantallaPestana>
  )
}

/** Un grupo de casos que ya no esperan a la persona: cada fila dice qué pasó (chip de color) y lleva al caso. */
function GrupoDeFilas({ titulo, filas, onAbrir }: { titulo: string; filas: Anomalia[]; onAbrir: (id: string) => void }) {
  return (
    <>
      <Seccion texto={titulo} />
      <View style={estilos.listaBlanca}>
        {filas.map((a, i) => {
          const estado = estadoVisible(a)
          return (
            <Pressable
              key={a.id}
              accessibilityRole="button"
              accessibilityLabel={`${textoCaso(a.caso)}, ${nombreDeAnomalia(a.tipo)}`}
              onPress={() => onAbrir(a.id)}
              style={[estilos.fila, i > 0 && estilos.filaConBorde]}
            >
              <IconoCirculo simbolo={iconoDeAnomalia(a.tipo)} />
              <View style={{ flex: 1 }}>
                <Text style={estilos.filaTitulo}>{nombreDeAnomalia(a.tipo)}</Text>
                <Text style={estilos.filaSub}>{fechaCorta(a.creada)} · {textoCaso(a.caso)}</Text>
              </View>
              <Chip texto={estado.texto} tono={estado.tono} tamano="chico" />
            </Pressable>
          )
        })}
      </View>
    </>
  )
}

function TarjetaAviso({ a, onExplicar, onDespues }: { a: Anomalia; onExplicar: () => void; onDespues: () => void }) {
  const resta = tiempoRestante(a.vence)
  const urgente = esUrgente(a.vence)
  return (
    <View style={estilos.tarjetaAviso}>
      <View style={estilos.encabezado}>
        <IconoCirculo simbolo="!" tono="aviso" tamano={48} />
        <View style={{ flex: 1 }}>
          <Text style={estilos.avisoTitulo}>{nombreDeAnomalia(a.tipo)}</Text>
          <Text style={estilos.avisoSub}>{etiquetaDia(a.creada)} h · {textoCaso(a.caso)}</Text>
        </View>
        <View style={estilos.punto} />
      </View>
      {a.detalle ? <Text style={estilos.cuerpo}>{a.detalle}</Text> : null}
      {resta && <Text style={[estilos.plazo, urgente && estilos.plazoUrgente]}>Te quedan {resta} para explicarlo</Text>}
      <BotonAccion titulo="Explicar" onPress={onExplicar} />
      <Pressable accessibilityRole="button" accessibilityLabel="Ahora no" onPress={onDespues} hitSlop={8}>
        <Text style={estilos.despues}>Ahora no</Text>
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
  plazo: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.aviso },
  plazoUrgente: { color: colores.error },
  despues: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.etiqueta, textAlign: 'center' },
  listaBlanca: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15 },
  filaConBorde: { borderTopWidth: 1, borderTopColor: colores.lienzo },
  filaTitulo: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
  filaSub: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.etiqueta },
})
