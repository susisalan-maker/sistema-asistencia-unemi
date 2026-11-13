import { filasPorTipo } from './reportesVista'
import type { AgregadoReporte } from './reportesDatos'
import { panel } from './PiezasReporte'

const CUANTOS = 5

/** «Tipos más frecuentes»: los cinco tipos de anomalía con más casos del periodo, cada uno con su barra. El detalle completo está en Reportes. */
export function TiposFrecuentes({ a }: { a: AgregadoReporte }) {
  const filas = filasPorTipo(a).slice(0, CUANTOS)
  const mayor = Math.max(1, ...filas.map((f) => f.total))
  return (
    <section aria-label="Tipos más frecuentes" className={`${panel} flex-1`}>
      <h2 className="px-5 pt-4 text-[15px] font-extrabold text-marino">Tipos más frecuentes</h2>
      <ul className="flex flex-col gap-3 px-5 pb-5 pt-3">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 text-[13px] font-bold text-texto">
            <span className="truncate">{f.texto}</span>
            <span className="font-extrabold text-marino">{f.total}</span>
            <span role="img" aria-label={`${f.total} de ${a.total} casos`} className="col-span-2 h-2 overflow-hidden rounded-full bg-lienzo">
              <span className="block h-full rounded-full bg-marino" style={{ width: `${(f.total / mayor) * 100}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
