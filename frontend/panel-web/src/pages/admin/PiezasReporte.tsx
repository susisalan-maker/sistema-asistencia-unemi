import { Esqueleto } from '../../components/Esqueleto'
import { MAXIMO_DIAS, PERIODOS, PERIODO_INICIAL, diasDelRango, moverReferencia } from './reportesPeriodo'
import type { FiltrosPeriodo } from './useFiltrosPeriodo'

/** Estilos y piezas que comparten el Dashboard y Reportes. */
export const selector = 'rounded-[11px] border border-borde bg-white px-3 py-2.5 text-[13px] font-bold text-marino outline-none focus:border-marino'
export const tarjeta = 'rounded-[18px] border border-borde-suave bg-white p-5 shadow-[0_2px_8px_rgba(27,42,110,.04)]'
export const botonPagina = 'rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40'

export function Indicador({ titulo, valor, detalle, aviso, className = '' }: { titulo: string; valor: string; detalle: string; aviso?: boolean; className?: string }) {
  return (
    <div className={`${tarjeta} ${className}`}>
      <p className="text-[11px] font-extrabold text-etiqueta">{titulo}</p>
      <p className="mt-1.5 text-[28px] font-extrabold leading-none tracking-tight text-marino">{valor}</p>
      <p className={`mt-2 text-xs font-semibold ${aviso ? 'text-aviso' : 'text-texto-suave'}`}>{detalle}</p>
    </div>
  )
}

export function EsqueletoIndicadores({ cantidad = 4 }: { cantidad?: number }) {
  return (
    <div aria-hidden="true" className={`grid gap-4 ${cantidad === 2 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]' : cantidad === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
      {Array.from({ length: cantidad }, (_, i) => <div key={i} className={tarjeta}><Esqueleto className="h-3 w-24" /><Esqueleto className="mt-3 h-7 w-20" /><Esqueleto className="mt-3 h-3 w-40" /></div>)}
    </div>
  )
}

/** Semana / Mes / Rango, las flechas para moverse de periodo y la sede: la misma barra en el Dashboard y en Reportes. */
export function BarraFiltros({ f }: { f: FiltrosPeriodo }) {
  const { periodo, rango, hoy, nombrePeriodo, sedes, sedeId, cambiar } = f
  const hoyDentro = rango.hasta >= hoy
  return (
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
  )
}

export const avisoRangoLargo = `El periodo puede abarcar como máximo ${MAXIMO_DIAS} días (un año). Acorta el rango.`
