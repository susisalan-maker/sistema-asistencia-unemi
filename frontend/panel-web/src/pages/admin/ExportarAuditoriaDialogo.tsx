import { useEffect, useRef, useState } from 'react'
import { MAXIMO_EXPORTAR } from './auditoriaDatos'
import { TEXTO_MODO, type ModoFilas } from './auditoriaExcel'

/** 5000 → «5 000». */
export const conMiles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

interface Props {
  /** «noviembre de 2026». */
  periodo: string
  /** Los filtros puestos, en palabras (el cuadro los muestra para que se sepa qué se descarga). */
  filtros: string[]
  acciones: number
  datos: number
  /** Las filas que saldrían con una fila por dato. */
  filas: number
  ocupado: boolean
  alCerrar: () => void
  alDescargar: (modo: ModoFilas) => void
}

const DESCRIPCION: Record<ModoFilas, string> = {
  datos: 'Para revisar o filtrar en Excel: fecha, quién, qué registro, dato, valor anterior, valor nuevo y motivo.',
  acciones: 'Como se ve en pantalla: una frase por acción, con sus cambios juntos en una celda.',
}

/** El cuadro para exportar la bitácora a Excel. Cada descarga queda anotada en la misma Auditoría. */
export function ExportarAuditoriaDialogo({ periodo, filtros, acciones, datos, filas, ocupado, alCerrar, alDescargar }: Props) {
  const [modo, setModo] = useState<ModoFilas>('datos')
  const cerrar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cerrar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCerrar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [alCerrar])

  const n = modo === 'datos' ? filas : acciones
  const recorte = n > MAXIMO_EXPORTAR
  const estado = recorte
    ? `Se descargará: Excel · las primeras ${conMiles(MAXIMO_EXPORTAR)} de ${conMiles(n)} filas`
    : `Se descargará: Excel · ${conMiles(n)} ${n === 1 ? 'fila' : 'filas'}`

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-marino/25 p-4 sm:pt-16" onMouseDown={(e) => { if (e.target === e.currentTarget) alCerrar() }}>
      <section role="dialog" aria-modal="true" aria-label="Exportar bitácora a Excel" className="w-full max-w-[600px] overflow-hidden rounded-[20px] border border-borde-suave bg-white shadow-[0_24px_60px_rgba(27,42,110,.22)]">
        <div className="flex items-center gap-3 border-b border-lienzo px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-extrabold text-marino">Exportar a Excel</h2>
            <p className="text-xs font-semibold text-etiqueta">Auditoría · {periodo}</p>
          </div>
          <button ref={cerrar} type="button" onClick={alCerrar} aria-label="Cerrar" className="size-11 rounded-xl border border-borde bg-white text-sm font-extrabold text-marino hover:bg-lienzo">✕</button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <h3 className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Lo que se exporta</h3>
            <div className="rounded-xl border border-borde-suave bg-lienzo px-4 py-3 text-sm font-semibold leading-relaxed text-marino">
              <strong className="font-extrabold">{conMiles(datos)} {datos === 1 ? 'dato cambiado' : 'datos cambiados'}</strong> en <strong className="font-extrabold">{conMiles(acciones)} {acciones === 1 ? 'acción' : 'acciones'}</strong>, con los filtros que tienes puestos:
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {[periodo, ...filtros].map((t) => <li key={t} className="rounded-lg border border-borde-suave bg-white px-2.5 py-0.5 text-xs font-bold">{t}</li>)}
              </ul>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Cómo van las filas</legend>
            <div className="overflow-hidden rounded-[14px] border border-borde-suave">
              {(['datos', 'acciones'] as const).map((m, i) => (
                <label key={m} className={`flex min-h-11 cursor-pointer items-start gap-3 px-4 py-3 hover:bg-lienzo ${i > 0 ? 'border-t border-lienzo' : ''}`}>
                  <input type="radio" name="filas-auditoria" checked={modo === m} onChange={() => setModo(m)} className="mt-0.5 size-[18px] accent-marino" />
                  <span className="flex-1">
                    <span className="block text-sm font-extrabold text-marino">{TEXTO_MODO[m]}</span>
                    <span className="mt-0.5 block text-xs font-semibold text-etiqueta">{DESCRIPCION[m]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-borde-suave bg-lienzo px-4 py-3">
            <p role="status" className="text-[13px] font-extrabold text-marino">{estado}</p>
            <p className="mt-1 text-xs font-semibold text-etiqueta">
              Esta descarga también queda anotada en Auditoría: quién, qué periodo y cuántas filas. Hasta {conMiles(MAXIMO_EXPORTAR)} filas por archivo.
              {recorte && ' Para descargar el resto, acota el periodo o usa un atajo.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2.5 border-t border-lienzo bg-cabecera px-6 py-4">
          <button type="button" onClick={alCerrar} className="min-h-11 rounded-[11px] border border-borde bg-white px-[18px] text-sm font-extrabold text-marino hover:bg-lienzo">Cancelar</button>
          <button type="button" disabled={ocupado || n === 0} onClick={() => alDescargar(modo)}
            className="min-h-11 rounded-[11px] bg-ambar px-5 text-sm font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 disabled:opacity-50">
            {ocupado ? 'Preparando…' : 'Descargar Excel'}
          </button>
        </div>
      </section>
    </div>
  )
}
