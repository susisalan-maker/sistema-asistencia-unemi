import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Aviso, Boton } from '../../components/ui'
import { EsqueletoLista } from '../../components/Esqueleto'
import { Chip, IconoCirculo, PantallaPestana, Tarjeta2 } from '../../components/pestanas'
import { ApiError } from '../../lib/api'
import {
  type Anomalia, esUrgente, estadoVisible, fechaCorta, grupoDeDia, grupoDeSemana, iconoDeAnomalia, listarAnomalias, nombreDeAnomalia, textoCaso, tiempoRestante,
} from '../../lib/anomalias'
import { horaLocal } from '../../lib/marcacion'
import { esResultado, marcarVisto, novedadesDeAvisos } from '../../lib/avisosVistos'
import { guardarAnomalias, leerAnomalias } from '../../lib/offline/cacheAnomalias'
import { useSincronizacion } from '../../lib/offline/SincronizacionContext'
import { colores, fuentes } from '../../theme'

type Filtro = 'explicar' | 'revision' | 'resueltos'
/** Cómo se filtran los resueltos: por resultado. */
type Resultado = 'todos' | 'justificada' | 'rechazada' | 'sin_justificar'
const RESULTADOS: { clave: Resultado; texto: string }[] = [
  { clave: 'todos', texto: 'Todos' },
  { clave: 'justificada', texto: 'Justificadas' },
  { clave: 'rechazada', texto: 'Rechazadas' },
  { clave: 'sin_justificar', texto: 'Sin justificar' },
]
/** Cuántos casos resueltos se ven de entrada y cuántos más trae cada «Ver más». */
const VISIBLES = 5
const MAS = 10
/** Los filtros por resultado solo aparecen cuando hay bastantes casos: con pocos estorban. */
const MIN_PARA_FILTRAR = 10

/** Un caso resuelto es «justificada», «rechazada» o, si venció sin explicarse, «sin justificar». */
const resultadoDe = (a: Anomalia): Exclude<Resultado, 'todos'> =>
  a.estado === 'justificada' ? 'justificada' : a.estado === 'rechazada' ? 'rechazada' : 'sin_justificar'

const porMasNuevo = (a: Anomalia, b: Anomalia) => new Date(b.creada).getTime() - new Date(a.creada).getTime()

/** Pestaña Avisos: un filtro a la vez (por explicar, en revisión, resueltos), lo más nuevo primero. */
export default function Avisos() {
  const router = useRouter()
  const { usuarioId } = useSincronizacion()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sinConexion, setSinConexion] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('explicar')
  const [visibles, setVisibles] = useState(VISIBLES)
  const [resultado, setResultado] = useState<Resultado>('todos')
  const [novedades, setNovedades] = useState<Set<string>>(new Set())

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const nueva = await listarAnomalias()
      setLista(nueva)
      setSinConexion(false)
      if (usuarioId) {
        void guardarAnomalias(usuarioId, nueva)
        setNovedades(await novedadesDeAvisos(usuarioId, nueva))
      }
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

  const abrir = (id: string) => {
    const caso = lista?.find((a) => a.id === id)
    if (usuarioId && caso && esResultado(caso)) void marcarVisto(usuarioId, id, caso.estado)
    setNovedades((n) => { if (!n.has(id)) return n; const nuevo = new Set(n); nuevo.delete(id); return nuevo })
    router.push({ pathname: '/justificar', params: { id } })
  }
  // Lo más nuevo primero; lo urgente se nota en el plazo (en rojo), no en el orden.
  const porExplicar = (lista ?? []).filter((a) => a.puede_justificar).sort(porMasNuevo)
  const enRevision = (lista ?? []).filter((a) => !a.puede_justificar && a.estado === 'en_revision').sort(porMasNuevo)
  const resueltos = (lista ?? []).filter((a) => !a.puede_justificar && a.estado !== 'en_revision').sort(porMasNuevo)
  const conFiltros = resueltos.length > MIN_PARA_FILTRAR
  // Si la lista se achica y los filtros desaparecen, se vuelve a ver todo.
  const resultadoActivo = conFiltros ? resultado : 'todos'
  const resueltosVisibles = resueltos.filter((a) => resultadoActivo === 'todos' || resultadoDe(a) === resultadoActivo)
  const nuevosResueltos = resueltos.filter((a) => novedades.has(a.id)).length
  const subtitulo =
    lista === null ? undefined
    : porExplicar.length === 0 ? 'No tienes observaciones por explicar'
    : porExplicar.length === 1 ? '1 observación requiere tu explicación'
    : `${porExplicar.length} observaciones requieren tu explicación`

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

      {lista && lista.length > 0 && (
        <>
          <View accessibilityRole="tablist" accessibilityLabel="Filtro de avisos" style={estilos.selector}>
            {([['explicar', 'Por explicar', porExplicar.length], ['revision', 'En revisión', enRevision.length], ['resueltos', 'Resueltos', resueltos.length]] as const).map(([clave, texto, n]) => (
              <Pressable
                key={clave} accessibilityRole="tab"
                accessibilityLabel={`${texto}, ${n}${clave === 'resueltos' && nuevosResueltos > 0 ? `, ${nuevosResueltos} ${nuevosResueltos === 1 ? 'novedad' : 'novedades'}` : ''}`}
                accessibilityState={{ selected: filtro === clave }}
                onPress={() => setFiltro(clave)} style={[estilos.opcion, filtro === clave && estilos.opcionActiva]}
              >
                <Text style={[estilos.opcionTexto, filtro === clave && { color: colores.blanco }]} numberOfLines={1}>{texto}</Text>
                <View style={[estilos.cuenta, filtro === clave && n > 0 && { backgroundColor: colores.ambar }]}><Text style={estilos.cuentaTexto}>{n}</Text></View>
                {clave === 'resueltos' && nuevosResueltos > 0 && <View testID="punto-resueltos" style={estilos.puntoNuevo} />}
              </Pressable>
            ))}
          </View>

          {filtro === 'explicar' && (
            porExplicar.length === 0
              ? <Tarjeta2><Text style={estilos.vacio}>No tienes observaciones por explicar.</Text></Tarjeta2>
              : <ListaAgrupada casos={porExplicar} grupo={(a) => grupoDeDia(a.creada)} fila={(a, borde) => <FilaPorExplicar key={a.id} a={a} borde={borde} onExplicar={() => abrir(a.id)} />} />
          )}
          {filtro === 'revision' && (
            enRevision.length === 0
              ? <Tarjeta2><Text style={estilos.vacio}>No tienes casos en revisión.</Text></Tarjeta2>
              : <ListaAgrupada casos={enRevision} grupo={(a) => grupoDeDia(a.creada)} fila={(a, borde) => <FilaCerrada key={a.id} a={a} borde={borde} onAbrir={() => abrir(a.id)} />} />
          )}
          {filtro === 'resueltos' && (
            resueltos.length === 0
              ? <Tarjeta2><Text style={estilos.vacio}>Aún no tienes casos resueltos.</Text></Tarjeta2>
              : (
                <>
                  {conFiltros && (
                    <View accessibilityRole="radiogroup" accessibilityLabel="Filtrar por resultado" style={estilos.chips}>
                      {RESULTADOS.filter((r) => r.clave === 'todos' || resueltos.some((a) => resultadoDe(a) === r.clave)).map((r) => {
                        const activo = resultadoActivo === r.clave
                        const n = r.clave === 'todos' ? resueltos.length : resueltos.filter((a) => resultadoDe(a) === r.clave).length
                        return (
                          <Pressable
                            key={r.clave} accessibilityRole="radio" accessibilityLabel={`${r.texto}, ${n}`} accessibilityState={{ selected: activo }}
                            onPress={() => { setResultado(r.clave); setVisibles(VISIBLES) }} style={[estilos.chipFiltro, activo && estilos.chipFiltroActivo]}
                          >
                            <Text style={[estilos.chipFiltroTexto, activo && { color: colores.blanco }]}>{r.texto} · {n}</Text>
                          </Pressable>
                        )
                      })}
                    </View>
                  )}
                  <ListaAgrupada
                    casos={resueltosVisibles.slice(0, visibles)} grupo={(a) => grupoDeSemana(a.creada)}
                    fila={(a, borde) => <FilaCerrada key={a.id} a={a} borde={borde} nueva={novedades.has(a.id)} onAbrir={() => abrir(a.id)} />}
                  />
                  {resueltosVisibles.length > visibles && <Boton titulo="Ver más" variante="borde" onPress={() => setVisibles((v) => v + MAS)} />}
                </>
              )
          )}
        </>
      )}
    </PantallaPestana>
  )
}

/** Una tarjeta blanca con los casos agrupados bajo un encabezado (Hoy, Ayer, Esta semana…). Los casos llegan ya ordenados. */
function ListaAgrupada({ casos, grupo, fila }: { casos: Anomalia[]; grupo: (a: Anomalia) => string; fila: (a: Anomalia, conBorde: boolean) => ReactNode }) {
  const grupos: { titulo: string; casos: Anomalia[] }[] = []
  for (const a of casos) {
    const t = grupo(a)
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.titulo === t) ultimo.casos.push(a)
    else grupos.push({ titulo: t, casos: [a] })
  }
  return (
    <View style={estilos.listaBlanca}>
      {grupos.map((g) => (
        <View key={g.titulo}>
          <Text accessibilityRole="header" style={estilos.encabezadoGrupo}>{g.titulo.toUpperCase()}</Text>
          {g.casos.map((a, i) => fila(a, i > 0))}
        </View>
      ))}
    </View>
  )
}

/** Un caso que espera tu explicación: qué pasó, cuándo y cuánto plazo queda, con el botón para explicarlo. */
function FilaPorExplicar({ a, borde, onExplicar }: { a: Anomalia; borde: boolean; onExplicar: () => void }) {
  const resta = tiempoRestante(a.vence)
  const urgente = esUrgente(a.vence)
  return (
    <View style={[estilos.fila, borde && estilos.filaConBorde]}>
      <IconoCirculo simbolo="!" tono="aviso" tamano={40} />
      <View style={{ flex: 1 }}>
        <Text style={estilos.filaTitulo}>{nombreDeAnomalia(a.tipo)}</Text>
        <Text style={estilos.filaSub}>{horaLocal(a.creada)} · {textoCaso(a.caso)}</Text>
        {resta ? <Text style={[estilos.plazo, urgente && estilos.plazoUrgente]}>Te quedan {resta}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Explicar: ${nombreDeAnomalia(a.tipo)}, ${textoCaso(a.caso)}`} onPress={onExplicar} style={estilos.botonExplicar}>
        <Text style={estilos.botonExplicarTexto}>Explicar</Text>
      </Pressable>
    </View>
  )
}

/** Un caso que ya no espera a la persona: dice cómo quedó (chip de color) y lleva al caso. */
function FilaCerrada({ a, borde, nueva = false, onAbrir }: { a: Anomalia; borde: boolean; nueva?: boolean; onAbrir: () => void }) {
  const estado = estadoVisible(a)
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={`${textoCaso(a.caso)}, ${nombreDeAnomalia(a.tipo)}${nueva ? ', resultado nuevo' : ''}`}
      onPress={onAbrir} style={[estilos.fila, borde && estilos.filaConBorde]}
    >
      <IconoCirculo simbolo={iconoDeAnomalia(a.tipo)} tamano={40} />
      <View style={{ flex: 1 }}>
        <View style={estilos.tituloConPunto}>
          {nueva && <View testID="punto-nuevo" style={estilos.puntoNuevo} />}
          <Text style={[estilos.filaTitulo, { flexShrink: 1 }]}>{nombreDeAnomalia(a.tipo)}</Text>
        </View>
        <Text style={estilos.filaSub}>{fechaCorta(a.creada)} · {textoCaso(a.caso)}</Text>
      </View>
      <Chip texto={estado.texto} tono={estado.tono} tamano="chico" />
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  vacio: { fontFamily: fuentes.seminegrita, fontSize: 15, color: colores.textoSuave, textAlign: 'center' },
  selector: { flexDirection: 'row', backgroundColor: '#dfe5ef', borderRadius: 14, padding: 4, gap: 4 },
  opcion: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, paddingHorizontal: 2 },
  opcionActiva: { backgroundColor: colores.marino },
  opcionTexto: { fontFamily: fuentes.negrita, fontSize: 12, color: colores.texto },
  cuenta: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#dde3ec' },
  cuentaTexto: { fontFamily: fuentes.extranegrita, fontSize: 11, color: '#20180a' },
  puntoNuevo: { width: 9, height: 9, borderRadius: 5, backgroundColor: colores.ambar },
  tituloConPunto: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipFiltro: { minHeight: 44, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  chipFiltroActivo: { backgroundColor: colores.marino, borderColor: colores.marino },
  chipFiltroTexto: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.texto },
  listaBlanca: { backgroundColor: colores.blanco, borderRadius: 20, borderWidth: 1, borderColor: colores.bordeSuave, paddingHorizontal: 16, paddingBottom: 4 },
  encabezadoGrupo: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.textoSuave, paddingTop: 14, paddingBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 64 },
  filaConBorde: { borderTopWidth: 1, borderTopColor: colores.lienzo },
  filaTitulo: { fontFamily: fuentes.extranegrita, fontSize: 15, lineHeight: 19, color: colores.marino },
  filaSub: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave, marginTop: 1 },
  plazo: { fontFamily: fuentes.extranegrita, fontSize: 12, color: colores.aviso, marginTop: 1 },
  plazoUrgente: { color: colores.error },
  botonExplicar: { minHeight: 44, minWidth: 84, borderRadius: 12, backgroundColor: colores.ambar, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  botonExplicarTexto: { fontFamily: fuentes.extranegrita, fontSize: 14, color: '#20180a' },
})
