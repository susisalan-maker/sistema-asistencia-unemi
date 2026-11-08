import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso } from '../../components/ui'
import { HoyEnVivo } from './HoyEnVivo'
import { CierreCasos } from './CierreCasos'
import { MapaCalorCasos } from './MapaCalorCasos'
import { PatronesRevisar } from './PatronesRevisar'
import { RequiereAtencion } from './RequiereAtencion'
import { mapaCalor } from './mapaCalor'
import { usePatrones } from './patrones'
import { useEstadoHoy } from './useEstadoHoy'
import { BarraFiltros, EsqueletoIndicadores, IndicadorCompacto, avisoRangoLargo, tarjeta } from './PiezasReporte'
import { tarjetaDe } from './tarjetasIndicadores'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'
import { useNumerosReporte } from './useNumerosReporte'

/**
 * Dashboard: la vista general en una sola pantalla. Arriba, lo de HOY en vivo (quién está en jornada, quién no ha ingresado) y lo que
 * requiere atención; en medio, los indicadores del periodo elegido (semana, mes o rango) y, si se quiere, de una sola sede, con los
 * mismos filtros que Reportes; abajo, cuándo ocurren las anomalías, quién cerró cada caso y los patrones a revisar.
 * Los números los cuenta la base (`reporte_anomalias`). Las gráficas de tendencia, tipo y sede, el resumen con IA y la exportación están en Reportes.
 */
export default function Dashboard() {
  const f = useFiltrosPeriodo()
  const { params, rango, demasiado, nombrePeriodo, sedeId, sedeNombre } = f
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

  const calor = useMemo(() => (a ? mapaCalor(a) : null), [a])

  return (
    <>
      <EncabezadoPagina titulo="Dashboard" detalle={`Resumen del periodo · ${nombrePeriodo} · ${sedeNombre ?? 'todas las sedes'}`}>
        <Link to={enlaceReporte}
          className="rounded-[11px] bg-ambar px-4 py-2.5 text-center text-[13px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 max-sm:w-full">
          Ver reporte completo
        </Link>
      </EncabezadoPagina>

      <div className="space-y-3 p-3 sm:px-5 sm:py-4">
        <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <HoyEnVivo estado={hoy.estado} error={hoy.errorEstado} actualizadoEn={hoy.actualizadoEn} enVivo={hoy.enVivo} onReintentar={() => void hoy.recargar()} />
          <RequiereAtencion atencion={hoy.atencion} error={hoy.errorAtencion} onReintentar={() => void hoy.recargar()} />
        </div>

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
            {!a && !errorNumeros && <EsqueletoIndicadores cantidad={5} />}

            {a && indicadores && (
              <>
                <section aria-label="Indicadores del periodo" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
                  {(['anomalias', 'aTiempo', 'puntualidad', 'resolucion', 'rechazo'] as const).map((id) => (
                    <IndicadorCompacto key={id} {...tarjetaDe(id, indicadores)} />
                  ))}
                </section>

                {a.total === 0 && (
                  <section className={`${tarjeta} !p-4`}><p className="text-sm font-semibold text-texto-suave">No hubo anomalías en este periodo.</p></section>
                )}

                <div className={`grid items-stretch gap-3 ${a.total > 0 && calor ? 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)]' : ''}`}>
                  {a.total > 0 && calor && (
                    <>
                      <div className="flex min-w-0 flex-col [&>section]:flex-1"><MapaCalorCasos mapa={calor} /></div>
                      <div className="flex min-w-0 flex-col [&>section]:flex-1"><CierreCasos a={a} /></div>
                    </>
                  )}
                  <div className="flex min-w-0 flex-col [&>section]:flex-1">
                    <PatronesRevisar patrones={pat.patrones} error={pat.error} onReintentar={pat.reintentar} />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
