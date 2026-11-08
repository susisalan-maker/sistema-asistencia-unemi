import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso } from '../../components/ui'
import { nombreDeTipo } from './anomaliasTipos'
import { sugerenciaPara, type PatronPersona } from './patrones'
import { tarjeta } from './PiezasReporte'

const VISIBLES = 3

interface Props { patrones: PatronPersona[] | null; error: boolean; onReintentar: () => void }

/**
 * «Patrones a revisar»: personas con 3 o más casos en 30 días. Ayuda para conversar, no para sancionar. En el Dashboard se ven las
 * primeras; el resto, con «Ver las N». Cada nombre lleva al historial de esa persona.
 */
export function PatronesRevisar({ patrones, error, onReintentar }: Props) {
  const [verTodos, setVerTodos] = useState(false)
  const visibles = patrones ? (verTodos ? patrones : patrones.slice(0, VISIBLES)) : []

  return (
    <section aria-label="Patrones a revisar" className={`${tarjeta} !p-4`}>
      <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-[15px] font-extrabold text-marino">Patrones a revisar</h2>
        <span className="rounded-full bg-celeste px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-marino">30 días</span>
      </div>

      {error && !patrones ? (
        <Aviso tipo="error">
          No se pudieron cargar los patrones.{' '}
          <button type="button" onClick={onReintentar} className="underline">Reintentar</button>
        </Aviso>
      ) : !patrones ? (
        <p aria-busy="true" className="text-sm font-semibold text-texto-suave">Cargando…</p>
      ) : patrones.length === 0 ? (
        <p className="text-sm font-semibold text-texto-suave">Nadie tiene 3 o más casos en los últimos 30 días.</p>
      ) : (
        <ul className="divide-y divide-lienzo">
          {visibles.map((p) => (
            <li key={p.usuario_id} className="py-1.5 first:pt-0">
              <Link to={`/admin/anomalias?estado=todas&q=${encodeURIComponent(p.nombre)}`} title="Ver historial"
                className="block truncate text-[13px] font-extrabold text-marino underline-offset-2 hover:underline">{p.nombre}</Link>
              <p className="text-xs font-semibold text-texto-suave">
                {p.total} casos ({p.justificadas} {p.justificadas === 1 ? 'justificado' : 'justificados'}) · {nombreDeTipo(p.tipo)} ({p.tipo_total}) → {sugerenciaPara(p.tipo)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 text-[11px] font-semibold text-etiqueta">Para conversar, no para sancionar.</p>
        {patrones && patrones.length > VISIBLES && (
          <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}
            className="text-xs font-extrabold text-marino underline-offset-2 hover:underline">{verTodos ? 'Ver menos' : `Ver las ${patrones.length}`}</button>
        )}
      </div>
    </section>
  )
}
