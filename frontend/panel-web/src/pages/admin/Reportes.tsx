import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Esqueleto } from '../../components/Esqueleto'
import { useNotificar } from '../../components/Toasts'
import { Aviso, Chip } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { hoyEcuador } from './anomaliasConsulta'
import { ESTADOS, TIPOS_ANOMALIA, caso, fechaHora, nombreDeTipo, type EstadoAnomalia } from './anomaliasTipos'
import { BarraEstados, BarrasHorizontales, ColumnasTiempo, TituloGrafica } from './GraficasReporte'
import { ReporteImpresion, type DatosImpresion } from './ReporteImpresion'
import {
  POR_PAGINA_REPORTE, calcularIndicadores, consultarAgregado, consultarHistorico, datosParaIA, franjaDe, resolucionDe, traerTodoElHistorico,
  type AgregadoReporte, type DatosResumen, type FilaHistorico, type FiltrosHistorico, type Indicadores,
} from './reportesDatos'
import { aCsv, descargarTexto, nombreDeArchivo } from './reportesExportar'
import {
  MAXIMO_DIAS, PERIODOS, PERIODO_INICIAL, diasDelRango, diasEntre, esDia, moverReferencia, nombreDelPeriodo, periodoAnterior, rangoDe,
  type Periodo,
} from './reportesPeriodo'
import { coma, columnasPorDia, columnasPorHora, filasPorSede, filasPorTipo, textoVariacion } from './reportesVista'

const selector = 'rounded-[11px] border border-borde bg-white px-3 py-2.5 text-[13px] font-bold text-marino outline-none focus:border-marino'
const tarjeta = 'rounded-[18px] border border-borde-suave bg-white p-5 shadow-[0_2px_8px_rgba(27,42,110,.04)]'
const botonPagina = 'rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40'
const COLUMNAS = '@4xl:grid @4xl:grid-cols-[minmax(0,.6fr)_minmax(0,.9fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.2fr)] @4xl:gap-3'
const ENFRIAMIENTO_MS = 8000

const esPeriodo = (v: string | null): v is Periodo => PERIODOS.some((p) => p.valor === v)
const esEstado = (v: string | null): v is EstadoAnomalia => !!v && v in ESTADOS

interface Sede { id: string; nombre: string }

// ---------------------------------------------------------------------------------------------------------------------
// Resumen ejecutivo: lo redacta la IA a partir de los números ya agregados. Si falla, el resto del reporte sigue igual.
// ---------------------------------------------------------------------------------------------------------------------

type EstadoResumen = { tipo: 'inactivo' } | { tipo: 'cargando' } | { tipo: 'listo'; texto: string } | { tipo: 'error'; mensaje: string }

function useResumenIA(datos: DatosResumen | null) {
  const [estado, setEstado] = useState<EstadoResumen>({ tipo: 'inactivo' })
  const [enfriando, setEnfriando] = useState(false)
  const cache = useRef(new Map<string, string>())      // el mismo reporte no vuelve a gastar una llamada a la IA
  const pedido = useRef(0)                            // solo vale la respuesta del último pedido
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clave = datos ? JSON.stringify(datos) : null

  const generar = useCallback(async (forzar: boolean) => {
    if (!datos || !clave) return
    const guardado = cache.current.get(clave)
    if (!forzar && guardado) { setEstado({ tipo: 'listo', texto: guardado }); return }
    const id = ++pedido.current
    setEstado({ tipo: 'cargando' })
    try {
      const r = await api<{ resumen: string }>('/reportes/resumen', { method: 'POST', body: datos })
      cache.current.set(clave, r.resumen)
      if (id === pedido.current) setEstado({ tipo: 'listo', texto: r.resumen })
    } catch (e) {
      if (id === pedido.current) setEstado({ tipo: 'error', mensaje: e instanceof ApiError ? e.message : 'No se pudo generar el resumen' })
    }
    if (forzar) {
      setEnfriando(true)
      if (temporizador.current) clearTimeout(temporizador.current)
      temporizador.current = setTimeout(() => setEnfriando(false), ENFRIAMIENTO_MS)
    }
  }, [datos, clave])

  useEffect(() => {
    if (!datos || datos.total === 0) { pedido.current++; setEstado({ tipo: 'inactivo' }); return }
    void generar(false)
  }, [datos, generar])
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current) }, [])

  return { estado, enfriando, regenerar: () => generar(true) }
}

function TarjetaResumen({ estado, enfriando, alRegenerar, alcance, sinCasos }: {
  estado: EstadoResumen; enfriando: boolean; alRegenerar: () => void; alcance: string; sinCasos: boolean
}) {
  const ocupado = estado.tipo === 'cargando'
  return (
    <section aria-label="Resumen ejecutivo" className={`${tarjeta} border-l-4 border-l-ambar`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-md bg-marino px-2 py-1 text-[11px] font-extrabold tracking-wide text-white">IA</span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-marino">Resumen ejecutivo</h2>
          <p className="text-xs font-semibold text-etiqueta">Generado por IA · {alcance}</p>
        </div>
        {!sinCasos && estado.tipo !== 'inactivo' && (
          <button type="button" onClick={alRegenerar} disabled={ocupado || enfriando}
            className="ml-auto rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-50">
            {ocupado ? 'Redactando…' : estado.tipo === 'error' ? 'Reintentar' : 'Regenerar'}
          </button>
        )}
      </div>
      <div className="mt-3.5">
        {sinCasos && <p className="text-sm font-semibold text-texto-suave">No hubo anomalías en este periodo: no hay nada que resumir.</p>}
        {!sinCasos && estado.tipo === 'cargando' && (
          <div role="status" aria-label="Redactando el resumen" className="space-y-2">
            <Esqueleto className="h-3.5 w-full" /><Esqueleto className="h-3.5 w-[92%]" /><Esqueleto className="h-3.5 w-[60%]" />
          </div>
        )}
        {!sinCasos && estado.tipo === 'listo' && <p className="whitespace-pre-line text-[15px] font-semibold leading-relaxed text-texto">{estado.texto}</p>}
        {!sinCasos && estado.tipo === 'error' && <Aviso tipo="aviso">{estado.mensaje}. El resto del reporte no depende del resumen.</Aviso>}
        {!sinCasos && estado.tipo === 'inactivo' && <Esqueleto className="h-3.5 w-full" />}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------------

function Indicador({ titulo, valor, detalle, aviso }: { titulo: string; valor: string; detalle: string; aviso?: boolean }) {
  return (
    <div className={tarjeta}>
      <p className="text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta">{titulo}</p>
      <p className="mt-1.5 text-[28px] font-extrabold leading-none tracking-tight text-marino">{valor}</p>
      <p className={`mt-2 text-xs font-semibold ${aviso ? 'text-aviso' : 'text-texto-suave'}`}>{detalle}</p>
    </div>
  )
}

function EsqueletoIndicadores() {
  return (
    <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((i) => <div key={i} className={tarjeta}><Esqueleto className="h-3 w-24" /><Esqueleto className="mt-3 h-7 w-20" /><Esqueleto className="mt-3 h-3 w-40" /></div>)}
    </div>
  )
}

function MenuExportar({ deshabilitado, ocupado, alExportar }: { deshabilitado: boolean; ocupado: 'csv' | 'pdf' | null; alExportar: (f: 'csv' | 'pdf') => void }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const afuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', afuera)
    window.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', afuera); window.removeEventListener('keydown', tecla) }
  }, [abierto])
  const opcion = 'flex w-full flex-col items-start rounded-lg px-3 py-2.5 text-left hover:bg-lienzo'
  return (
    <div ref={caja} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={abierto} disabled={deshabilitado || ocupado !== null} onClick={() => setAbierto((a) => !a)}
        className="rounded-[11px] bg-ambar px-4 py-2.5 text-[13px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 disabled:opacity-50 max-sm:w-full">
        {ocupado ? 'Preparando…' : 'Exportar ▾'}
      </button>
      {abierto && (
        <div role="menu" aria-label="Exportar el periodo" className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-borde bg-white p-1.5 shadow-[0_12px_28px_rgba(27,42,110,.18)] max-sm:left-0 max-sm:w-auto">
          <button role="menuitem" type="button" className={opcion} onClick={() => { setAbierto(false); alExportar('pdf') }}>
            <span className="text-sm font-extrabold text-marino">Exportar PDF</span>
            <span className="text-xs font-semibold text-etiqueta">Resumen + gráficas + tabla histórica</span>
          </button>
          <button role="menuitem" type="button" className={opcion} onClick={() => { setAbierto(false); alExportar('csv') }}>
            <span className="text-sm font-extrabold text-marino">Exportar CSV</span>
            <span className="text-xs font-semibold text-etiqueta">Solo la tabla histórica (Excel)</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Reportes: el corte histórico de un periodo (semana, mes o rango) y, si se quiere, de una sola sede. Lo que se ve vive en
 * la dirección de la página, así que se puede recargar o compartir el enlace y queda igual. Los números los cuenta la base de
 * datos (`reporte_anomalias`), el resumen lo redacta la IA con esos números y la tabla se pide página a página.
 */
export default function Reportes() {
  const [params, setParams] = useSearchParams()
  const notificar = useNotificar()
  const hoy = hoyEcuador()

  const periodo: Periodo = esPeriodo(params.get('periodo')) ? (params.get('periodo') as Periodo) : PERIODO_INICIAL
  const referencia = esDia(params.get('ref')) ? params.get('ref') : null
  const desdeTexto = params.get('desde')
  const hastaTexto = params.get('hasta')
  // Solo depende de lo que define las fechas: si dependiera de `params` entero, filtrar por estado, tipo o página
  // lo recalcularía y se volverían a pedir las cifras y las gráficas, no solo la tabla.
  const rango = useMemo(
    () => rangoDe(periodo, referencia, desdeTexto, hastaTexto, hoy),
    [periodo, referencia, desdeTexto, hastaTexto, hoy],
  )
  const demasiado = diasDelRango(rango) > MAXIMO_DIAS
  const estado: '' | EstadoAnomalia = esEstado(params.get('estado')) ? (params.get('estado') as EstadoAnomalia) : ''
  const tipo = TIPOS_ANOMALIA.some((t) => t.valor === params.get('tipo')) ? (params.get('tipo') as string) : ''
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina'))) || 1)

  const [sedes, setSedes] = useState<Sede[] | null>(null)
  const sedePedida = params.get('sede') ?? ''
  const sedeId = sedes === null || sedePedida === '' || sedes.some((s) => s.id === sedePedida) ? sedePedida : ''
  const sedeNombre = sedes?.find((s) => s.id === sedeId)?.nombre ?? null

  /** Cambia una o varias partes de la dirección; lo que vale lo de siempre no se escribe. Al cambiar un filtro se vuelve a la página 1. */
  const cambiar = useCallback((cambios: Record<string, string | null>, opciones: { reemplazar?: boolean } = {}) => {
    setParams((actual) => {
      const nuevo = new URLSearchParams(actual)
      const sinPagina = !('pagina' in cambios)
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === '') nuevo.delete(k)
        else nuevo.set(k, v)
      }
      if (sinPagina) nuevo.delete('pagina')
      return nuevo
    }, { replace: opciones.reemplazar ?? false })
  }, [setParams])

  useEffect(() => {
    let vigente = true
    supabase.from('sedes').select('id, nombre').order('nombre').then(({ data }) => { if (vigente) setSedes((data ?? []) as Sede[]) })
    return () => { vigente = false }
  }, [])

  // --- los números del periodo (y los del periodo anterior, para comparar) ---
  const [numeros, setNumeros] = useState<{ actual: AgregadoReporte; anterior: AgregadoReporte | null } | null>(null)
  const [errorNumeros, setErrorNumeros] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  useEffect(() => {
    if (demasiado) return
    let vigente = true
    setNumeros(null)
    setErrorNumeros(null)
    Promise.allSettled([consultarAgregado(rango, sedeId), consultarAgregado(periodoAnterior(rango), sedeId)]).then(([actual, anterior]) => {
      if (!vigente) return
      if (actual.status === 'rejected') { setErrorNumeros('No se pudieron cargar los números del reporte'); return }
      setNumeros({ actual: actual.value, anterior: anterior.status === 'fulfilled' ? anterior.value : null })
    })
    return () => { vigente = false }
  }, [rango, sedeId, demasiado, reintento])
  const indicadores: Indicadores | null = useMemo(() => (numeros ? calcularIndicadores(numeros.actual, numeros.anterior) : null), [numeros])

  // --- la tabla histórica ---
  const filtros: FiltrosHistorico = useMemo(() => ({ rango, sedeId, estado, tipo }), [rango, sedeId, estado, tipo])
  const [historico, setHistorico] = useState<{ filas: FilaHistorico[]; total: number } | null>(null)
  const [cargandoTabla, setCargandoTabla] = useState(true)
  const [errorTabla, setErrorTabla] = useState<string | null>(null)
  useEffect(() => {
    if (demasiado) return
    let vigente = true
    setCargandoTabla(true)
    consultarHistorico(filtros, pagina)
      .then((r) => { if (vigente) { setHistorico(r); setErrorTabla(null) } })
      .catch(() => { if (vigente) { setHistorico(null); setErrorTabla('No se pudo cargar la tabla histórica') } })
      .finally(() => { if (vigente) setCargandoTabla(false) })
    return () => { vigente = false }
  }, [filtros, pagina, demasiado])

  const totalTabla = historico?.total ?? 0
  const paginas = Math.max(1, Math.ceil(totalTabla / POR_PAGINA_REPORTE))
  // Si la dirección pide una página que ya no existe (se cambió un filtro, o se escribió a mano), se va a la última.
  useEffect(() => {
    if (!cargandoTabla && historico && historico.filas.length === 0 && historico.total > 0 && pagina > 1) {
      cambiar({ pagina: paginas > 1 ? String(paginas) : null }, { reemplazar: true })
    }
  }, [cargandoTabla, historico, pagina, paginas, cambiar])

  // --- el resumen con IA: solo con los números ya agregados ---
  const nombrePeriodo = nombreDelPeriodo(periodo, rango)
  const alcance = `${nombrePeriodo} · ${sedeNombre ?? 'todas las sedes'}`
  const datosIA = useMemo(
    () => (numeros && indicadores ? datosParaIA(nombrePeriodo, sedeNombre, numeros.actual, indicadores) : null),
    [numeros, indicadores, nombrePeriodo, sedeNombre],
  )
  const resumen = useResumenIA(datosIA)

  // --- exportar ---
  const [exportando, setExportando] = useState<'csv' | 'pdf' | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresion | null>(null)
  const filtrosEnPalabras = [estado && `Estado: ${ESTADOS[estado].texto}`, tipo && `Tipo: ${nombreDeTipo(tipo)}`].filter(Boolean).join(' · ')

  const exportar = async (formato: 'csv' | 'pdf') => {
    setExportando(formato)
    try {
      const { filas, total, recortado } = await traerTodoElHistorico(filtros)
      if (formato === 'csv') {
        descargarTexto(nombreDeArchivo(rango.desde, rango.hasta, 'csv'), aCsv(filas))
        if (recortado) notificar('aviso', `El CSV trae los primeros ${filas.length} de ${total} casos. Acota el periodo para exportar el resto`)
        else notificar('ok', `CSV listo: ${filas.length} ${filas.length === 1 ? 'caso' : 'casos'}`)
      } else if (numeros && indicadores) {
        setImpresion({
          periodo: nombrePeriodo, sede: sedeNombre ?? 'Todas las sedes', filtros: filtrosEnPalabras,
          resumen: resumen.estado.tipo === 'listo' ? resumen.estado.texto : null,
          agregado: numeros.actual, indicadores, filas, total, recortado, dias: diasEntre(rango),
        })
        if (recortado) notificar('aviso', `El PDF trae los primeros ${filas.length} de ${total} casos. Para todos, exporta el CSV`)
      }
    } catch {
      notificar('error', 'No se pudo preparar la exportación. Intenta de nuevo')
    } finally {
      setExportando(null)
    }
  }

  const hoyDentro = rango.hasta >= hoy
  const hayFiltrosTabla = !!(estado || tipo)
  const desdeFila = (pagina - 1) * POR_PAGINA_REPORTE
  const a = numeros?.actual ?? null

  return (
    <>
      <EncabezadoPagina titulo="Reportes" detalle={`Histórico de anomalías · ${nombrePeriodo}${sedeNombre ? ` · ${sedeNombre}` : ''}`}>
        <MenuExportar deshabilitado={!a || a.total === 0 || demasiado} ocupado={exportando} alExportar={exportar} />
      </EncabezadoPagina>

      <div className="space-y-5 p-4 sm:p-7">
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div role="group" aria-label="Periodo" className="flex flex-wrap gap-2">
            {PERIODOS.map((p) => (
              <button key={p.valor} type="button" aria-pressed={periodo === p.valor}
                onClick={() => cambiar(p.valor === 'rango'
                  ? { periodo: 'rango', ref: null, desde: rango.desde, hasta: rango.hasta < hoy ? rango.hasta : hoy }
                  : { periodo: p.valor === PERIODO_INICIAL ? null : p.valor, ref: null, desde: null, hasta: null })}
                className={`rounded-full border px-3.5 py-2 text-[13px] font-extrabold ${periodo === p.valor ? 'border-marino bg-marino text-white' : 'border-borde bg-white text-marino hover:bg-lienzo'}`}>
                {p.texto}
              </button>
            ))}
          </div>

          {periodo !== 'rango' ? (
            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Periodo anterior" className={botonPagina}
                onClick={() => cambiar({ ref: moverReferencia(periodo, rango.desde, -1) })}>‹</button>
              <span aria-live="polite" className="min-w-[8.5rem] text-center text-[13px] font-extrabold text-marino">{nombrePeriodo}</span>
              <button type="button" aria-label="Periodo siguiente" disabled={hoyDentro} className={botonPagina}
                onClick={() => cambiar({ ref: moverReferencia(periodo, rango.desde, 1) })}>›</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label="Desde" value={rango.desde} max={rango.hasta < hoy ? rango.hasta : hoy}
                onChange={(e) => e.target.value && cambiar({ desde: e.target.value })} className={selector} />
              <span aria-hidden="true" className="text-sm font-bold text-etiqueta">a</span>
              <input type="date" aria-label="Hasta" value={rango.hasta} min={rango.desde} max={hoy}
                onChange={(e) => e.target.value && cambiar({ hasta: e.target.value })} className={selector} />
              <span className="text-xs font-semibold text-etiqueta">{diasDelRango(rango)} {diasDelRango(rango) === 1 ? 'día' : 'días'}</span>
            </div>
          )}

          <select aria-label="Sede" value={sedeId} onChange={(e) => cambiar({ sede: e.target.value })} className={`${selector} sm:ml-auto`}>
            <option value="">Sede: todas</option>
            {(sedes ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>

        {demasiado && <Aviso tipo="error">El reporte puede abarcar como máximo {MAXIMO_DIAS} días (un año). Acorta el rango.</Aviso>}
        {errorNumeros && !demasiado && (
          <Aviso tipo="error">
            {errorNumeros}.{' '}
            <button type="button" onClick={() => setReintento((n) => n + 1)} className="underline">Reintentar</button>
          </Aviso>
        )}

        {!demasiado && (
          <>
            {!errorNumeros && <TarjetaResumen estado={resumen.estado} enfriando={resumen.enfriando} alRegenerar={() => void resumen.regenerar()} alcance={alcance}
              sinCasos={!!a && a.total === 0} />}

            {!a && !errorNumeros && <EsqueletoIndicadores />}
            {a && indicadores && (
              <>
                <section aria-label="Indicadores del periodo" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Indicador titulo="Anomalías del periodo" valor={String(indicadores.total)} detalle={textoVariacion(indicadores)} />
                  <Indicador titulo="Por cada 100 marcaciones"
                    valor={indicadores.porCada100Marcaciones === null ? '—' : coma(indicadores.porCada100Marcaciones)}
                    detalle={`${indicadores.marcaciones} ${indicadores.marcaciones === 1 ? 'marcación' : 'marcaciones'} en el periodo`} />
                  <Indicador titulo="Justificadas a tiempo"
                    valor={indicadores.aTiempoPct === null ? '—' : `${coma(indicadores.aTiempoPct)} %`}
                    detalle={indicadores.evaluadas === 0 ? 'Aún no hay casos con plazo vencido' : `${indicadores.aTiempo} de ${indicadores.evaluadas} casos con plazo vencido o justificados`} />
                  <Indicador titulo="Por resolver" valor={String(indicadores.porResolver)} detalle="En revisión o sin justificar" aviso={indicadores.porResolver > 0} />
                </section>

                {a.total > 0 && (
                  <>
                    <section className={tarjeta}>
                      <TituloGrafica detalle="Cómo va cada caso del periodo">Distribución por estado</TituloGrafica>
                      <BarraEstados porEstado={a.por_estado} total={a.total} />
                    </section>

                    <div className="grid gap-5 lg:grid-cols-2">
                      <section className={`${tarjeta} flex flex-col lg:col-span-2`}>
                        <TituloGrafica detalle={indicadores.diaPico ? `El día con más casos: ${indicadores.diaPico.dia} (${indicadores.diaPico.total})` : undefined}>Casos por día</TituloGrafica>
                        <ColumnasTiempo {...columnasPorDia(a, diasEntre(rango))} />
                      </section>
                      <section className={tarjeta}>
                        <TituloGrafica detalle={indicadores.tipoTop ? `El más frecuente: ${nombreDeTipo(indicadores.tipoTop.tipo)}` : undefined}>Por tipo de anomalía</TituloGrafica>
                        <BarrasHorizontales filas={filasPorTipo(a)} total={a.total} />
                      </section>
                      {!sedeId && (
                        <section className={tarjeta}>
                          <TituloGrafica detalle={indicadores.sedeTop ? `La que más casos tuvo: ${indicadores.sedeTop.sede}` : undefined}>Por sede</TituloGrafica>
                          <BarrasHorizontales filas={filasPorSede(a)} total={a.total} />
                        </section>
                      )}
                      <section className={`${tarjeta} flex flex-col ${sedeId ? '' : 'lg:col-span-2'}`}>
                        <TituloGrafica detalle={indicadores.horaPico ? `La franja con más casos: ${franjaDe(indicadores.horaPico.hora)} (${indicadores.horaPico.total})` : 'Hora de Ecuador en que se detectó cada caso'}>Casos por hora del día</TituloGrafica>
                        <ColumnasTiempo {...columnasPorHora(a)} />
                      </section>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Tabla histórica */}
            <section aria-label="Histórico de anomalías" className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-[17px] font-extrabold text-marino">Histórico de anomalías del periodo</h2>
                {historico && <span className="rounded-full bg-celeste px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-marino">{historico.total} {historico.total === 1 ? 'registro' : 'registros'}</span>}
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <select aria-label="Estado" value={estado} onChange={(e) => cambiar({ estado: e.target.value })} className={selector}>
                    <option value="">Estado: todos</option>
                    {(Object.keys(ESTADOS) as EstadoAnomalia[]).map((e) => <option key={e} value={e}>{ESTADOS[e].texto}</option>)}
                  </select>
                  <select aria-label="Tipo" value={tipo} onChange={(e) => cambiar({ tipo: e.target.value })} className={selector}>
                    <option value="">Tipo: todos</option>
                    {TIPOS_ANOMALIA.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
                  </select>
                  {hayFiltrosTabla && (
                    <button type="button" onClick={() => cambiar({ estado: null, tipo: null })}
                      className="rounded-[11px] border border-marino bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo">Borrar filtros</button>
                  )}
                </div>
              </div>

              {errorTabla && <Aviso tipo="error">{errorTabla}</Aviso>}
              <div aria-busy={cargandoTabla} className={`@container tabla-ancha overflow-hidden rounded-[18px] border border-borde-suave bg-white transition-opacity ${cargandoTabla && historico ? 'opacity-60' : ''}`}>
                <div className={`${COLUMNAS} tabla-cabecera border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
                  <div>Caso</div><div>Fecha</div><div>Colaborador</div><div>Tipo</div><div>Sede</div><div>Estado</div><div>Resolución</div>
                </div>
                {cargandoTabla && !historico && !errorTabla && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
                {!cargandoTabla && !errorTabla && totalTabla === 0 && (
                  <p className="p-6 text-sm font-semibold text-texto-suave">{hayFiltrosTabla ? 'No hay anomalías que coincidan con esos filtros.' : 'No hubo anomalías en este periodo.'}</p>
                )}
                {(historico?.filas ?? []).map((f) => (
                  <div key={f.id} className={`${COLUMNAS} tabla-fila items-center border-b border-lienzo px-4 py-4 text-sm font-semibold text-texto @4xl:px-5 @4xl:py-3.5`}>
                    <div data-etiqueta="Caso"><Link to={`/admin/anomalias/${f.id}`} className="font-extrabold text-marino underline-offset-2 hover:underline">{caso(f.numero)}</Link></div>
                    <div data-etiqueta="Fecha" className="text-[13px]">{fechaHora(f.created_at)}</div>
                    <div data-etiqueta="Colaborador" className="break-words font-bold text-marino @4xl:truncate">{f.colaborador ?? '—'}</div>
                    <div data-etiqueta="Tipo" className="text-[13px] @4xl:truncate" title={nombreDeTipo(f.tipo)}>{nombreDeTipo(f.tipo)}</div>
                    <div data-etiqueta="Sede" className="text-[13px] @4xl:truncate">{f.sede ?? '—'}</div>
                    <div data-etiqueta="Estado"><Chip tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</Chip></div>
                    <div data-etiqueta="Resolución" className="text-[13px]">{resolucionDe(f)}</div>
                  </div>
                ))}
                {totalTabla > 0 && <p className="px-5 py-3 text-xs font-semibold text-etiqueta">Mostrando {desdeFila + 1}–{desdeFila + (historico?.filas.length ?? 0)} de {totalTabla} · del más reciente al más antiguo</p>}
              </div>

              {paginas > 1 && (
                <nav aria-label="Páginas" className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => cambiar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : null })} disabled={pagina === 1} className={botonPagina}>‹ Anterior</button>
                  <span className="text-[13px] font-bold text-texto-suave">Página {pagina} de {paginas}</span>
                  <button type="button" onClick={() => cambiar({ pagina: String(pagina + 1) })} disabled={pagina >= paginas} className={botonPagina}>Siguiente ›</button>
                </nav>
              )}
            </section>
          </>
        )}
      </div>

      {impresion && <ReporteImpresion datos={impresion} alTerminar={() => setImpresion(null)} />}
    </>
  )
}
