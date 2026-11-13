import { formaIngresos, horaComoTexto, type IngresosHoy } from './ingresosHoy'

const puntos = (lista: { x: number; y: number }[]) => lista.map((p) => `${(p.x * 10).toFixed(1)},${(100 - p.y).toFixed(2)}`)
const camino = (lista: { x: number; y: number }[]) => puntos(lista).map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')

/**
 * «Ingresos a lo largo del día»: cuántas personas debían haber ingresado a cada hora (línea punteada) frente a cuántas ya lo hicieron
 * (línea continua, solo hasta ahora). La distancia entre las dos en «Ahora» es la gente que falta. Los datos los calcula la base.
 */
export function IngresosDelDia({ datos }: { datos: IngresosHoy }) {
  const f = formaIngresos(datos)
  if (!f) return null
  const falta = Math.max(0, datos.esperados_ahora - datos.reales_ahora)
  const resumen = `A las ${horaComoTexto(datos.ahora_hora)} han ingresado ${datos.reales_ahora} de ${datos.esperados_ahora} personas esperadas${falta > 0 ? `; faltan ${falta}` : ''}.`
  const area = `${camino(f.reales)} L${(f.ahora.x * 10).toFixed(1)} 100 L${(f.reales[0].x * 10).toFixed(1)} 100 Z`
  const ahoraEnBorde = f.ahora.x > 80

  return (
    <div className="mt-4 flex min-h-[230px] flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-extrabold text-marino">Ingresos a lo largo del día</h3>
        <ul aria-hidden="true" className="ml-auto flex gap-4 text-xs font-bold text-texto-suave">
          <li className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-marino-suave" />Esperados</li>
          <li className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-sm bg-ok" />Reales</li>
        </ul>
      </div>

      <div role="img" aria-label={resumen} className="relative mt-2 min-h-[200px] flex-1">
        {/* Eje de personas */}
        <div aria-hidden="true" className="absolute inset-y-2 bottom-[26px] left-0 w-8">
          {f.marcasY.map((v) => <span key={v} className="absolute right-1.5 translate-y-1/2 text-xs font-semibold text-texto-suave" style={{ bottom: `${(v / f.tope) * 100}%` }}>{v}</span>)}
        </div>
        {/* Área de dibujo */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-[26px] top-2 left-9 right-2">
          {f.marcasY.map((v) => <div key={v} className="absolute inset-x-0 border-t border-dashed border-borde" style={{ bottom: `${(v / f.tope) * 100}%` }} />)}
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <path d={area} className="fill-ok-fondo" />
            <path d={camino(f.esperados)} fill="none" strokeWidth="2" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" className="stroke-marino-suave" />
            <path d={camino(f.reales)} fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="stroke-ok" />
          </svg>
          <div className="absolute -top-1 bottom-0 w-0.5 -translate-x-1/2 bg-marino" style={{ left: `${f.ahora.x}%` }}>
            <span className={`absolute top-0 whitespace-nowrap rounded-full bg-marino px-2.5 py-0.5 text-xs font-extrabold text-white ${ahoraEnBorde ? 'right-2' : 'left-2'}`}>Ahora {horaComoTexto(datos.ahora_hora)}</span>
          </div>
          <span className="absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full border-[3px] border-white bg-ok shadow-[0_1px_3px_rgba(0,0,0,.3)]" style={{ left: `${f.ahora.x}%`, bottom: `${f.ahora.y}%` }} />
        </div>
        {/* Eje de horas */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 left-9 right-2 h-[22px]">
          {f.marcasX.map((h) => <span key={h} className="absolute -translate-x-1/2 text-xs font-semibold text-texto-suave" style={{ left: `${((h - f.desde) / (f.hasta - f.desde)) * 100}%` }}>{String(h % 24).padStart(2, '0')}:00</span>)}
        </div>
      </div>
    </div>
  )
}
