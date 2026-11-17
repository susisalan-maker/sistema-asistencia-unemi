import type { BloqueOpcion } from './usuariosTipos'

/**
 * Bloque único donde la persona puede marcar (opcional). Sin elegir uno, vale cualquier bloque activo de su sede
 * o, si la sede no tiene bloques, el área de la sede.
 */
export function SelectorBloque({ sedeId, bloques, valor, onCambio, inactivo }: {
  sedeId: string; bloques: BloqueOpcion[]; valor: string; onCambio: (id: string) => void
  /** Nombre del bloque asignado cuando ya no está activo (no aparece en la lista). */
  inactivo?: string | null
}) {
  const delaSede = bloques.filter((b) => b.sede_id === sedeId)
  if (!sedeId) return null
  const hayInactivo = !!valor && !delaSede.some((b) => b.id === valor)
  if (delaSede.length === 0 && !hayInactivo) {
    return <p className="text-xs font-semibold text-texto-suave">Esta sede no tiene bloques: se valida contra el área de la sede.</p>
  }
  return (
    <div className="flex flex-col gap-[7px]">
      <label htmlFor="bloque-usuario" className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Bloque (opcional)</label>
      <select id="bloque-usuario" value={valor} onChange={(e) => onCambio(e.target.value)}
        className="h-[52px] rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino">
        <option value="">Cualquier bloque de la sede</option>
        {hayInactivo && <option value={valor}>{`${inactivo ?? 'Bloque asignado'} (inactivo)`}</option>}
        {delaSede.map((b) => <option key={b.id} value={b.id}>{b.nombre}</option>)}
      </select>
      <p className="text-xs font-semibold text-texto-suave">
        {hayInactivo
          ? 'El bloque asignado está inactivo: mientras tanto vale cualquier bloque de la sede.'
          : 'Si eliges uno, la persona solo podrá marcar dentro de ese bloque.'}
      </p>
    </div>
  )
}
