import { Campo } from './ui'
import { DIAS } from '../lib/horario'

export interface ValorHorario { inicio: string; fin: string; dias: number[] }

/** Hora de entrada, hora de salida y días laborables. Lo usan el alta y la edición del horario. */
export function CamposHorario({ valor, onCambio }: { valor: ValorHorario; onCambio: (v: ValorHorario) => void }) {
  const alternar = (n: number) =>
    onCambio({ ...valor, dias: valor.dias.includes(n) ? valor.dias.filter((d) => d !== n) : [...valor.dias, n].sort((a, b) => a - b) })

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Hora de entrada" type="time" required value={valor.inicio}
          onChange={(e) => onCambio({ ...valor, inicio: e.target.value })} />
        <Campo etiqueta="Hora de salida" type="time" required value={valor.fin}
          onChange={(e) => onCambio({ ...valor, fin: e.target.value })} />
      </div>
      <div className="flex flex-col gap-[7px]">
        <span className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Días laborables</span>
        <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="Días laborables">
          {DIAS.map((d) => {
            const activo = valor.dias.includes(d.n)
            return (
              <button key={d.n} type="button" role="checkbox" aria-checked={activo} aria-label={d.nombre} title={d.nombre}
                onClick={() => alternar(d.n)}
                className={`rounded-[11px] border py-2.5 text-sm font-extrabold ${activo ? 'border-marino bg-marino text-white' : 'border-borde bg-lienzo text-marino'}`}>
                {d.corto}
              </button>
            )
          })}
        </div>
        <p className="text-xs font-semibold text-texto-suave">
          Marcar en un día que no está elegido, o en un feriado, genera una anomalía de «día no laborable».
        </p>
      </div>
    </div>
  )
}
