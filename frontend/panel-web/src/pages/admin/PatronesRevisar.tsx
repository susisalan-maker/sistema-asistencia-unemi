import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Chip } from '../../components/ui'
import { nombreDeTipo } from './anomaliasTipos'
import { sugerenciaPara, type PatronPersona } from './patrones'
import { panel } from './PiezasReporte'

const VISIBLES = 3

interface Props { patrones: PatronPersona[] | null; error: boolean; onReintentar: () => void }

/**
 * «Patrones a revisar»: personas con 3 o más casos en 30 días. Ayuda para conversar, no para sancionar. En el Dashboard se ven las
 * primeras en una tabla; el resto, con «Ver las N». Cada nombre y «Ver historial» llevan a los casos de esa persona.
 */
export function PatronesRevisar({ patrones, error, onReintentar }: Props) {
  const [verTodos, setVerTodos] = useState(false)
  const visibles = patrones ? (verTodos ? patrones : patrones.slice(0, VISIBLES)) : []

  return (
    <section aria-label="Patrones a revisar" className={`${panel} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-3.5 pt-4">
        <h2 className="text-[15px] font-extrabold text-marino">Patrones a revisar</h2>
        <Chip tono="neutro">Últimos 30 días</Chip>
        <span className="text-[13px] font-semibold text-texto-suave">Personas con 3 o más casos. Para conversar, no para sancionar.</span>
        {patrones && patrones.length > VISIBLES && (
          <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}
            className="text-[13px] font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">{verTodos ? 'Ver menos' : `Ver las ${patrones.length}`}</button>
        )}
      </div>

      {error && !patrones ? (
        <div className="px-5 pb-5">
          <Aviso tipo="error">
            No se pudieron cargar los patrones.{' '}
            <button type="button" onClick={onReintentar} className="underline">Reintentar</button>
          </Aviso>
        </div>
      ) : !patrones ? (
        <p aria-busy="true" className="px-5 pb-5 text-sm font-semibold text-texto-suave">Cargando…</p>
      ) : patrones.length === 0 ? (
        <p className="px-5 pb-5 text-sm font-semibold text-texto-suave">Nadie tiene 3 o más casos en los últimos 30 días.</p>
      ) : (
        <div className="@container">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_5rem_6.5rem_minmax(0,1.4fr)_minmax(0,1.6fr)_7.5rem] gap-x-4 border-y border-borde-suave bg-cabecera px-5 py-2.5 text-xs font-extrabold text-texto-suave @4xl:grid">
            <span>Persona</span><span className="text-right">Casos</span><span className="text-right">Justificados</span><span>Lo más frecuente</span><span>Para conversar</span><span className="sr-only">Acción</span>
          </div>
          <ul>
            {visibles.map((p) => (
              <li key={p.usuario_id} className="grid items-center gap-x-4 gap-y-1 border-b border-borde-suave px-5 py-3 text-[13px] font-semibold text-texto last:border-b-0 hover:bg-cabecera @4xl:grid-cols-[minmax(0,1.4fr)_5rem_6.5rem_minmax(0,1.4fr)_minmax(0,1.6fr)_7.5rem]">
                <Link to={`/admin/anomalias?estado=todas&q=${encodeURIComponent(p.nombre)}`} title="Ver historial"
                  className="block truncate text-sm font-extrabold text-marino underline-offset-2 hover:underline">{p.nombre}</Link>
                <span className="@4xl:text-right"><span className="@4xl:hidden">Casos: </span>{p.total}</span>
                <span className="@4xl:text-right">{p.justificadas} {p.justificadas === 1 ? 'justificado' : 'justificados'}</span>
                <span>{nombreDeTipo(p.tipo)} <Chip tono="neutro">{p.tipo_total}</Chip></span>
                <span className="text-texto-suave">{sugerenciaPara(p.tipo)}</span>
                <Link to={`/admin/anomalias?estado=todas&q=${encodeURIComponent(p.nombre)}`} className="text-[13px] font-extrabold text-marino hover:underline @4xl:text-right">Ver historial →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
