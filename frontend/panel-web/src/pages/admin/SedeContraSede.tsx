import { Aviso } from '../../components/ui'
import { Esqueleto } from '../../components/Esqueleto'
import { tarjeta } from './PiezasReporte'
import { coma, flechaCambio, textoHoras } from './reportesVista'
import type { FilaSede } from './sedesComparar'

const COLUMNAS = '@2xl:grid @2xl:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))] @2xl:gap-3'
const TONO = { ok: 'text-ok', error: 'text-error', neutro: 'text-etiqueta' }

/** Una cifra con su flecha de cambio; la lectura completa va para el lector de pantalla. */
function Cambio({ cambio, unidad, masEsMalo }: { cambio: number | null; unidad: '%' | 'pts'; masEsMalo: boolean }) {
  const f = flechaCambio(cambio, unidad, masEsMalo)
  return <span className={`ml-1.5 text-xs font-extrabold ${TONO[f.tono]}`}><span aria-hidden="true">{f.texto}</span><span className="sr-only">, {f.lectura}</span></span>
}

interface Props { filas: FilaSede[] | null; error: boolean; onReintentar: () => void }

/**
 * «Sede contra sede»: las mismas cifras de cada sede, una al lado de la otra y comparadas con el periodo anterior. Sirve para ver
 * dónde conviene mirar primero; no ordena ni califica a nadie.
 */
export function SedeContraSede({ filas, error, onReintentar }: Props) {
  return (
    <section aria-label="Sede contra sede" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-[17px] font-extrabold text-marino">Sede contra sede</h2>
        <span className="text-xs font-semibold text-texto-suave">Comparado con el periodo anterior</span>
      </div>
      {error && !filas ? (
        <Aviso tipo="error">No se pudo cargar el comparativo. <button type="button" onClick={onReintentar} className="underline">Reintentar</button></Aviso>
      ) : !filas ? (
        <div aria-hidden="true" className={tarjeta}><Esqueleto className="h-4 w-full" /><Esqueleto className="mt-3 h-4 w-full" /><Esqueleto className="mt-3 h-4 w-[70%]" /></div>
      ) : (
        <div className="@container tabla-ancha overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} tabla-cabecera border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Sede</div><div>Anomalías</div><div>Puntualidad</div><div>Tiempo medio</div><div>Rechazo facial</div>
          </div>
          {filas.map((f) => (
            <div key={f.sede_id} className={`${COLUMNAS} tabla-fila items-center border-b border-lienzo px-4 py-4 text-sm font-semibold text-texto last:border-b-0 @2xl:px-5 @2xl:py-3.5`}>
              <div data-etiqueta="Sede" className="font-extrabold text-marino">{f.sede}</div>
              <div data-etiqueta="Anomalías">{f.ind.total}<Cambio cambio={f.ind.variacionPct} unidad="%" masEsMalo /></div>
              <div data-etiqueta="Puntualidad">{f.ind.puntualidadPct === null ? '—' : `${coma(f.ind.puntualidadPct)} %`}{f.ind.puntualidadPct !== null && <Cambio cambio={f.ind.puntualidadPts} unidad="pts" masEsMalo={false} />}</div>
              <div data-etiqueta="Tiempo medio">{f.ind.resolucionHoras === null ? '—' : textoHoras(f.ind.resolucionHoras)}</div>
              <div data-etiqueta="Rechazo facial">{f.ind.rechazoPct === null ? '—' : `${coma(f.ind.rechazoPct)} %`}{f.ind.rechazoPct !== null && <Cambio cambio={f.ind.rechazoPts} unidad="pts" masEsMalo />}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
