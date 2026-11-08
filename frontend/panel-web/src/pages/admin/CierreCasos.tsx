import { tarjeta } from './PiezasReporte'
import type { AgregadoReporte } from './reportesDatos'

const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

interface Fila { clave: string; texto: string; n: number; color: string }

/**
 * «¿Quién cerró cada caso?»: de los casos del periodo, cuántos aprobó una persona, cuántos rechazó y cuántos vencieron sin
 * justificar (esos esperan decisión). La IA no aparece como quien decide: solo sugiere. Si hubiera casos cerrados sin una persona
 * (no debería), se muestran aparte para revisarlos.
 */
export function CierreCasos({ a }: { a: AgregadoReporte }) {
  const c = a.cierre
  const filas: Fila[] = [
    { clave: 'aprobadas', texto: 'Aprobados por el administrador', n: c.aprobadas, color: 'bg-ok' },
    { clave: 'rechazadas', texto: 'Rechazados por el administrador', n: c.rechazadas, color: 'bg-error' },
    { clave: 'sin-justificar', texto: 'Sin justificar a tiempo (esperan decisión)', n: c.sin_justificar, color: 'bg-etiqueta' },
  ]
  if (c.sin_persona > 0) filas.push({ clave: 'sin-persona', texto: 'Cerrados sin que una persona los decidiera', n: c.sin_persona, color: 'bg-aviso' })
  const total = filas.reduce((s, f) => s + f.n, 0)
  const entramite = Math.max(0, a.total - total)

  return (
    <section aria-label="Quién cerró cada caso" className={`${tarjeta} !p-4`}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-[15px] font-extrabold text-marino">¿Quién cerró cada caso?</h2>
        {total > 0 && <span className="text-xs font-semibold text-etiqueta">{total} {total === 1 ? 'caso con resultado' : 'casos con resultado'}</span>}
      </div>
      {total === 0 ? (
        <p className="text-sm font-semibold text-texto-suave">Aún no hay casos con resultado en este periodo.</p>
      ) : (
        <>
          <div role="img" aria-label={filas.map((f) => `${f.texto}: ${f.n}`).join('; ')} className="flex h-3 gap-[2px]">
            {filas.filter((f) => f.n > 0).map((f) => <span key={f.clave} className={`h-full min-w-[6px] rounded-md ${f.color}`} style={{ flexGrow: f.n }} />)}
          </div>
          <ul className="mt-2 divide-y divide-lienzo">
            {filas.map((f) => (
              <li key={f.clave} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-2 font-bold text-texto">
                  <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${f.color}`} />{f.texto}
                </span>
                <span className="flex-none font-extrabold text-marino">{f.n}<span className="ml-1.5 font-semibold text-etiqueta">{porcentaje(f.n, total)} %</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-[11px] font-semibold text-etiqueta">
        Todo caso lo decide una persona: la IA solo sugiere.{entramite > 0 && ` ${entramite} ${entramite === 1 ? 'caso sigue' : 'casos siguen'} en trámite.`}
      </p>
    </section>
  )
}
