import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Esqueleto } from '../../components/Esqueleto'
import { Aviso, Chip } from '../../components/ui'
import { ESTADOS, caso, fechaHora, nombreDeTipo } from './anomaliasTipos'
import { BarrasHorizontales, ColumnasDobles, ColumnasTiempo, TituloGrafica } from './GraficasReporte'
import { BarraFiltros, EsqueletoIndicadores, Indicador, avisoRangoLargo, tarjeta } from './PiezasReporte'
import { PENDIENTES_EN_DASHBOARD, consultarPendientes, franjaDe, type FilaPendiente } from './reportesDatos'
import { diasEntre } from './reportesPeriodo'
import { coma, columnasPorHora, filasPorSede, filasPorTipo, tendenciaDelPeriodo, textoPuntos, textoVariacion } from './reportesVista'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'
import { useNumerosReporte } from './useNumerosReporte'

const COLUMNAS = '@4xl:grid @4xl:grid-cols-[minmax(0,.7fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,.7fr)] @4xl:gap-3'

function EsqueletoGraficas() {
  return (
    <div aria-hidden="true" className="grid gap-5 lg:grid-cols-3">
      <div className={`${tarjeta} lg:col-span-2`}><Esqueleto className="h-4 w-48" /><Esqueleto className="mt-4 h-28 w-full" /></div>
      <div className={tarjeta}><Esqueleto className="h-4 w-40" /><Esqueleto className="mt-4 h-28 w-full" /></div>
    </div>
  )
}

/**
 * Dashboard: la foto del periodo elegido (semana, mes o rango) y, si se quiere, de una sola sede, con los mismos filtros que Reportes.
 * Muestra los indicadores, la tendencia, dónde y a qué hora se concentran las anomalías, y los casos que esperan al administrador.
 * Los números los cuenta la base (`reporte_anomalias`); el análisis completo, el resumen con IA y la exportación están en Reportes.
 */
export default function Dashboard() {
  const f = useFiltrosPeriodo()
  const { params, rango, demasiado, nombrePeriodo, sedeId, sedeNombre } = f
  const { numeros, indicadores, error: errorNumeros, reintentar } = useNumerosReporte(rango, sedeId, demasiado)
  const a = numeros?.actual ?? null

  const [pendientes, setPendientes] = useState<{ filas: FilaPendiente[]; total: number } | null>(null)
  const [errorPendientes, setErrorPendientes] = useState(false)
  useEffect(() => {
    if (demasiado) return
    let vigente = true
    setPendientes(null)
    setErrorPendientes(false)
    consultarPendientes(rango, sedeId)
      .then((r) => { if (vigente) setPendientes(r) })
      .catch(() => { if (vigente) setErrorPendientes(true) })
    return () => { vigente = false }
  }, [rango, sedeId, demasiado])

  /** Reportes se abre con el mismo periodo y la misma sede. */
  const enlaceReporte = useMemo(() => {
    const q = new URLSearchParams()
    for (const k of ['periodo', 'ref', 'desde', 'hasta', 'sede']) { const v = params.get(k); if (v) q.set(k, v) }
    const texto = q.toString()
    return `/admin/reportes${texto ? `?${texto}` : ''}`
  }, [params])

  const tendencia = useMemo(() => (a ? tendenciaDelPeriodo(a, diasEntre(rango)) : null), [a, rango])

  return (
    <>
      <EncabezadoPagina titulo="Dashboard" detalle={`Resumen del periodo · ${nombrePeriodo} · ${sedeNombre ?? 'todas las sedes'}`}>
        <Link to={enlaceReporte}
          className="rounded-[11px] bg-ambar px-4 py-2.5 text-center text-[13px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 max-sm:w-full">
          Ver reporte completo
        </Link>
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
            {!a && !errorNumeros && (<><EsqueletoIndicadores cantidad={3} /><EsqueletoGraficas /></>)}

            {a && indicadores && (
              <>
                <section aria-label="Indicadores del periodo" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Indicador titulo="Anomalías del periodo" valor={String(indicadores.total)} detalle={textoVariacion(indicadores)} />
                  <Indicador titulo="Justificadas a tiempo"
                    valor={indicadores.aTiempoPct === null ? '—' : `${coma(indicadores.aTiempoPct)} %`}
                    detalle={indicadores.evaluadas === 0 ? 'Aún no hay casos con plazo vencido' : `${indicadores.aTiempo} de ${indicadores.evaluadas} casos con plazo vencido o justificados`} />
                  <Indicador titulo="Puntualidad" className="sm:col-span-2 lg:col-span-1"
                    valor={indicadores.puntualidadPct === null ? '—' : `${coma(indicadores.puntualidadPct)} %`}
                    detalle={indicadores.jornadaMarcaciones === 0
                      ? 'Sin ingresos ni salidas en el periodo'
                      : `${indicadores.jornadaMarcaciones - indicadores.jornadaConFalta} de ${indicadores.jornadaMarcaciones} ingresos y salidas dentro del horario · ${textoPuntos(indicadores.puntualidadPts)}`} />
                </section>

                {a.total === 0 && (
                  <section className={tarjeta}><p className="text-sm font-semibold text-texto-suave">No hubo anomalías en este periodo.</p></section>
                )}

                {a.total > 0 && tendencia && (
                  <>
                    <div className="grid items-stretch gap-5 lg:grid-cols-3">
                      <section className={`${tarjeta} flex flex-col lg:col-span-2`}>
                        <TituloGrafica detalle={`Por ${tendencia.granularidad === 'dia' ? 'día' : 'semana'} · las justificadas son de las detectadas`}>Tendencia de anomalías</TituloGrafica>
                        <ColumnasDobles columnas={tendencia.columnas} resumen={tendencia.resumen} cadaEtiqueta={tendencia.cadaEtiqueta} />
                      </section>
                      <section className={tarjeta}>
                        <TituloGrafica detalle={indicadores.tipoTop ? `El más frecuente: ${nombreDeTipo(indicadores.tipoTop.tipo)}` : undefined}>Anomalías por tipo</TituloGrafica>
                        <BarrasHorizontales filas={filasPorTipo(a)} total={a.total} />
                      </section>
                    </div>

                    <div className="grid items-stretch gap-5 lg:grid-cols-2">
                      {!sedeId && (
                        <section className={tarjeta}>
                          <TituloGrafica detalle={indicadores.sedeTop ? `La que más casos tuvo: ${indicadores.sedeTop.sede}` : undefined}>Por sede</TituloGrafica>
                          <BarrasHorizontales filas={filasPorSede(a)} total={a.total} />
                        </section>
                      )}
                      <section className={`${tarjeta} flex flex-col ${sedeId ? 'lg:col-span-2' : ''}`}>
                        <TituloGrafica detalle={indicadores.horaPico ? `La franja con más casos: ${franjaDe(indicadores.horaPico.hora)} (${indicadores.horaPico.total})` : 'Hora de Ecuador en que se detectó cada caso'}>Casos por hora del día</TituloGrafica>
                        <ColumnasTiempo {...columnasPorHora(a)} />
                      </section>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Casos que esperan al administrador */}
            <section aria-label="Pendientes de revisión" className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-[17px] font-extrabold text-marino">Anomalías pendientes de revisión</h2>
                {pendientes && <span className="rounded-full bg-celeste px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-marino">{pendientes.total} {pendientes.total === 1 ? 'caso' : 'casos'}</span>}
                <Link to="/admin/anomalias" className="text-[13px] font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">Ver todas</Link>
              </div>

              {errorPendientes && <Aviso tipo="error">No se pudieron cargar los casos pendientes</Aviso>}
              <div aria-busy={!pendientes && !errorPendientes} className="@container tabla-ancha overflow-hidden rounded-[18px] border border-borde-suave bg-white">
                <div className={`${COLUMNAS} tabla-cabecera border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
                  <div>Caso</div><div>Colaborador</div><div>Tipo</div><div>Sede</div><div>Estado</div><div />
                </div>
                {!pendientes && !errorPendientes && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
                {pendientes && pendientes.total === 0 && <p className="p-6 text-sm font-semibold text-texto-suave">No hay casos esperando revisión en este periodo.</p>}
                {(pendientes?.filas ?? []).map((p) => (
                  <div key={p.id} className={`${COLUMNAS} tabla-fila items-center border-b border-lienzo px-4 py-4 text-sm font-semibold text-texto @4xl:px-5 @4xl:py-3.5`}>
                    <div data-etiqueta="Caso" title={fechaHora(p.created_at)}><span className="font-extrabold text-marino">{caso(p.numero)}</span></div>
                    <div data-etiqueta="Colaborador" className="break-words font-bold text-marino @4xl:truncate">{p.colaborador ?? '—'}</div>
                    <div data-etiqueta="Tipo" className="text-[13px] @4xl:truncate" title={nombreDeTipo(p.tipo)}>{nombreDeTipo(p.tipo)}</div>
                    <div data-etiqueta="Sede" className="text-[13px] @4xl:truncate">{p.sede ?? '—'}</div>
                    <div data-etiqueta="Estado"><Chip tono={ESTADOS[p.estado].tono}>{ESTADOS[p.estado].texto}</Chip></div>
                    <div className="@4xl:text-right">
                      <Link to={`/admin/anomalias/${p.id}`} className="rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo">Revisar</Link>
                    </div>
                  </div>
                ))}
                {pendientes && pendientes.total > pendientes.filas.length && (
                  <p className="px-5 py-3 text-xs font-semibold text-etiqueta">Mostrando los {PENDIENTES_EN_DASHBOARD} más recientes de {pendientes.total}.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  )
}
