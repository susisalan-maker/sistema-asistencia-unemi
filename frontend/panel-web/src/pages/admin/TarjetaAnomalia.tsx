import { Link } from 'react-router-dom'
import { Chip } from '../../components/ui'
import { iniciales } from '../../lib/texto'
import {
  CLASIFICACIONES_IA, ESTADOS, caso, clasificacionDe, fechaHora, nombreDe, nombreDeTipo,
  type FilaAnomalia,
} from './anomaliasTipos'

/**
 * Tarjeta de una anomalía en la bandeja. Al pasar el cursor (o enfocar el botón) se eleva un poco y gana sombra;
 * con «reducir movimiento» activado en el sistema no se desplaza, solo cambia la sombra.
 */
export function TarjetaAnomalia({ fila: f }: { fila: FilaAnomalia }) {
  const clasificacion = clasificacionDe(f)
  return (
    <article
      className="flex flex-col gap-4 rounded-[18px] border border-borde-suave bg-white p-5 shadow-[0_2px_8px_rgba(27,42,110,.04)] transition duration-200 ease-out hover:-translate-y-0.5 hover:border-celeste hover:shadow-[0_10px_24px_rgba(27,42,110,.12)] focus-within:-translate-y-0.5 focus-within:shadow-[0_10px_24px_rgba(27,42,110,.12)] motion-reduce:transform-none"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-extrabold text-marino">#{caso(f.numero)}</span>
        <Chip tono={ESTADOS[f.estado].tono}>{ESTADOS[f.estado].texto}</Chip>
      </div>
      {clasificacion && (
        <div><Chip tono={CLASIFICACIONES_IA[clasificacion].tono}>{CLASIFICACIONES_IA[clasificacion].texto}</Chip></div>
      )}
      <div>
        <div className="flex items-stretch gap-2.5">
          <span aria-hidden="true" className="w-1 flex-none rounded-full bg-ambar" />
          <h2 className="text-[17px] font-extrabold leading-snug text-marino">{nombreDeTipo(f.tipo)}</h2>
        </div>
        <p className="mt-1.5 line-clamp-2 min-h-[2.6em] text-sm font-semibold text-texto-suave" title={f.detalle ?? undefined}>{f.detalle ?? 'Sin detalle'}</p>
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-lienzo px-3.5 py-3">
        <div className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">
          {f.usuarios ? iniciales(f.usuarios.nombres, f.usuarios.apellidos) : '?'}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold text-marino">{nombreDe(f.usuarios)}</div>
          <div className="truncate text-xs font-semibold text-etiqueta">{f.usuarios?.email}</div>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3">
        <span className="text-[13px] font-bold text-texto-suave">{fechaHora(f.created_at)}</span>
        <Link to={`/admin/anomalias/${f.id}`} aria-label={`Revisar el caso ${caso(f.numero)}`}
          className="rounded-[11px] bg-marino px-4 py-2 text-[13px] font-extrabold text-white hover:brightness-110">
          Revisar
        </Link>
      </div>
    </article>
  )
}
