import { tarjetaDe, type IdIndicador } from './tarjetasIndicadores'
import type { Indicadores } from './reportesDatos'

/** Los cuatro indicadores del Dashboard, en este orden. (Rechazo facial y los demás están en Reportes.) */
export const INDICADORES_DASHBOARD: IdIndicador[] = ['anomalias', 'puntualidad', 'aTiempo', 'resolucion']

/**
 * Los indicadores del periodo en una sola franja: título, número, barra con la marca de su meta (si la tiene) y una línea que dice
 * cuánto cambió frente al periodo anterior. La explicación completa se ve al pasar el cursor y la leen los lectores de pantalla.
 */
export function FranjaIndicadores({ indicadores }: { indicadores: Indicadores }) {
  return (
    <section aria-label="Indicadores del periodo" className="grid grid-cols-1 gap-px overflow-hidden rounded-[18px] border border-borde-suave bg-borde-suave shadow-[0_2px_8px_rgba(27,42,110,.04)] @xl:grid-cols-2 @5xl:grid-cols-4">
      {INDICADORES_DASHBOARD.map((id) => {
        const t = tarjetaDe(id, indicadores)
        return (
          <div key={id} title={t.ayuda} className="flex flex-col gap-1.5 bg-white px-5 py-4">
            <p className="text-[13px] font-bold text-texto-suave">{t.titulo}</p>
            <p className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-marino">{t.valor}</p>
            {t.barra && t.barra.pct !== null && (
              <div role="img" aria-label={`${String(t.barra.pct).replace('.', ',')} %, meta de referencia ${t.barra.meta} %`} className="relative mt-1 h-1.5 rounded-full bg-lienzo">
                <div className="h-full rounded-full bg-marino" style={{ width: `${Math.min(100, Math.max(0, t.barra.pct))}%` }} />
                <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded-sm bg-ambar" style={{ left: `${t.barra.meta}%` }} />
              </div>
            )}
            <p className={`text-xs font-semibold leading-snug ${t.aviso ? 'text-aviso' : 'text-texto-suave'}`}>{t.detalle}</p>
          </div>
        )
      })}
    </section>
  )
}
