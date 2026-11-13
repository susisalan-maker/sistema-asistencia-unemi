import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso } from '../../components/ui'
import { AnomaliasPorDia } from './AnomaliasPorDia'
import { CierreCasos } from './CierreCasos'
import { FranjaIndicadores } from './FranjaIndicadores'
import { Conexion, HoyEnVivo } from './HoyEnVivo'
import { PatronesRevisar } from './PatronesRevisar'
import { RequiereAtencion } from './RequiereAtencion'
import { SinIngreso } from './SinIngreso'
import { TiposFrecuentes } from './TiposFrecuentes'
import { serieComparada } from './dashboardSerie'
import { usePatrones } from './patrones'
import { useEstadoHoy } from './useEstadoHoy'
import { BarraFiltros, EsqueletoIndicadores, avisoRangoLargo, tarjeta } from './PiezasReporte'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'
import { useNumerosReporte } from './useNumerosReporte'

/** «martes, 10 de noviembre de 2026», en hora de Ecuador. */
const fechaDeHoy = () => new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

const titulo = 'text-lg font-extrabold tracking-tight text-marino'

/**
 * Dashboard: la vista general. Primero, «Ahora»: lo de HOY en vivo (cómo van los ingresos y quién falta) junto a lo que requiere
 * atención; es siempre hoy y todas las sedes. Después, «Periodo»: los indicadores, las anomalías por día y por tipo, quién cerró
 * cada caso y los patrones a revisar, con los mismos filtros que Reportes (semana, mes o rango, y una sola sede si se quiere).
 * Los números los cuenta la base (`reporte_anomalias`). El resumen con IA, las gráficas completas y la exportación están en Reportes.
 */
export default function Dashboard() {
  const f = useFiltrosPeriodo()
  const { params, rango, demasiado, periodo, sedeId } = f
  const { numeros, indicadores, error: errorNumeros, reintentar } = useNumerosReporte(rango, sedeId, demasiado)
  const a = numeros?.actual ?? null
  const hoy = useEstadoHoy()
  const pat = usePatrones(sedeId)

  /** Reportes se abre con el mismo periodo y la misma sede. */
  const enlaceReporte = useMemo(() => {
    const q = new URLSearchParams()
    for (const k of ['periodo', 'ref', 'desde', 'hasta', 'sede']) { const v = params.get(k); if (v) q.set(k, v) }
    const texto = q.toString()
    return `/admin/reportes${texto ? `?${texto}` : ''}`
  }, [params])

  const serie = useMemo(() => (numeros ? serieComparada(numeros.actual, numeros.anterior, rango) : null), [numeros, rango])
  const nombreAnterior = periodo === 'semana' ? 'Semana anterior' : periodo === 'mes' ? 'Mes anterior' : 'Periodo anterior'

  return (
    <>
      <EncabezadoPagina titulo="Dashboard" detalle={fechaDeHoy()} />

      <div className="@container">
        <div className="mx-auto max-w-[1440px] space-y-7 p-3 sm:px-7 sm:py-5">

          {/* ───── Ahora: siempre hoy y todas las sedes ───── */}
          <section aria-labelledby="dash-ahora">
            <div className="mb-3 flex flex-wrap items-center gap-x-3.5 gap-y-2">
              <h2 id="dash-ahora" className={titulo}>Ahora</h2>
              <Conexion enVivo={hoy.enVivo} actualizadoEn={hoy.actualizadoEn} />
            </div>
            <div className="grid grid-cols-1 items-stretch gap-4 @5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <HoyEnVivo estado={hoy.estado} error={hoy.errorEstado} ingresos={hoy.ingresos} onReintentar={() => void hoy.recargar()} />
              <RequiereAtencion atencion={hoy.atencion} error={hoy.errorAtencion} onReintentar={() => void hoy.recargar()} />
            </div>
            <div className="mt-4">
              <SinIngreso estado={hoy.estado} />
            </div>
          </section>

          {/* ───── Periodo: con los filtros ───── */}
          <section aria-labelledby="dash-periodo" className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <h2 id="dash-periodo" className={titulo}>Periodo</h2>
              <BarraFiltros f={f} />
              <Link to={enlaceReporte}
                className="rounded-[11px] border border-borde bg-white px-4 py-2.5 text-center text-[13px] font-extrabold text-marino hover:bg-lienzo max-sm:w-full">
                Ver reporte completo
              </Link>
            </div>

            {demasiado && <Aviso tipo="error">{avisoRangoLargo}</Aviso>}
            {errorNumeros && !demasiado && (
              <Aviso tipo="error">
                {errorNumeros}.{' '}
                <button type="button" onClick={reintentar} className="underline">Reintentar</button>
              </Aviso>
            )}

            {!demasiado && (
              <>
                {!a && !errorNumeros && <EsqueletoIndicadores cantidad={4} />}

                {a && indicadores && (
                  <>
                    <FranjaIndicadores indicadores={indicadores} />

                    {a.total === 0 ? (
                      <section className={`${tarjeta} !p-4`}><p className="text-sm font-semibold text-texto-suave">No hubo anomalías en este periodo.</p></section>
                    ) : (
                      <div className="grid grid-cols-1 items-stretch gap-4 @5xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
                        {serie && <div className="flex min-w-0 flex-col [&>section]:flex-1"><AnomaliasPorDia columnas={serie.columnas} unidad={serie.unidad} nombreAnterior={nombreAnterior} /></div>}
                        <div className="flex min-w-0 flex-col gap-4">
                          <CierreCasos a={a} />
                          <TiposFrecuentes a={a} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <PatronesRevisar patrones={pat.patrones} error={pat.error} onReintentar={pat.reintentar} />
              </>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
