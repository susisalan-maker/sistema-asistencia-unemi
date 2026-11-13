import { ejeDe } from './ejeGrafica'
import { panel } from './PiezasReporte'
import { picoDe, type ColumnaComparada } from './dashboardSerie'

const casos = (n: number) => `${n} ${n === 1 ? 'caso' : 'casos'}`

interface Props {
  columnas: ColumnaComparada[]
  unidad: 'dia' | 'semana'
  /** «Semana anterior», «Mes anterior»… para la leyenda. */
  nombreAnterior: string
}

/** «Anomalías por día»: el periodo contra el anterior, con el pico en ámbar y dicho con palabras. Si no hubo casos, no se dibuja (lo dice el Dashboard). */
export function AnomaliasPorDia({ columnas, unidad, nombreAnterior }: Props) {
  const hayAnterior = columnas.some((c) => c.anterior !== null)
  const pico = picoDe(columnas)
  const maximo = Math.max(1, ...columnas.map((c) => Math.max(c.actual, c.anterior ?? 0)))
  const eje = ejeDe(maximo)
  const cadaEtiqueta = Math.max(1, Math.ceil(columnas.length / 12))
  const resumen = `Casos por ${unidad === 'dia' ? 'día' : 'semana'}: ${columnas.map((c) => `${c.titulo}, ${c.actual}`).join('; ')}.`

  return (
    <section aria-label={`Anomalías por ${unidad === 'dia' ? 'día' : 'semana'}`} className={`${panel} flex-1`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 pt-4">
        <h2 className="text-[15px] font-extrabold text-marino">Anomalías por {unidad === 'dia' ? 'día' : 'semana'}</h2>
        <ul aria-hidden="true" className="ml-auto flex gap-4 text-xs font-bold text-texto-suave">
          <li className="flex items-center gap-1.5"><span className="size-3 rounded bg-marino" />Este periodo</li>
          {hayAnterior && <li className="flex items-center gap-1.5"><span className="size-3 rounded bg-celeste-borde" />{nombreAnterior}</li>}
        </ul>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-4 pt-3">
        <div role="img" aria-label={resumen} className="relative min-h-[220px] flex-1">
          <div aria-hidden="true" className="absolute bottom-[26px] left-0 top-2 w-8">
            {eje.marcas.map((v) => <span key={v} className="absolute right-1.5 translate-y-1/2 text-xs font-semibold text-texto-suave" style={{ bottom: `${(v / eje.tope) * 100}%` }}>{v}</span>)}
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-[26px] left-9 top-2">
            {eje.marcas.map((v) => <div key={v} className="absolute inset-x-0 border-t border-dashed border-borde" style={{ bottom: `${(v / eje.tope) * 100}%` }} />)}
            <div className="absolute inset-0 flex gap-1.5">
              {columnas.map((c) => (
                <div key={c.clave} title={`${c.titulo}: ${casos(c.actual)}${c.anterior !== null ? ` · antes ${c.anterior}` : ''}`}
                  className="flex min-w-0 flex-1 items-end justify-center gap-1 rounded-lg px-2 hover:bg-cabecera">
                  {c.anterior !== null && <span className="max-w-[30px] flex-1 rounded-t-md bg-celeste-borde" style={{ height: `${(c.anterior / eje.tope) * 100}%` }} />}
                  <span className={`max-w-[30px] flex-1 rounded-t-md ${pico && c.clave === pico.clave ? 'bg-ambar' : 'bg-marino'}`} style={{ height: `${(c.actual / eje.tope) * 100}%` }} />
                </div>
              ))}
            </div>
          </div>
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 left-9 flex h-[22px] gap-1.5">
            {columnas.map((c, i) => <span key={c.clave} className="min-w-0 flex-1 truncate text-center text-xs font-bold text-texto-suave">{i % cadaEtiqueta === 0 ? c.etiqueta : ''}</span>)}
          </div>
        </div>

        {pico && <p className="mt-3 text-[13px] font-semibold text-texto">El pico fue <b className="font-extrabold text-marino">{pico.enFrase}</b>, con <b className="font-extrabold text-marino">{casos(pico.actual)}</b>.</p>}
      </div>
    </section>
  )
}
