import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso } from '../../components/ui'
import { useAhora } from '../../lib/useAhora'
import { EsqueletoBandeja } from './EsqueletoBandeja'
import { TarjetaAnomalia } from './TarjetaAnomalia'
import {
  FECHAS, POR_PAGINA, consultarBandeja, contarBandeja, hoyEcuador, ordenPorDefecto, ordenesDe,
  type FiltroFecha, type Orden, type ResultadoBandeja,
} from './anomaliasConsulta'
import { FILTROS, TIPOS_ANOMALIA, justificadaEn, type FiltroEstado } from './anomaliasTipos'
import { contarJustificadasHoy } from './novedadesBandeja'
import { useNovedades } from './useNovedadesBandeja'

const selectorFiltro = 'rounded-[11px] border border-borde bg-white px-3 py-2.5 text-[13px] font-bold text-marino outline-none focus:border-marino'
const ESPERA_BUSQUEDA_MS = 300

const FILTRO_INICIAL: FiltroEstado = 'por_resolver'
const esFiltro = (v: string | null): v is FiltroEstado => FILTROS.some((f) => f.valor === v)
const esFecha = (v: string | null): v is FiltroFecha => FECHAS.some((f) => f.valor === v)

/**
 * La bandeja de anomalías del administrador. Lo que se ve (estado, tipo, búsqueda, fechas, orden y página) vive en la
 * dirección de la página: al abrir un caso y volver, o al recargar o compartir el enlace, queda todo igual. Los filtros,
 * el orden y las páginas los hace el servidor, así que no hay un tope de casos.
 */
export default function Anomalias() {
  const [params, setParams] = useSearchParams()

  const filtro = esFiltro(params.get('estado')) ? (params.get('estado') as FiltroEstado) : FILTRO_INICIAL
  const tipo = TIPOS_ANOMALIA.some((t) => t.valor === params.get('tipo')) ? (params.get('tipo') as string) : ''
  const q = params.get('q') ?? ''
  const fecha = esFecha(params.get('fecha')) ? (params.get('fecha') as FiltroFecha) : 'todas'
  const desde = fecha === 'rango' ? params.get('desde') : null
  const hasta = fecha === 'rango' ? params.get('hasta') : null
  const ordenes = ordenesDe(filtro)
  const ordenPedido = params.get('orden')
  const orden: Orden = ordenes.find((o) => o.valor === ordenPedido)?.valor ?? ordenPorDefecto(filtro)
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina'))) || 1)
  const justificadaHoy = params.get('justificada') === 'hoy'
  const { desde: visita } = useNovedades()

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

  // La búsqueda se escribe sin pedir nada en cada tecla: se espera un instante a que termine de teclear.
  const [texto, setTexto] = useState(q)
  useEffect(() => { setTexto(q) }, [q])
  useEffect(() => {
    const limpio = texto.trim()
    if (limpio === q) return
    const espera = setTimeout(() => cambiar({ q: limpio }, { reemplazar: true }), ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [texto, q, cambiar])

  const ahora = useAhora()
  const [resultado, setResultado] = useState<ResultadoBandeja | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [conteo, setConteo] = useState<{ porResolver: number; total: number } | null>(null)

  const consulta = useMemo(
    () => ({ filtro, tipo, q, fecha, desde, hasta, orden, pagina, justificadaHoy }),
    [filtro, tipo, q, fecha, desde, hasta, orden, pagina, justificadaHoy],
  )

  useEffect(() => {
    let vigente = true
    setCargando(true)
    consultarBandeja(consulta)
      .then((r) => { if (vigente) { setResultado(r); setError(null) } })
      .catch(() => { if (vigente) { setResultado(null); setError('No se pudo cargar la bandeja de anomalías') } })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [consulta])

  const [hoyJustificadas, setHoyJustificadas] = useState<number | null>(null)
  useEffect(() => {
    let vigente = true
    contarBandeja().then((c) => { if (vigente) setConteo(c) }).catch(() => {})
    contarJustificadasHoy().then((j) => { if (vigente) setHoyJustificadas(j.total) }).catch(() => {})
    return () => { vigente = false }
  }, [])

  const filas = resultado?.filas ?? []
  const total = resultado?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA))

  // Si la dirección pide una página que ya no existe (se resolvieron casos, o se escribió a mano), se va a la última.
  useEffect(() => {
    if (!cargando && resultado && resultado.filas.length === 0 && resultado.total > 0 && pagina > 1) {
      cambiar({ pagina: paginas > 1 ? String(paginas) : null }, { reemplazar: true })
    }
  }, [cargando, resultado, pagina, paginas, cambiar])

  const desdeFila = (pagina - 1) * POR_PAGINA
  const hoy = hoyEcuador()
  const filtrosActivos = (tipo ? 1 : 0) + (q ? 1 : 0) + (fecha !== 'todas' ? 1 : 0)
  const hayFiltros = filtrosActivos > 0
  const quitarFiltros = () => { setTexto(''); cambiar({ tipo: null, q: null, fecha: null, desde: null, hasta: null }) }
  const detalle = conteo ? `${conteo.porResolver} por resolver · ${conteo.total} en total` : undefined

  return (
    <>
      <EncabezadoPagina titulo="Anomalías" detalle={detalle}>
        <input aria-label="Buscar" placeholder="Buscar persona o caso…" value={texto} onChange={(e) => setTexto(e.target.value)}
          className="w-full rounded-[11px] max-sm:!basis-full sm:w-[220px] border border-borde px-3.5 py-2.5 text-[13px] font-bold text-marino outline-none placeholder:text-placeholder focus:border-marino" />
        <select aria-label="Tipo" value={tipo} onChange={(e) => cambiar({ tipo: e.target.value })} className={selectorFiltro}>
          <option value="">Tipo: todos</option>
          {TIPOS_ANOMALIA.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
        </select>
      </EncabezadoPagina>

      <div className="space-y-3 p-4 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
            {FILTROS.map((f) => (
              <button key={f.valor} onClick={() => cambiar({ estado: f.valor === FILTRO_INICIAL ? null : f.valor, orden: null })} aria-pressed={filtro === f.valor}
                className={`rounded-full border px-3.5 py-2 text-[13px] font-extrabold ${filtro === f.valor ? 'border-marino bg-marino text-white' : 'border-borde bg-white text-marino hover:bg-lienzo'}`}>
                {f.texto}
                {resultado && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${filtro === f.valor ? 'bg-white/20' : 'bg-lienzo text-texto-suave'}`}>
                    {resultado.conteos[f.valor]}
                  </span>
                )}
              </button>
            ))}
            <button onClick={() => cambiar({ justificada: justificadaHoy ? null : 'hoy' })} aria-pressed={justificadaHoy}
              title="Solo los casos que las personas justificaron hoy"
              className={`rounded-full border px-3.5 py-2 text-[13px] font-extrabold ${justificadaHoy ? 'border-ambar bg-ambar text-ambar-tinta' : 'border-borde bg-white text-marino hover:bg-lienzo'}`}>
              Justificadas hoy
              {hoyJustificadas !== null && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] ${justificadaHoy ? 'bg-white/40' : 'bg-lienzo text-texto-suave'}`}>{hoyJustificadas}</span>
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Fecha" value={fecha}
              onChange={(e) => cambiar(e.target.value === 'rango' ? { fecha: 'rango' } : { fecha: e.target.value === 'todas' ? null : e.target.value, desde: null, hasta: null })}
              className={selectorFiltro}>
              {FECHAS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
            </select>
            {fecha === 'rango' && (
              <>
                <input type="date" aria-label="Desde" value={desde ?? ''} max={hasta || hoy} onChange={(e) => cambiar({ fecha: 'rango', desde: e.target.value || null })} className={selectorFiltro} />
                <input type="date" aria-label="Hasta" value={hasta ?? ''} min={desde ?? undefined} max={hoy} onChange={(e) => cambiar({ fecha: 'rango', hasta: e.target.value || null })} className={selectorFiltro} />
              </>
            )}
            <select aria-label="Orden" value={orden} onChange={(e) => cambiar({ orden: e.target.value === ordenPorDefecto(filtro) ? null : e.target.value })} className={selectorFiltro}>
              {ordenes.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
            </select>
            {filtrosActivos > 0 && (
              <button onClick={quitarFiltros} aria-label={`Borrar filtros, ${filtrosActivos} ${filtrosActivos === 1 ? 'activo' : 'activos'}`}
                className="inline-flex items-center gap-2 rounded-[11px] border border-marino bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino transition-colors hover:bg-lienzo">
                <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                Borrar filtros
                <span aria-hidden="true" className="grid size-5 place-items-center rounded-full bg-marino text-[11px] font-extrabold text-white">{filtrosActivos}</span>
              </button>
            )}
          </div>
        </div>

        {error && <Aviso tipo="error">{error}</Aviso>}
        {cargando && !resultado && !error && <EsqueletoBandeja />}
        {!cargando && !error && total === 0 && (
          <p className="rounded-[18px] border border-borde-suave bg-white p-6 text-sm font-semibold text-texto-suave">
            {justificadaHoy ? 'Nadie ha justificado hoy con estos filtros.' : filtro === FILTRO_INICIAL && !hayFiltros ? 'No hay casos por resolver. ¡Todo al día!' : 'No hay anomalías que coincidan.'}
          </p>
        )}
        {filas.length > 0 && (
          <div aria-busy={cargando} className={`grid gap-4 pt-1 transition-opacity md:grid-cols-2 2xl:grid-cols-3 ${cargando ? 'opacity-60' : ''}`}>
            {filas.map((f) => {
              const cuando = justificadaEn(f)
              const nueva = !!visita && !!cuando && Date.parse(cuando) > Date.parse(visita)
              return <TarjetaAnomalia key={f.id} fila={f} ahora={ahora} nueva={nueva} />
            })}
          </div>
        )}
        {total > 0 && filas.length > 0 && (
          <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs font-semibold text-etiqueta">
              Mostrando {desdeFila + 1}–{desdeFila + filas.length} de {total}
            </p>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => cambiar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : null })} disabled={pagina === 1}
                  className="rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
                  ‹ Anterior
                </button>
                <span className="text-[13px] font-bold text-texto-suave">Página {pagina} de {paginas}</span>
                <button onClick={() => cambiar({ pagina: String(pagina + 1) })} disabled={pagina >= paginas}
                  className="rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
                  Siguiente ›
                </button>
              </div>
            )}
          </nav>
        )}
      </div>
    </>
  )
}
