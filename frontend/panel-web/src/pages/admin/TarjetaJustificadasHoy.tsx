import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contarJustificadasHoy, type JustificadasHoy } from './novedadesBandeja'

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/**
 * «Justificadas hoy»: cuántos casos justificaron las personas hoy y cuántos de ellos esperan tu decisión.
 * Se vuelve a contar cuando el estado de hoy se actualiza (`refrescarCon`). Si no se puede contar, no se dibuja:
 * es un resumen, no debe estorbar.
 */
export function TarjetaJustificadasHoy({ refrescarCon }: { refrescarCon?: number | null }) {
  const [datos, setDatos] = useState<JustificadasHoy | null>(null)
  useEffect(() => {
    let vigente = true
    contarJustificadasHoy().then((d) => { if (vigente) setDatos(d) }).catch(() => { if (vigente) setDatos(null) })
    return () => { vigente = false }
  }, [refrescarCon])
  if (!datos) return null

  const { total, porResolver } = datos
  const resueltas = total - porResolver
  const detalle = total === 0
    ? 'Nadie ha justificado todavía hoy'
    : porResolver === 0 ? 'Todas están resueltas' : `${plural(porResolver, 'espera tu decisión', 'esperan tu decisión')}${resueltas > 0 ? ` · ${plural(resueltas, 'ya resuelta', 'ya resueltas')}` : ''}`
  return (
    <Link to="/admin/anomalias?estado=todas&justificada=hoy" aria-label={`Justificadas hoy: ${total}. ${detalle}. Ver los casos`}
      className="flex items-center gap-4 rounded-[18px] border border-borde-suave bg-white px-5 py-4 shadow-[0_2px_8px_rgba(27,42,110,.04)] transition hover:border-celeste hover:shadow-[0_10px_24px_rgba(27,42,110,.12)]">
      <span className={`grid size-12 flex-none place-items-center rounded-full text-[20px] font-extrabold ${porResolver > 0 ? 'bg-ambar text-ambar-tinta' : 'bg-celeste text-marino'}`}>{total}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-marino">Justificadas hoy</span>
        <span className="block text-[13px] font-semibold text-texto-suave">{detalle}</span>
      </span>
      <span aria-hidden="true" className="text-[13px] font-extrabold text-marino">Ver ›</span>
    </Link>
  )
}
