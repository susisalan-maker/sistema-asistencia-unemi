import { Esqueleto } from '../../components/Esqueleto'
import { Aviso, Chip } from '../../components/ui'
import { useAhora } from '../../lib/useAhora'
import { TIPOS_MARCACION } from './anomaliasTipos'
import { ESTADOS_HOY, horaEcuador, textoHace, type EstadoHoy } from './estadoHoy'
import { IngresosDelDia } from './IngresosDelDia'
import type { IngresosHoy, UltimaMarcacion } from './ingresosHoy'
import { panel } from './PiezasReporte'

interface Props {
  estado: EstadoHoy | null
  error: boolean
  /** La gráfica de ingresos y la última marcación; null mientras no llegan (o si no se pudieron pedir). */
  ingresos: IngresosHoy | null
  onReintentar: () => void
}

interface PropsConexion {
  /** Cuándo (ms) llegó la última respuesta; null mientras no ha llegado ninguna. */
  actualizadoEn: number | null
  /** Hay una conexión en vivo con la base (Realtime). Si no, la pantalla se refresca cada minuto. */
  enVivo: boolean
}

/** La conexión: un punto verde si llegan avisos al instante; gris si solo se refresca cada minuto. */
export function Conexion({ enVivo, actualizadoEn }: PropsConexion) {
  const ahora = useAhora(5_000)
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[13px] font-bold ${enVivo ? 'border-ok-borde bg-ok-fondo text-ok' : 'border-borde bg-white text-texto-suave'}`}>
      <span aria-hidden="true" className={`size-2 rounded-full ${enVivo ? 'bg-ok' : 'bg-etiqueta'}`} />
      {enVivo ? 'En vivo' : 'Se actualiza cada minuto'}
      {actualizadoEn !== null && <span className="font-semibold text-texto-suave">· actualizado {textoHace(ahora.getTime() - actualizadoEn)}</span>}
    </span>
  )
}

function Esqueletos() {
  return (
    <div aria-hidden="true" className={`${panel} p-5`}>
      <Esqueleto className="h-5 w-40" />
      <Esqueleto className="mt-4 h-3 w-full" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Esqueleto key={i} className="h-[62px]" />)}</div>
      <Esqueleto className="mt-5 h-[200px] w-full" />
    </div>
  )
}

const VERIFICACION: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'error' }> = {
  verificada: { texto: 'Verificada', tono: 'ok' }, pendiente: { texto: 'Pendiente', tono: 'aviso' }, fallida: { texto: 'Fallida', tono: 'error' },
}

/** La última marcación de hoy, en una sola línea. */
function Ultima({ u }: { u: UltimaMarcacion }) {
  const v = VERIFICACION[u.verificacion]
  return (
    <p className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-borde-suave bg-cabecera px-3.5 py-2.5 text-[13px]">
      <span className="font-bold text-texto-suave">Última marcación</span>
      <time className="font-extrabold text-texto-suave">{horaEcuador(u.fecha_hora)}</time>
      <span className="min-w-0 flex-1 font-semibold text-texto"><b className="font-extrabold text-marino">{u.nombre}</b> · {TIPOS_MARCACION[u.tipo] ?? u.tipo}{u.sede ? ` · ${u.sede}` : ''}</span>
      {u.sin_conexion && <Chip tono="neutro">Sin conexión</Chip>}
      {v && <Chip tono={v.tono}>{v.texto}</Chip>}
    </p>
  )
}

/**
 * «Hoy en vivo»: cuántas personas hay en cada estado ahora mismo, cómo van los ingresos frente a lo esperado y cómo va cada sede.
 * No depende del periodo ni de la sede que se elijan más abajo: es siempre hoy y todas las sedes. Se calcula solo con
 * marcaciones, jornadas y feriados: no muestra ubicación ni quién tiene la app abierta. Quiénes faltan, en «Sin ingreso».
 */
export function HoyEnVivo({ estado, error, ingresos, onReintentar }: Props) {
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

  return (
    <section aria-label="Hoy en vivo" className={panel}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="text-[15px] font-extrabold text-marino">Hoy en vivo</h2>
        <span className="text-[13px] font-semibold text-texto-suave">
          {estado.esperadas} {estado.esperadas === 1 ? 'persona' : 'personas'} {estado.esperadas === 1 ? 'debe' : 'deben'} marcar hoy
        </span>
        <span tabIndex={0} aria-label="Cómo se calcula" className="group relative ml-auto grid size-6 place-items-center rounded-full bg-celeste text-xs font-extrabold text-marino outline-offset-2">
          i
          <span role="note" className="pointer-events-none absolute right-[-6px] top-8 z-10 w-64 rounded-[10px] bg-marino-oscuro px-3 py-2.5 text-left text-xs font-semibold leading-relaxed text-white opacity-0 shadow-[0_10px_28px_rgba(0,0,0,.22)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            Se calcula solo con marcaciones, jornada y feriados. No muestra ubicación ni quién tiene la app abierta.
          </span>
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
        {error && <div className="mb-2"><Aviso tipo="aviso">No se pudo actualizar; se muestra lo último que llegó.</Aviso></div>}
        {estado.feriado && <div className="mb-2"><Aviso tipo="aviso">Hoy es día no laborable: {estado.feriado}. Nadie debe marcar.</Aviso></div>}

        {estado.esperadas === 0 ? (
          <p className="text-sm font-semibold text-texto-suave">
            {estado.feriado ? 'Si alguien marca hoy, aparecerá aquí.' : 'Hoy no es un día laborable para nadie. Si alguien marca, aparecerá aquí.'}
          </p>
        ) : (
          <>
            <div role="img" aria-label={ESTADOS_HOY.map((s) => `${e[s.valor]} ${s.texto.toLowerCase()}`).join(', ')} className="flex h-3 gap-[3px]">
              {ESTADOS_HOY.filter((s) => e[s.valor] > 0).map((s) => (
                <span key={s.valor} className={`h-full min-w-2 rounded-md ${s.color}`} style={{ flexGrow: e[s.valor] }} />
              ))}
            </div>

            <dl className="mt-3.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {ESTADOS_HOY.map((s) => (
                <div key={s.valor} className="rounded-xl border border-borde-suave bg-cabecera px-3 py-2.5">
                  <dd className="text-[26px] font-extrabold leading-[1.1] tracking-tight text-marino">{e[s.valor]}</dd>
                  <dt className="mt-1 flex items-center gap-1.5 text-xs font-bold leading-tight text-texto-suave">
                    <span aria-hidden="true" className={`size-2 flex-none rounded-full ${s.color}`} />{s.texto}
                  </dt>
                </div>
              ))}
            </dl>

            {ingresos?.ultima && <Ultima u={ingresos.ultima} />}
            {ingresos && <IngresosDelDia datos={ingresos} />}

            {estado.por_sede.length > 0 && (
              <section aria-label="Por sede" className="mt-4">
                <h3 className="flex items-center gap-2.5 text-[13px] font-extrabold text-marino after:h-px after:flex-1 after:bg-borde-suave">Por sede</h3>
                <ul>
                  {estado.por_sede.map((s) => {
                    const pct = s.esperadas > 0 ? Math.round((s.presentes / s.esperadas) * 100) : 0
                    return (
                      <li key={s.sede_id} className="grid grid-cols-[minmax(0,1fr)_3rem_auto] items-center gap-x-3.5 gap-y-1 py-2 text-[13px] font-bold sm:grid-cols-[7.5rem_minmax(0,1fr)_3rem_7rem]">
                        <span className="truncate font-extrabold text-marino" title={s.sede}>{s.sede}</span>
                        <span role="img" aria-label={`${s.presentes} de ${s.esperadas} en jornada`} className="order-last col-span-3 h-2 overflow-hidden rounded-full bg-lienzo sm:order-none sm:col-span-1">
                          <span className="block h-full rounded-full bg-ok" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="text-right font-extrabold text-marino">{s.presentes}/{s.esperadas}</span>
                        <span className={`text-xs ${s.sin_ingreso > 0 ? 'font-extrabold text-error' : 'font-semibold text-texto-suave'}`}>
                          {s.sin_ingreso > 0 ? `${s.sin_ingreso} sin ingreso` : 'Sin pendientes'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </section>
  )
}
