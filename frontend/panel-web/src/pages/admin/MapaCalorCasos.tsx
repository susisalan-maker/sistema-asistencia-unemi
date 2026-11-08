import { NIVELES, type MapaCalor } from './mapaCalor'
import { tarjeta } from './PiezasReporte'

/** Un solo color (el marino del panel) de claro a oscuro: más oscuro = más casos. */
const COLOR_NIVEL = ['bg-lienzo', 'bg-marino/20', 'bg-marino/40', 'bg-marino/70', 'bg-marino']
const hh = (h: number) => String(h).padStart(2, '0')

/**
 * «¿Cuándo ocurren las anomalías?»: día de la semana × hora de Ecuador, en poco espacio. Cada celda dice su día, hora y cantidad al
 * pasar el cursor; para quien lee con lector de pantalla, la frase del pico dice lo mismo que el dibujo.
 */
export function MapaCalorCasos({ mapa }: { mapa: MapaCalor }) {
  return (
    <section aria-label="Cuándo ocurren las anomalías" className={`${tarjeta} !p-4`}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-[15px] font-extrabold text-marino">¿Cuándo ocurren las anomalías?</h2>
        <span className="text-xs font-semibold text-etiqueta">Día × hora · hora de Ecuador</span>
      </div>

      <div className="overflow-x-auto">
        <div role="img" aria-label={mapa.resumen} className="min-w-[30rem]">
          <div className="grid items-center gap-[3px]" style={{ gridTemplateColumns: `2.25rem repeat(${mapa.horas.length}, minmax(0, 1fr))` }}>
            <span aria-hidden="true" />
            {mapa.horas.map((h) => (
              <span key={h} aria-hidden="true" className="text-center text-[10px] font-bold text-etiqueta">{h % 2 === 0 ? hh(h) : ''}</span>
            ))}
            {mapa.filas.map((f) => (
              <div key={f.dia} className="contents">
                <span aria-hidden="true" className="text-xs font-bold capitalize text-texto-suave">{f.nombre.slice(0, 3)}</span>
                {f.celdas.map((c) => (
                  <span key={c.hora} aria-hidden="true" title={c.titulo} className={`h-[17px] rounded-[4px] ${COLOR_NIVEL[c.nivel]}`} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-xs font-semibold text-texto">{mapa.resumenCorto}</p>
        <div aria-hidden="true" className="flex flex-none items-center gap-1 text-[10px] font-bold text-etiqueta">
          <span>Menos</span>
          {Array.from({ length: NIVELES + 1 }, (_, n) => <span key={n} className={`size-3 rounded-[3px] ${COLOR_NIVEL[n]}`} />)}
          <span>Más</span>
        </div>
      </div>
    </section>
  )
}
