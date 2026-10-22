import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Boton, Chip } from '../../components/ui'
import { ApiError } from '../../lib/api'
import {
  type Anomalia, ESTADOS, etiquetaDia, fechaCorta, iconoDeAnomalia, listarAnomalias, nombreDeAnomalia, textoCaso, tiempoRestante,
} from '../../lib/anomalias'
import { useAvisos } from './contexto'

/** Avisos (M5 del mockup): las anomalías que esperan explicación y, debajo, las anteriores. */
export default function Avisos() {
  const { recargar: recontar } = useAvisos()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setLista(await listarAnomalias())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus avisos.')
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])
  // El contador de la pestaña se actualiza también cuando se vuelve a esta pantalla.
  useEffect(() => { void recontar() }, [recontar])

  const porExplicar = (lista ?? []).filter((a) => a.puede_justificar)
  const anteriores = (lista ?? []).filter((a) => !a.puede_justificar)
  const subtitulo =
    lista === null ? ' '
    : porExplicar.length === 0 ? 'No tienes anomalías por explicar'
    : porExplicar.length === 1 ? '1 anomalía requiere tu explicación'
    : `${porExplicar.length} anomalías requieren tu explicación`

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 p-4 sm:p-7">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Avisos</h1>
        <p className="text-[13px] font-semibold text-texto-suave">{subtitulo}</p>
      </header>

      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <div className="max-w-[200px]"><Boton variante="borde" onClick={() => void cargar()}>Reintentar</Boton></div>
        </>
      )}
      {!error && lista === null && <p role="progressbar" aria-label="Cargando tus avisos" className="text-sm font-semibold text-texto-suave">Cargando tus avisos…</p>}
      {!error && lista?.length === 0 && (
        <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">No tienes avisos. ¡Todo en orden!</div>
      )}

      {porExplicar.map((a) => <TarjetaAviso key={a.id} a={a} />)}

      {anteriores.length > 0 && (
        <section aria-labelledby="anteriores" className="space-y-2">
          <h2 id="anteriores" className="pt-2 text-[11px] font-extrabold uppercase tracking-[.1em] text-etiqueta">Anteriores</h2>
          <ul className="divide-y divide-lienzo rounded-[20px] border border-borde-suave bg-white px-4">
            {anteriores.map((a) => {
              const estado = ESTADOS[a.estado]
              return (
                <li key={a.id}>
                  <Link to={`/usuario/avisos/${a.id}`} aria-label={`${textoCaso(a.caso)}, ${nombreDeAnomalia(a.tipo)}`}
                    className="flex items-center gap-3 py-3.5 hover:opacity-80">
                    <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-celeste text-base font-extrabold text-marino">{iconoDeAnomalia(a.tipo)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[15px] font-extrabold leading-snug text-marino">{nombreDeAnomalia(a.tipo)}</span>
                      <span className="block text-xs font-semibold text-etiqueta">{fechaCorta(a.creada)} · {textoCaso(a.caso)}</span>
                    </span>
                    <Chip tono={estado.tono}>{estado.texto}</Chip>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function TarjetaAviso({ a }: { a: Anomalia }) {
  const resta = tiempoRestante(a.vence)
  return (
    <article className="space-y-3.5 rounded-[22px] border border-[#f0ddb7] bg-white p-5 shadow-[0_8px_20px_rgba(245,166,35,.14)]">
      <div className="flex items-start gap-3.5">
        <span aria-hidden="true" className="grid size-12 flex-none place-items-center rounded-full bg-aviso-fondo text-xl font-extrabold text-aviso">!</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-extrabold text-marino">Anomalía detectada</h2>
          <p className="text-[13px] font-bold text-etiqueta">{etiquetaDia(a.creada)} h · {textoCaso(a.caso)}</p>
        </div>
        <span aria-hidden="true" className="mt-2 size-2 flex-none rounded-full bg-ambar" />
      </div>
      <p className="text-[15px] font-medium leading-relaxed text-texto">
        <span className="font-extrabold text-marino">{nombreDeAnomalia(a.tipo)}</span>
        {a.detalle ? `. ${a.detalle}` : ''}
      </p>
      {resta && <p className="text-[13px] font-bold text-aviso">Te quedan {resta} para explicarlo</p>}
      <Link to={`/usuario/avisos/${a.id}`}
        className="grid h-12 w-full place-items-center rounded-[14px] bg-ambar text-[15px] font-extrabold text-ambar-tinta hover:brightness-95 focus-visible:outline-2 focus-visible:outline-marino sm:max-w-[220px]">
        Explicar
      </Link>
    </article>
  )
}
