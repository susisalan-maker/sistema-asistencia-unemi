import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Chip } from '../../components/ui'
import { RETRASO_GRAVE_MIN, textoRetraso, textoUltimaMarcacion, type EstadoHoy } from './estadoHoy'
import { panel } from './PiezasReporte'

const FILAS_VISIBLES = 3

/**
 * «Sin ingreso»: quiénes ya pasaron su hora de ingreso más la tolerancia y todavía no han marcado. No se sabe el motivo (permiso,
 * enfermedad…): solo que no han marcado. Muestra tres; «Ver las N» despliega el resto. Sin personas que mostrar, no se dibuja.
 */
export function SinIngreso({ estado }: { estado: EstadoHoy | null }) {
  const [verTodas, setVerTodas] = useState(false)
  if (!estado || estado.esperadas === 0) return null

  const faltan = estado.faltan
  const visibles = verTodas ? faltan : faltan.slice(0, FILAS_VISIBLES)
  const n = estado.por_estado.sin_ingreso

  return (
    <section aria-label="Personas sin ingreso" className={`${panel} flex-1`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="text-[15px] font-extrabold text-marino">Sin ingreso</h2>
        <Chip tono="neutro">{n} {n === 1 ? 'persona' : 'personas'}</Chip>
        <span className="text-[13px] font-semibold text-texto-suave">Pasó su hora más la tolerancia</span>
        {faltan.length > FILAS_VISIBLES && (
          <button type="button" onClick={() => setVerTodas((v) => !v)} aria-expanded={verTodas}
            className="text-[13px] font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">
            {verTodas ? 'Ver menos' : `Ver las ${faltan.length}`}
          </button>
        )}
      </div>

      {faltan.length === 0 ? (
        <p className="px-5 pb-4 pt-3 text-sm font-semibold text-ok">Todos los que ya debían ingresar lo hicieron.</p>
      ) : (
        <ul className="mt-2 pb-1">
          {visibles.map((p) => (
            <li key={p.usuario_id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-borde-suave px-5 py-3 first:border-t-0">
              <div className="min-w-0 flex-1 basis-40">
                <b className="block truncate text-sm font-extrabold text-marino" title={p.nombre}>{p.nombre}</b>
                <span className="block truncate text-[13px] font-semibold text-texto-suave" title={`Última marcación: ${textoUltimaMarcacion(p.ultima, estado.hoy)}`}>
                  {p.sede ?? '—'} · jornada {p.jornada_inicio}
                </span>
              </div>
              <Chip tono={p.minutos_retraso >= RETRASO_GRAVE_MIN ? 'error' : 'aviso'}>{textoRetraso(p.minutos_retraso)} de retraso</Chip>
              <Link to={`/admin/anomalias?estado=todas&q=${encodeURIComponent(p.nombre)}`}
                className="rounded-[9px] px-2 py-1.5 text-[13px] font-extrabold text-marino hover:underline max-sm:min-h-11 max-sm:py-3">Ver casos</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
