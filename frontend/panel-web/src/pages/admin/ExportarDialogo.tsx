import { useEffect, useRef, useState } from 'react'
import { PRESETS, SECCIONES_EXPORT, textoDescarga, type FormatoExportar, type SeccionExport } from './exportarSecciones'

const FORMATOS: { id: FormatoExportar; texto: string }[] = [
  { id: 'pdf', texto: 'PDF' },
  { id: 'xlsx', texto: 'Excel' },
  { id: 'csv', texto: 'CSV (solo la tabla)' },
]
const NOMBRE_BOTON: Record<FormatoExportar, string> = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV' }

interface Props {
  /** «octubre de 2026 · todas las sedes». */
  alcance: string
  /** Lo que viene marcado al abrir. */
  inicial: SeccionExport[]
  /** Las partes que no se pueden poner ahora, con el motivo (se lee en lugar del detalle). */
  noDisponibles: Partial<Record<SeccionExport, string>>
  /** El formato que se está preparando, si hay uno. */
  ocupado: FormatoExportar | null
  alCerrar: () => void
  alDescargar: (formato: FormatoExportar, secciones: SeccionExport[]) => void
}

/**
 * El cuadro para exportar: formato y, para PDF y Excel, qué partes del reporte van en el archivo. Cada exportación queda anotada en
 * Auditoría. Se monta al abrirlo, así que cada vez que se abre vuelve a empezar con lo que se está viendo.
 */
export function ExportarDialogo({ alcance, inicial, noDisponibles, ocupado, alCerrar, alDescargar }: Props) {
  const [formato, setFormato] = useState<FormatoExportar>('pdf')
  const [marcadas, setMarcadas] = useState<ReadonlySet<SeccionExport>>(() => new Set(inicial.filter((id) => !noDisponibles[id])))
  const cerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])

  const solaTabla = formato === 'csv'
  const lista = SECCIONES_EXPORT.map((s) => s.id).filter((id) => marcadas.has(id))
  const alternar = (id: SeccionExport) => setMarcadas((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const aplicar = (secciones: SeccionExport[] | 'todo' | 'nada') => {
    const ids = secciones === 'todo' ? SECCIONES_EXPORT.map((s) => s.id) : secciones === 'nada' ? [] : secciones
    setMarcadas(new Set(ids.filter((id) => !noDisponibles[id])))
  }
  const sinNada = !solaTabla && lista.length === 0
  const tablaNoDisponible = solaTabla && !!noDisponibles.tabla

  const chip = 'min-h-11 rounded-full border border-borde bg-white px-3.5 py-2 text-[13px] font-bold text-marino hover:bg-lienzo disabled:opacity-50'
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-marino/25 p-4 sm:pt-16" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar() }}>
      <section role="dialog" aria-modal="true" aria-label="Exportar reporte" className="w-full max-w-[640px] overflow-hidden rounded-[20px] border border-borde-suave bg-white shadow-[0_24px_60px_rgba(27,42,110,.22)]">
        <div className="flex items-center gap-3 border-b border-lienzo px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-extrabold text-marino">Exportar reporte</h2>
            <p className="text-xs font-semibold text-etiqueta">{alcance}</p>
          </div>
          <button ref={cerrar} type="button" onClick={alCerrar} aria-label="Cerrar" className="size-11 rounded-xl border border-borde bg-white text-sm font-extrabold text-marino hover:bg-lienzo">✕</button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <fieldset>
            <legend className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Formato</legend>
            <div className="flex flex-wrap gap-2">
              {FORMATOS.map((f) => (
                <label key={f.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 text-sm ${formato === f.id ? 'border-2 border-marino bg-lienzo font-extrabold' : 'border-borde font-bold'} text-marino`}>
                  <input type="radio" name="formato-exportar" checked={formato === f.id} onChange={() => setFormato(f.id)} className="accent-marino" />
                  {f.texto}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={solaTabla}>
            <legend className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Qué incluir</legend>
            {solaTabla ? (
              <p className="rounded-xl border border-borde-suave bg-lienzo px-4 py-3 text-[13px] font-semibold text-texto-suave">El CSV lleva solo la tabla de casos, con todos los casos del periodo.</p>
            ) : (
              <>
                <div className="mb-2.5 flex flex-wrap gap-2">
                  {PRESETS.map((p) => <button key={p.id} type="button" onClick={() => aplicar(p.secciones)} className={chip}>{p.texto}</button>)}
                </div>
                <ul className="overflow-hidden rounded-[14px] border border-borde-suave">
                  {SECCIONES_EXPORT.map((s, i) => {
                    const motivo = noDisponibles[s.id]
                    return (
                      <li key={s.id} className={i > 0 ? 'border-t border-lienzo' : ''}>
                        <label className={`flex min-h-11 items-center gap-3 px-4 py-2.5 ${motivo ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-lienzo'}`}>
                          <input type="checkbox" checked={marcadas.has(s.id)} disabled={!!motivo} onChange={() => alternar(s.id)} className="size-[18px] accent-marino" />
                          <span className="flex-1 text-sm font-bold text-marino">{s.texto}</span>
                          <span className="text-xs font-semibold text-etiqueta">{motivo ?? s.detalle}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </fieldset>

          <div className="rounded-xl border border-borde-suave bg-lienzo px-4 py-3">
            <p role="status" className="text-[13px] font-extrabold text-marino">{textoDescarga(formato, lista)}</p>
            <p className="mt-1 text-xs font-semibold text-etiqueta">Cada descarga queda anotada en Auditoría: quién, qué periodo y qué formato.</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-lienzo bg-cabecera px-6 py-4">
          <button type="button" onClick={alCerrar} className="min-h-11 rounded-[11px] border border-borde bg-white px-[18px] text-sm font-extrabold text-marino hover:bg-lienzo">Cancelar</button>
          <button type="button" disabled={sinNada || tablaNoDisponible || ocupado !== null} onClick={() => alDescargar(formato, solaTabla ? ['tabla'] : lista)}
            className="min-h-11 rounded-[11px] bg-ambar px-5 text-sm font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 disabled:opacity-50">
            {ocupado ? 'Preparando…' : `Descargar ${NOMBRE_BOTON[formato]}`}
          </button>
        </div>
      </section>
    </div>
  )
}
