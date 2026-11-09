import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Esqueleto } from '../../components/Esqueleto'
import { Aviso, Chip } from '../../components/ui'
import { useAhora } from '../../lib/useAhora'
import { ESTADOS_HOY, RETRASO_GRAVE_MIN, textoHace, textoRetraso, textoUltimaMarcacion, type EstadoHoy } from './estadoHoy'
import { tarjeta } from './PiezasReporte'

const FILAS_VISIBLES = 3

interface Props {
  estado: EstadoHoy | null
  error: boolean
  /** Cuándo (ms) llegó la última respuesta; null mientras no ha llegado ninguna. */
  actualizadoEn: number | null
  /** Hay una conexión en vivo con la base (Realtime). Si no, la pantalla se refresca cada minuto. */
  enVivo: boolean
  onReintentar: () => void
}

/** La conexión: un punto verde que late si llegan avisos al instante; gris si solo se refresca cada minuto. */
function Conexion({ enVivo, actualizadoEn }: { enVivo: boolean; actualizadoEn: number | null }) {
  const ahora = useAhora(5_000)
  return (
    <span className={`inline-flex items-center gap-2 text-xs font-extrabold ${enVivo ? 'text-ok' : 'text-texto-suave'}`}>
      <span aria-hidden="true" className={`size-[9px] rounded-full ${enVivo ? 'bg-ok motion-safe:animate-pulse' : 'bg-etiqueta'}`} />
      {enVivo ? 'En vivo' : 'Se actualiza cada minuto'}
      {actualizadoEn !== null && <span className="font-semibold text-texto-suave">· actualizado {textoHace(ahora.getTime() - actualizadoEn)}</span>}
    </span>
  )
}

function Esqueletos() {
  return (
    <div aria-hidden="true" className={`${tarjeta} !p-4`}>
      <Esqueleto className="h-5 w-40" />
      <Esqueleto className="mt-3 h-2.5 w-full" />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Esqueleto key={i} className="h-[46px]" />)}</div>
    </div>
  )
}

/**
 * «Hoy en vivo»: cuántas personas hay en cada estado ahora mismo y quiénes todavía no marcan su ingreso. No depende del
 * periodo ni de la sede que se elijan más abajo: es siempre hoy y todas las sedes. Se calcula solo con marcaciones,
 * jornadas y feriados: no muestra ubicación ni quién tiene la app abierta.
 */
export function HoyEnVivo({ estado, error, actualizadoEn, enVivo, onReintentar }: Props) {
  const [verTodas, setVerTodas] = useState(false)

  if (!estado && error) {
    return (
      <Aviso tipo="error">
        No se pudo cargar el estado de hoy.{' '}
        <button type="button" onClick={onReintentar} className="underline">Reintentar</button>
      </Aviso>
    )
  }
  if (!estado) return <Esqueletos />

  const e = estado.por_estado
  const faltan = estado.faltan
  const visibles = verTodas ? faltan : faltan.slice(0, FILAS_VISIBLES)

  return (
    <section aria-label="Hoy en vivo" className={`${tarjeta} !p-4`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-extrabold text-marino">Hoy en vivo</h2>
        <Conexion enVivo={enVivo} actualizadoEn={actualizadoEn} />
        <span className="text-xs font-semibold text-texto-suave sm:ml-auto">
          {estado.esperadas} {estado.esperadas === 1 ? 'persona' : 'personas'} {estado.esperadas === 1 ? 'debe' : 'deben'} marcar hoy
        </span>
      </div>

      {error && <div className="mt-2"><Aviso tipo="aviso">No se pudo actualizar; se muestra lo último que llegó.</Aviso></div>}
      {estado.feriado && <div className="mt-2"><Aviso tipo="aviso">Hoy es día no laborable: {estado.feriado}. Nadie debe marcar.</Aviso></div>}

      {estado.esperadas === 0 ? (
        <p className="mt-3 text-sm font-semibold text-texto-suave">
          {estado.feriado ? 'Si alguien marca hoy, aparecerá aquí.' : 'Hoy no es un día laborable para nadie. Si alguien marca, aparecerá aquí.'}
        </p>
      ) : (
        <>
          <div role="img" aria-label={ESTADOS_HOY.map((s) => `${e[s.valor]} ${s.texto.toLowerCase()}`).join(', ')} className="mt-3 flex h-2.5 gap-[2px]">
            {ESTADOS_HOY.filter((s) => e[s.valor] > 0).map((s) => (
              <span key={s.valor} className={`h-full min-w-[6px] rounded-md ${s.color}`} style={{ flexGrow: e[s.valor] }} />
            ))}
          </div>

          <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ESTADOS_HOY.map((s) => (
              <div key={s.valor} className="rounded-[10px] border border-borde-suave bg-cabecera px-2.5 py-1.5">
                <dd className="text-[19px] font-extrabold leading-tight text-marino">{e[s.valor]}</dd>
                <dt className="flex items-center gap-1.5 text-[11px] font-bold text-texto-suave">
                  <span aria-hidden="true" className={`size-2 flex-none rounded-full ${s.color}`} />{s.texto}
                </dt>
              </div>
            ))}
          </dl>

          {estado.por_sede.length > 0 && (
            <p className="mt-2 text-xs font-semibold text-texto-suave">
              {estado.por_sede.map((s, i) => (
                <span key={s.sede_id}>
                  {i > 0 && ' · '}
                  <b className="font-extrabold text-marino">{s.sede}</b> {s.presentes}/{s.esperadas}
                  {s.sin_ingreso > 0 && <span className="text-error"> ({s.sin_ingreso} sin ingreso)</span>}
                </span>
              ))}{' '}en jornada
            </p>
          )}

          <section aria-label="Personas sin ingreso" className="mt-3 border-t border-lienzo pt-2.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-[13px] font-extrabold text-marino">Sin ingreso</h3>
              <span className="rounded-full bg-celeste px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-marino">
                {e.sin_ingreso} {e.sin_ingreso === 1 ? 'persona' : 'personas'}
              </span>
              <span className="text-[11px] font-semibold text-etiqueta">Pasó su hora más la tolerancia. No sabemos el motivo.</span>
              {faltan.length > FILAS_VISIBLES && (
                <button type="button" onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}
                  className="text-xs font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">
                  {verTodas ? 'Ver menos' : `Ver las ${faltan.length}`}
                </button>
              )}
            </div>

            {faltan.length === 0 ? (
              <p className="mt-1.5 text-sm font-semibold text-texto-suave">Todos los que ya debían ingresar lo hicieron.</p>
            ) : (
              <ul className="mt-1">
                {visibles.map((p) => (
                  <li key={p.usuario_id}
                    className="grid items-center gap-x-3 gap-y-1 border-t border-lienzo py-1.5 text-xs font-semibold text-texto first:border-t-0 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_12.5rem_5.5rem]">
                    <b className="truncate text-[12.5px] font-extrabold text-marino" title={p.nombre}>{p.nombre}</b>
                    <span className="truncate text-texto-suave" title={`Última marcación: ${textoUltimaMarcacion(p.ultima, estado.hoy)}`}>
                      {p.sede ?? '—'} · {textoUltimaMarcacion(p.ultima, estado.hoy)}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{p.jornada_inicio}</span>
                      <Chip tono={p.minutos_retraso >= RETRASO_GRAVE_MIN ? 'error' : 'aviso'}>{textoRetraso(p.minutos_retraso)} de retraso</Chip>
                    </span>
                    <Link to={`/admin/anomalias?estado=todas&q=${encodeURIComponent(p.nombre)}`}
                      className="justify-self-start rounded-[9px] border border-borde bg-white px-2.5 py-1 text-xs font-extrabold text-marino hover:bg-lienzo sm:justify-self-end">Ver casos</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="mt-2 text-[11px] font-semibold text-etiqueta">
        Se calcula solo con marcaciones, jornada y feriados. No muestra ubicación ni quién tiene la app abierta.
      </p>
    </section>
  )
}
