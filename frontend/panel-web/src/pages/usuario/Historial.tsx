import { useState } from 'react'
import { Aviso, Boton, Chip } from '../../components/ui'
import { horaLocal, nombreDeTipo, rotuloDeDia, simboloDeTipo } from '../../lib/marcacion'
import { useHistorial } from '../../lib/useJornada'

const RANGOS = [7, 30] as const
const ESTADO_ANOMALIA: Record<string, string> = {
  pendiente: 'abierta', en_revision: 'en revisión', justificada: 'justificada', rechazada: 'rechazada', sin_justificar: 'sin justificar',
}

/** Historial (M4 del mockup): solo consulta, agrupado por día. */
export default function Historial() {
  const [dias, setDias] = useState<(typeof RANGOS)[number]>(7)
  const { historial, error, recargar } = useHistorial(dias)

  const subtitulo = historial ? `Últimos ${dias} días · ${historial.total} ${historial.total === 1 ? 'marcación' : 'marcaciones'}` : `Últimos ${dias} días`
  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 p-4 sm:p-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Historial</h1>
          <p className="text-[13px] font-semibold text-texto-suave">{subtitulo}</p>
        </div>
        <div role="group" aria-label="Periodo" className="flex rounded-full bg-white p-1 ring-1 ring-borde-suave">
          {RANGOS.map((r) => (
            <button key={r} type="button" aria-pressed={dias === r} onClick={() => setDias(r)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${dias === r ? 'bg-marino font-extrabold text-white' : 'font-bold text-texto-suave hover:text-marino'}`}>
              {r} días
            </button>
          ))}
        </div>
      </header>

      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <div className="max-w-[200px]"><Boton variante="borde" onClick={() => void recargar()}>Reintentar</Boton></div>
        </>
      )}
      {!error && !historial && <p role="progressbar" aria-label="Cargando tu historial" className="text-sm font-semibold text-texto-suave">Cargando tu historial…</p>}
      {!error && historial?.total === 0 && (
        <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">Aún no tienes marcaciones en los últimos {dias} días.</div>
      )}

      {historial?.dias.map((dia) => (
        <section key={dia.fecha} aria-label={rotuloDeDia(dia.fecha)} className="space-y-2">
          <h2 className="pt-1 text-[11px] font-extrabold uppercase tracking-[.1em] text-etiqueta">{rotuloDeDia(dia.fecha)}</h2>
          <ul className="divide-y divide-lienzo rounded-[20px] border border-borde-suave bg-white px-4">
            {dia.marcaciones.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3.5">
                <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-full text-base font-extrabold ${m.anomalia ? 'bg-aviso-fondo text-aviso' : 'bg-celeste text-marino'}`}>
                  {m.anomalia ? '!' : simboloDeTipo(m.tipo)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-extrabold text-marino">{nombreDeTipo(m.tipo)} {horaLocal(m.fecha_hora)}</p>
                  {m.lugar && <p className="truncate text-xs font-semibold text-etiqueta">{m.lugar}</p>}
                  {m.anomalia && <p className="text-xs font-bold text-aviso">Anomalía {ESTADO_ANOMALIA[m.anomalia.estado] ?? m.anomalia.estado}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Chip tono="ok">SINCRONIZADO</Chip>
                  {m.origen === 'web' && <Chip tono="neutro">WEB</Chip>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
