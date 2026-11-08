import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as TeclaReact } from 'react'
import { Link } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Esqueleto } from '../../components/Esqueleto'
import { useNotificar } from '../../components/Toasts'
import { Aviso, Chip } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { ExportarDialogo } from './ExportarDialogo'
import { SECCIONES_EXPORT, seccionesPorOmision, textoDeSeccion, type FormatoExportar, type SeccionExport } from './exportarSecciones'
import { ESTADOS, TIPOS_ANOMALIA, caso, fechaHora, nombreDeTipo, type EstadoAnomalia } from './anomaliasTipos'
import { BarraEstados, BarrasHorizontales, ColumnasDobles, ColumnasTiempo, TituloGrafica } from './GraficasReporte'
import { ComoSeCalcula } from './ComoSeCalcula'
import { FichaPersona } from './FichaPersona'
import { usePatrones } from './patrones'
import { PanelLateral } from './PanelLateral'
import { PatronesRevisar } from './PatronesRevisar'
import { PLANTILLAS, PLANTILLA_INICIAL, plantillaDe, type SeccionReporte } from './plantillas'
import { BarraFiltros, EsqueletoIndicadores, IndicadorCompacto, avisoRangoLargo, botonPagina, selector, tarjeta } from './PiezasReporte'
import { ReporteImpresion, type DatosImpresion } from './ReporteImpresion'
import {
  POR_PAGINA_REPORTE, consultarHistorico, datosParaIA, franjaDe, resolucionDe, traerTodoElHistorico,
  type DatosResumen, type FilaHistorico, type FiltrosHistorico,
} from './reportesDatos'
import { excelDelReporte } from './reportesExcel'
import { aCsv, descargarBinario, descargarTexto, nombreDeArchivo } from './reportesExportar'
import { diasEntre, limitesDelRango } from './reportesPeriodo'
import { columnasPorHora, filasPorSede, filasPorTipo, tendenciaDelPeriodo } from './reportesVista'
import { SedeContraSede } from './SedeContraSede'
import { useComparativoSedes } from './sedesComparar'
import { tarjetaDe, type IdIndicador } from './tarjetasIndicadores'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'
import { useNumerosReporte } from './useNumerosReporte'
import { TIPO_XLSX } from './xlsx'

const COLUMNAS = '@4xl:grid @4xl:grid-cols-[minmax(0,.6fr)_minmax(0,.9fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,1.2fr)] @4xl:gap-3'
const botonSecundario = 'rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo'

const esEstado = (v: string | null): v is EstadoAnomalia => !!v && v in ESTADOS

// ---------------------------------------------------------------------------------------------------------------------
// Resumen ejecutivo: lo redacta la IA a partir de los números ya agregados. Si falla, el resto del reporte sigue igual.
// ---------------------------------------------------------------------------------------------------------------------

type EstadoResumen = { tipo: 'inactivo' } | { tipo: 'cargando' } | { tipo: 'listo'; texto: string } | { tipo: 'error'; mensaje: string }

function useResumenIA(datos: DatosResumen | null) {
  const [estado, setEstado] = useState<EstadoResumen>({ tipo: 'inactivo' })
  const cache = useRef(new Map<string, string>())      // el mismo reporte no vuelve a gastar una llamada a la IA
  const pedido = useRef(0)                            // solo vale la respuesta del último pedido
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
  }, [datos, clave])

  useEffect(() => {
    if (!datos || datos.total === 0) { pedido.current++; setEstado({ tipo: 'inactivo' }); return }
    void generar(false)
  }, [datos, generar])

  return { estado, reintentar: () => generar(true) }
}

interface PropsResumen { estado: EstadoResumen; alReintentar: () => void; alcance: string; sinCasos: boolean }

/**
 * El resumen lo redacta la IA con las cifras ya agregadas y solo las describe: no decide nada. Se pide una vez al abrir el periodo;
 * si falla, el resto del reporte sigue igual y se puede reintentar.
 */
function TarjetaResumen({ estado, alReintentar, alcance, sinCasos }: PropsResumen) {
  return (
    <section aria-label="Resumen ejecutivo" className={`${tarjeta} border-l-4 border-l-ambar`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="rounded-md bg-marino px-2 py-1 text-[11px] font-extrabold tracking-wide text-white">IA</span>
        <h2 className="text-[15px] font-extrabold text-marino">Resumen ejecutivo</h2>
        <p className="text-xs font-semibold text-etiqueta">Redactado por IA a partir de las cifras · {alcance}</p>
      </div>
      <div className="mt-3.5">
        {sinCasos && <p className="text-sm font-semibold text-texto-suave">No hubo anomalías en este periodo: no hay nada que resumir.</p>}
        {!sinCasos && estado.tipo === 'cargando' && (
          <div role="status" aria-label="Redactando el resumen" className="space-y-2">
            <Esqueleto className="h-3.5 w-full" /><Esqueleto className="h-3.5 w-[92%]" /><Esqueleto className="h-3.5 w-[60%]" />
          </div>
        )}
        {!sinCasos && estado.tipo === 'listo' && <p className="whitespace-pre-line text-[15px] font-semibold leading-relaxed text-texto">{estado.texto}</p>}
        {!sinCasos && estado.tipo === 'error' && (
          <Aviso tipo="aviso">
            {estado.mensaje}. El resto del reporte no depende del resumen.{' '}
            <button type="button" onClick={alReintentar} className="font-extrabold underline">Reintentar</button>
          </Aviso>
        )}
        {!sinCasos && estado.tipo === 'inactivo' && <Esqueleto className="h-3.5 w-full" />}
        {!sinCasos && <p className="mt-3 text-xs font-bold text-etiqueta">La IA sugiere; la decisión es de una persona.</p>}
      </div>
    </section>
  )
}

/** Una parte del reporte que empieza cerrada: se ve el título y una línea de lo que trae, y se abre solo si hace falta. */
function Plegable({ titulo, resumen, children }: { titulo: string; resumen: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-[14px] border border-borde-suave bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5 flex-none text-marino transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        <span className="text-sm font-extrabold text-marino">{titulo}</span>
        <span className="text-xs font-semibold text-etiqueta">{resumen}</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  )
}

/**
 * Reportes: el corte histórico de un periodo (semana, mes o rango) y, si se quiere, de una sola sede. Lo que se ve vive en
 * la dirección de la página, así que se puede recargar o compartir el enlace y queda igual. Los números los cuenta la base de
 * datos (`reporte_anomalias`), el resumen lo redacta la IA con esos números y la tabla se pide página a página.
 */
export default function Reportes() {
  const f = useFiltrosPeriodo()
  const { params, rango, demasiado, nombrePeriodo, sedeId, sedeNombre, cambiar } = f
  const notificar = useNotificar()
  const plantilla = plantillaDe(params.get('plantilla'))
  const ve = (seccion: SeccionReporte) => plantilla.secciones.includes(seccion)
  const enMas = (seccion: SeccionReporte) => !!plantilla.masAnalisis?.includes(seccion)
  const estado: '' | EstadoAnomalia = esEstado(params.get('estado')) ? (params.get('estado') as EstadoAnomalia) : ''
  const tipo = TIPOS_ANOMALIA.some((t) => t.valor === params.get('tipo')) ? (params.get('tipo') as string) : ''
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina'))) || 1)
  const vista: 'resumen' | 'casos' = params.get('vista') === 'casos' ? 'casos' : 'resumen'
  const [panel, setPanel] = useState<'ficha' | 'calculo' | null>(null)
  const cerrarPanel = useCallback(() => setPanel(null), [])
  const [exportAbierto, setExportAbierto] = useState(false)
  const cerrarExport = useCallback(() => setExportAbierto(false), [])

  // --- los números del periodo (y los del periodo anterior, para comparar) ---
  const { numeros, indicadores, error: errorNumeros, reintentar } = useNumerosReporte(rango, sedeId, demasiado)

  // --- la tabla histórica ---
  const filtros: FiltrosHistorico = useMemo(() => ({ rango, sedeId, estado, tipo }), [rango, sedeId, estado, tipo])
  const [historico, setHistorico] = useState<{ filas: FilaHistorico[]; total: number } | null>(null)
  const [cargandoTabla, setCargandoTabla] = useState(true)
  const [errorTabla, setErrorTabla] = useState<string | null>(null)
  useEffect(() => {
    if (demasiado || vista !== 'casos') return
    let vigente = true
    setCargandoTabla(true)
    consultarHistorico(filtros, pagina)
      .then((r) => { if (vigente) { setHistorico(r); setErrorTabla(null) } })
      .catch(() => { if (vigente) { setHistorico(null); setErrorTabla('No se pudo cargar la tabla histórica') } })
      .finally(() => { if (vigente) setCargandoTabla(false) })
    return () => { vigente = false }
  }, [filtros, pagina, demasiado, vista])

  const totalTabla = historico?.total ?? 0
  const paginas = Math.max(1, Math.ceil(totalTabla / POR_PAGINA_REPORTE))
  // Si la dirección pide una página que ya no existe (se cambió un filtro, o se escribió a mano), se va a la última.
  useEffect(() => {
    if (!cargandoTabla && historico && historico.filas.length === 0 && historico.total > 0 && pagina > 1) {
      cambiar({ pagina: paginas > 1 ? String(paginas) : null }, { reemplazar: true })
    }
  }, [cargandoTabla, historico, pagina, paginas, cambiar])

  // --- el resumen con IA: solo con los números ya agregados, y solo mientras se ve el resumen ---
  const enResumen = vista === 'resumen'
  const alcance = `${nombrePeriodo} · ${sedeNombre ?? 'todas las sedes'}`
  const datosIA = useMemo(
    () => (numeros && indicadores ? datosParaIA(nombrePeriodo, sedeNombre, numeros.actual, indicadores) : null),
    [numeros, indicadores, nombrePeriodo, sedeNombre],
  )
  const resumen = useResumenIA(enResumen && ve('resumen') ? datosIA : null)

  // --- sede contra sede y patrones: se piden si se ven, o si se abre el cuadro de exportar (para poder incluirlos) ---
  const comparativo = useComparativoSedes(rango, f.sedes, ((enResumen && ve('comparativo')) || exportAbierto) && !sedeId && !demasiado)
  const { patrones, error: errorPatrones, reintentar: reintentarPatrones } = usePatrones(sedeId, ((enResumen && ve('patrones')) || exportAbierto) && !demasiado)

  const elegirPlantilla = (id: string) => {
    const p = plantillaDe(id)
    cambiar({ plantilla: p.id === PLANTILLA_INICIAL.id ? null : p.id, tipo: p.tipo ?? null, estado: null, vista: null })
  }

  // --- exportar ---
  const [exportando, setExportando] = useState<FormatoExportar | null>(null)
  const [impresion, setImpresion] = useState<DatosImpresion | null>(null)
  const filtrosEnPalabras = [estado && `Estado: ${ESTADOS[estado].texto}`, tipo && `Tipo: ${nombreDeTipo(tipo)}`].filter(Boolean).join(' · ')

  /** Deja constancia en Auditoría de quién sacó qué reporte. Si no se pudo anotar, el archivo ya salió: solo se avisa. */
  const anotarExportacion = async (formato: FormatoExportar, casos: number, secciones: SeccionExport[], conResumen: boolean) => {
    const limites = limitesDelRango(rango)
    try {
      const { error } = await supabase.rpc('registrar_exportacion', {
        p_formato: formato, p_desde: limites.desde, p_hasta: limites.hasta, p_sede: sedeId || null, p_casos: casos,
        p_resumen: conResumen ? 'con_resumen' : 'sin_resumen', p_secciones: secciones.map(textoDeSeccion).join(', '),
      })
      if (error) throw error
    } catch {
      notificar('aviso', 'El archivo salió, pero no se pudo anotar la exportación en Auditoría')
    }
  }

  const exportar = async (formato: FormatoExportar, elegidas: SeccionExport[]) => {
    const a = numeros?.actual
    if (!a || !indicadores) return
    const lleva = new Set<SeccionExport>(formato === 'csv' ? ['tabla'] : elegidas)
    setExportando(formato)
    try {
      // Solo se trae todo el histórico si el archivo lleva la tabla.
      const { filas, total, recortado } = lleva.has('tabla') ? await traerTodoElHistorico(filtros) : { filas: [], total: a.total, recortado: false }
      const textoResumen = lleva.has('resumen') && resumen.estado.tipo === 'listo' ? resumen.estado.texto : null
      const sedes = lleva.has('comparativo') ? comparativo.filas : null
      const patronesExport = lleva.has('patrones') ? patrones : null
      const secciones = SECCIONES_EXPORT.map((x) => x.id).filter((id) => lleva.has(id) && (id !== 'resumen' || textoResumen !== null))
      const nota = (nombre: string) => (recortado ? `El ${nombre} trae los primeros ${filas.length} de ${total} casos. ${nombre === 'PDF' ? 'Para todos, exporta el CSV' : 'Acota el periodo para exportar el resto'}` : null)
      if (formato === 'csv') {
        descargarTexto(nombreDeArchivo(rango.desde, rango.hasta, 'csv'), aCsv(filas))
        if (recortado) notificar('aviso', `El CSV trae los primeros ${filas.length} de ${total} casos. Acota el periodo para exportar el resto`)
        else notificar('ok', `CSV listo: ${filas.length} ${filas.length === 1 ? 'caso' : 'casos'}`)
      } else if (formato === 'xlsx') {
        descargarBinario(nombreDeArchivo(rango.desde, rango.hasta, 'xlsx'), excelDelReporte({
          periodo: nombrePeriodo, sede: sedeNombre ?? 'Todas las sedes', filtros: filtrosEnPalabras, agregado: a, indicadores,
          comparativo: sedes, secciones: lleva, resumen: textoResumen, patrones: patronesExport,
          filas, total, recortado, generado: new Date(),
        }), TIPO_XLSX)
        const aviso = nota('Excel')
        if (aviso) notificar('aviso', aviso)
        else notificar('ok', lleva.has('tabla') ? `Excel listo: ${filas.length} ${filas.length === 1 ? 'caso' : 'casos'}` : 'Excel listo')
      } else {
        setImpresion({
          periodo: nombrePeriodo, sede: sedeNombre ?? 'Todas las sedes', filtros: filtrosEnPalabras, secciones: lleva,
          resumen: textoResumen, comparativo: sedes, patrones: patronesExport,
          agregado: a, indicadores, filas, total, recortado, dias: diasEntre(rango),
        })
        const aviso = nota('PDF')
        if (aviso) notificar('aviso', aviso)
      }
      setExportAbierto(false)
      await anotarExportacion(formato, total, secciones, textoResumen !== null)
    } catch {
      notificar('error', 'No se pudo preparar la exportación. Intenta de nuevo')
    } finally {
      setExportando(null)
    }
  }

  /** Lo que no se puede incluir ahora, con el motivo: el cuadro de exportar lo muestra apagado. */
  const noDisponibles: Partial<Record<SeccionExport, string>> = {}
  if (resumen.estado.tipo !== 'listo') noDisponibles.resumen = enResumen && ve('resumen') ? 'aún no está listo' : 'ábrelo desde «Resumen»'
  if (sedeId) noDisponibles.comparativo = 'quita el filtro de sede'
  else if (!comparativo.hay) noDisponibles.comparativo = 'hacen falta dos sedes'
  else if (comparativo.error) noDisponibles.comparativo = 'no se pudo calcular'
  else if (!comparativo.filas) noDisponibles.comparativo = 'calculando…'
  if (!patrones) noDisponibles.patrones = errorPatrones ? 'no se pudo cargar' : 'cargando…'

  const hayFiltrosTabla = !!(estado || tipo)
  const desdeFila = (pagina - 1) * POR_PAGINA_REPORTE
  const a = numeros?.actual ?? null
  const tendencia = useMemo(() => (a ? tendenciaDelPeriodo(a, diasEntre(rango)) : null), [a, rango])

  // Las pestañas son las plantillas y, al final, la tabla de casos. La activa sale de la dirección.
  const pestanas = [...PLANTILLAS.map((p) => ({ id: p.id, texto: p.corto })), { id: 'casos', texto: `Casos del periodo${a ? ` (${a.total})` : ''}` }]
  const pestanaActiva = vista === 'casos' ? 'casos' : plantilla.id
  const irA = (id: string) => (id === 'casos' ? cambiar({ vista: 'casos' }) : elegirPlantilla(id))
  const teclasPestanas = (e: TeclaReact<HTMLDivElement>) => {
    const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!paso) return
    e.preventDefault()
    const otra = pestanas[(pestanas.findIndex((pe) => pe.id === pestanaActiva) + paso + pestanas.length) % pestanas.length]!
    irA(otra.id)
    document.getElementById(`pestana-${otra.id}`)?.focus()
  }
  /** La dirección de «Casos del periodo» con los filtros que se piden: de ahí se llega al tocar un indicador, un estado o un tipo. */
  const enlaceCasos = (filtro: { estado?: string; tipo?: string } = {}) => {
    const q = new URLSearchParams(params)
    q.set('vista', 'casos')
    q.delete('pagina')
    if (filtro.estado) q.set('estado', filtro.estado); else q.delete('estado')
    if (filtro.tipo) q.set('tipo', filtro.tipo); else q.delete('tipo')
    return `?${q.toString()}`
  }
  const enlaceDe = (id: IdIndicador): { to: string; texto: string } => {
    switch (id) {
      case 'anomalias': return { to: enlaceCasos(), texto: `Ver los ${a?.total ?? ''} casos`.replace('  ', ' ') }
      case 'aTiempo': return { to: enlaceCasos({ estado: 'sin_justificar' }), texto: 'Ver los sin justificar' }
      case 'puntualidad': return { to: enlaceCasos({ tipo: 'fuera_horario' }), texto: 'Ver los fuera de horario' }
      case 'rechazo': return { to: enlaceCasos({ tipo: 'verificacion_fallida' }), texto: 'Ver las verificaciones fallidas' }
      case 'porResolver': return { to: enlaceCasos({ estado: 'en_revision' }), texto: 'Ver los en revisión' }
      case 'resolucion': return { to: enlaceCasos(), texto: 'Ver los casos' }
    }
  }
  const nIndicadores = plantilla.indicadores?.length ?? 0
  const columnasIndicadores = nIndicadores >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : nIndicadores === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
  const conTipo = ve('tipo') && !!a && a.total > 0
  const conTendencia = ve('tendencia') && !!a && a.total > 0 && !!tendencia
  const conEstado = ve('estado') && !!a && a.total > 0
  const conResumen = ve('resumen') && !errorNumeros
  const horaAbierta = ve('hora') && !enMas('hora')
  const bloqueHora = (a && indicadores) ? (
    <section className={`${tarjeta} flex flex-col ${sedeId || !ve('sede') || enMas('hora') ? 'lg:col-span-2' : ''}`}>
      <TituloGrafica detalle={indicadores.horaPico ? `La franja con más casos: ${franjaDe(indicadores.horaPico.hora)} (${indicadores.horaPico.total})` : 'Hora de Ecuador en que se detectó cada caso'}>Casos por hora del día</TituloGrafica>
      <ColumnasTiempo {...columnasPorHora(a)} />
    </section>
  ) : null
  const bloqueComparativo = comparativo.hay
    ? <SedeContraSede filas={comparativo.filas} error={comparativo.error} onReintentar={comparativo.reintentar} />
    : sedeId && <Aviso tipo="aviso">«Sede contra sede» compara todas las sedes: quita el filtro de sede para verlo.</Aviso>
  const resumenSedes = sedeId ? 'quita el filtro de sede para compararlas' : a && a.por_sede.length > 0 ? a.por_sede.map((x) => `${x.sede ?? 'Sin sede'} ${x.total}`).join(' · ') : 'Sin casos'
  const resumenPatrones = !patrones ? (errorPatrones ? 'no se pudo cargar' : 'cargando…') : patrones.length === 0 ? 'nadie con 3 o más casos' : `${patrones.length} ${patrones.length === 1 ? 'persona' : 'personas'} con 3 o más casos en 30 días`

  return (
    <>
      <EncabezadoPagina titulo="Reportes" detalle={`Histórico de anomalías · ${nombrePeriodo}${sedeNombre ? ` · ${sedeNombre}` : ''}${vista === 'resumen' && plantilla.id !== PLANTILLA_INICIAL.id ? ` · ${plantilla.nombre}` : ''}`}
        pie={
          <div role="tablist" aria-label="Partes del reporte" onKeyDown={teclasPestanas} className="flex gap-1 overflow-x-auto px-4 sm:px-7">
            {pestanas.map((pe) => {
              const activa = pe.id === pestanaActiva
              return (
                <button key={pe.id} id={`pestana-${pe.id}`} role="tab" type="button" aria-selected={activa} tabIndex={activa ? 0 : -1} onClick={() => irA(pe.id)}
                  className={`-mb-px flex-none whitespace-nowrap border-b-[3px] px-3 pb-3 pt-1 text-sm font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-celeste ${pe.id === 'casos' ? 'ml-auto' : ''} ${
                    activa ? 'border-ambar text-marino' : 'border-transparent text-texto-suave hover:text-marino'}`}>
                  {pe.texto}
                </button>
              )
            })}
          </div>
        }>
        <button type="button" aria-haspopup="dialog" aria-expanded={panel === 'ficha'} onClick={() => setPanel('ficha')} className={botonSecundario}>Ficha por persona</button>
        <button type="button" aria-haspopup="dialog" aria-expanded={panel === 'calculo'} onClick={() => setPanel('calculo')} className={botonSecundario}>Cómo se calcula</button>
        <button type="button" aria-haspopup="dialog" aria-expanded={exportAbierto} disabled={!a || a.total === 0 || demasiado || exportando !== null} onClick={() => setExportAbierto(true)}
          className="rounded-[11px] bg-ambar px-4 py-2.5 text-[13px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 disabled:opacity-50 max-sm:w-full">
          {exportando ? 'Preparando…' : 'Exportar'}
        </button>
      </EncabezadoPagina>

      <div className="space-y-5 p-4 sm:p-7">
        <BarraFiltros f={f} />

        {demasiado && <Aviso tipo="error">{avisoRangoLargo}</Aviso>}
        {errorNumeros && !demasiado && (
          <Aviso tipo="error">
            {errorNumeros}.{' '}
            <button type="button" onClick={reintentar} className="underline">Reintentar</button>
          </Aviso>
        )}

        {!demasiado && (
          <>
            {vista === 'resumen' && <>
            {!a && !errorNumeros && <EsqueletoIndicadores cantidad={2} />}
            {a && indicadores && ve('indicadores') && plantilla.indicadores && (
              <section aria-label="Indicadores del periodo" className={`grid grid-cols-2 gap-2.5 ${columnasIndicadores}`}>
                {plantilla.indicadores.map((id) => <IndicadorCompacto key={id} {...tarjetaDe(id, indicadores)} enlace={enlaceDe(id)} />)}
              </section>
            )}

            {(conResumen || (indicadores && conEstado)) && (
              <div className={`grid items-stretch gap-3.5 ${conResumen && conEstado ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}>
                {conResumen && <TarjetaResumen estado={resumen.estado} alReintentar={() => void resumen.reintentar()} alcance={alcance} sinCasos={!!a && a.total === 0} />}
                {a && indicadores && conEstado && (
                  <section className="rounded-[14px] border border-borde-suave bg-white px-4 py-3 shadow-[0_2px_8px_rgba(27,42,110,.04)]">
                    <TituloGrafica detalle="Toca uno para ver sus casos">Cómo va cada caso</TituloGrafica>
                    <BarraEstados porEstado={a.por_estado} total={a.total} enlace={(e) => enlaceCasos({ estado: e })} />
                  </section>
                )}
              </div>
            )}

            {a && indicadores && (
              <>
                {ve('comparativo') && !enMas('comparativo') && bloqueComparativo}

                {ve('patrones') && !enMas('patrones') && <PatronesRevisar patrones={patrones} error={errorPatrones} onReintentar={reintentarPatrones} />}

                {(conTendencia || conTipo) && (
                  <div className="grid items-stretch gap-5 lg:grid-cols-3">
                    {conTendencia && tendencia && (
                      <section className={`${tarjeta} flex flex-col ${conTipo ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
                        <TituloGrafica detalle={`Por ${tendencia.granularidad === 'dia' ? 'día' : 'semana'} · las justificadas son de las detectadas`}>Tendencia de anomalías</TituloGrafica>
                        <ColumnasDobles columnas={tendencia.columnas} resumen={tendencia.resumen} cadaEtiqueta={tendencia.cadaEtiqueta} />
                      </section>
                    )}
                    {conTipo && (
                      <section className={`${tarjeta} ${conTendencia ? '' : 'lg:col-span-3'}`}>
                        <TituloGrafica detalle={indicadores.tipoTop ? `El más frecuente: ${nombreDeTipo(indicadores.tipoTop.tipo)}` : undefined}>Anomalías por tipo</TituloGrafica>
                        <BarrasHorizontales filas={filasPorTipo(a)} total={a.total} enlace={(t) => enlaceCasos({ tipo: t })} />
                      </section>
                    )}
                  </div>
                )}

                {a.total > 0 && (ve('sede') || horaAbierta) && (
                  <div className="grid items-stretch gap-5 lg:grid-cols-2">
                    {ve('sede') && !sedeId && (
                      <section className={tarjeta}>
                        <TituloGrafica detalle={indicadores.sedeTop ? `La que más casos tuvo: ${indicadores.sedeTop.sede}` : undefined}>Por sede</TituloGrafica>
                        <BarrasHorizontales filas={filasPorSede(a)} total={a.total} />
                      </section>
                    )}
                    {horaAbierta && bloqueHora}
                  </div>
                )}

                {(enMas('comparativo') || enMas('hora') || enMas('patrones')) && (
                  <section aria-label="Más análisis" className="space-y-2.5">
                    <h2 className="text-sm font-extrabold text-texto-suave">Más análisis</h2>
                    {enMas('comparativo') && <Plegable titulo="Sede contra sede" resumen={resumenSedes}>{bloqueComparativo}</Plegable>}
                    {enMas('hora') && a.total > 0 && (
                      <Plegable titulo="¿Cuándo ocurren?" resumen={indicadores.horaPico ? `La franja con más casos: ${franjaDe(indicadores.horaPico.hora)}` : 'Sin casos'}>{bloqueHora}</Plegable>
                    )}
                    {enMas('patrones') && (
                      <Plegable titulo="Patrones a revisar" resumen={resumenPatrones}>
                        <PatronesRevisar patrones={patrones} error={errorPatrones} onReintentar={reintentarPatrones} />
                      </Plegable>
                    )}
                  </section>
                )}
              </>
            )}

            </>}

            {/* Tabla histórica */}
            {vista === 'casos' && <section aria-label="Histórico de anomalías" className="space-y-3">
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
            </section>}
          </>
        )}
      </div>

      <PanelLateral titulo="Ficha por persona" abierto={panel === 'ficha'} alCerrar={cerrarPanel}><FichaPersona sedes={f.sedes} /></PanelLateral>
      <PanelLateral titulo="Cómo se calcula" abierto={panel === 'calculo'} alCerrar={cerrarPanel}><ComoSeCalcula /></PanelLateral>

      {exportAbierto && (
        <ExportarDialogo alcance={alcance} inicial={seccionesPorOmision(plantilla, vista)} noDisponibles={noDisponibles} ocupado={exportando} alCerrar={cerrarExport} alDescargar={exportar} />
      )}

      {impresion && <ReporteImpresion datos={impresion} alTerminar={() => setImpresion(null)} />}
    </>
  )
}
