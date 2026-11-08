import { Link } from 'react-router-dom'
import type { EstadoAnomalia } from './anomaliasTipos'
import { ESTADOS } from './anomaliasTipos'

/** Un solo tono (el marino del panel) para cantidades; el color de estado solo se usa donde hay un estado. */
const COLOR_ESTADO: Record<EstadoAnomalia, string> = {
  justificada: 'bg-ok',
  rechazada: 'bg-error',
  en_revision: 'bg-aviso',
  sin_justificar: 'bg-texto-suave',
  pendiente: 'bg-marino-suave',
}
const ORDEN_ESTADOS: EstadoAnomalia[] = ['justificada', 'rechazada', 'en_revision', 'sin_justificar', 'pendiente']

const porcentaje = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

export function TituloGrafica({ children, detalle }: { children: string; detalle?: string }) {
  return (
    <div className="mb-3.5">
      <h3 className="text-sm font-extrabold text-marino">{children}</h3>
      {detalle && <p className="mt-0.5 text-xs font-semibold text-etiqueta">{detalle}</p>}
    </div>
  )
}

export interface FilaBarra { clave: string; texto: string; total: number }

/** Barras horizontales, una por fila: el nombre y la cantidad (con su %) arriba y la barra debajo. El número siempre está escrito. */
export function BarrasHorizontales({ filas, total, vacio = 'Sin casos en el periodo.', enlace }: { filas: FilaBarra[]; total: number; vacio?: string; enlace?: (clave: string) => string }) {
  if (filas.length === 0) return <p className="text-sm font-semibold text-texto-suave">{vacio}</p>
  const mayor = Math.max(...filas.map((f) => f.total), 1)
  return (
    <ul className="space-y-3">
      {filas.map((f) => {
        const contenido = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 break-words font-bold text-texto">{f.texto}</span>
              <span className="flex-none font-extrabold text-marino">
                {f.total}
                <span className="ml-1.5 font-semibold text-etiqueta">{porcentaje(f.total, total)} %</span>
              </span>
            </div>
            <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-lienzo">
              <div className="h-full rounded-full bg-marino" style={{ width: `${Math.max(2, (f.total / mayor) * 100)}%` }} />
            </div>
          </>
        )
        return (
          <li key={f.clave}>
            {enlace
              ? <Link to={enlace(f.clave)} aria-label={`${f.texto}: ${f.total} casos. Ver sus casos`} className="-mx-2 block rounded-[10px] px-2 py-1 hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-marino">{contenido}</Link>
              : contenido}
          </li>
        )
      })}
    </ul>
  )
}

export interface Columna { clave: string; etiqueta: string; total: number; titulo: string }

/**
 * Columnas verticales (casos por día, por hora). Cada columna tiene su detalle al pasar el cursor, y debajo van solo
 * unas pocas etiquetas para que no se amontonen. Para quien lee con lector de pantalla, el mismo dato va en una tabla.
 */
export function ColumnasTiempo({ columnas, resumen, cadaEtiqueta }: { columnas: Columna[]; resumen: string; cadaEtiqueta: number }) {
  const mayor = Math.max(...columnas.map((c) => c.total), 1)
  return (
    <figure className="flex flex-1 flex-col">
      {/* Altura mínima de 7 rem; si la tarjeta de al lado es más alta, las columnas crecen para llenarla. */}
      <div role="img" aria-label={resumen} className="flex min-h-28 flex-1 items-end gap-[2px]">
        {columnas.map((c) => (
          <div key={c.clave} title={c.titulo} className="flex min-w-0 flex-1 items-end self-stretch rounded-t-[3px] hover:bg-celeste">
            <div className={`w-full rounded-t-[3px] ${c.total > 0 ? 'bg-marino' : 'bg-borde-suave'}`}
              style={{ height: c.total > 0 ? `${Math.max(4, (c.total / mayor) * 100)}%` : '2px' }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[2px] text-[10px] font-bold text-etiqueta">
        {columnas.map((c, i) => (
          <span key={c.clave} className="relative min-w-0 flex-1">
            {i % cadaEtiqueta === 0 && <span className="absolute left-0 whitespace-nowrap">{c.etiqueta}</span>}
          </span>
        ))}
      </div>
      <div className="h-3.5" />
      {/* Dentro de un contenedor `sr-only`: puesta directamente en la tabla, sus celdas se salen y agrandan la página. */}
      <div className="sr-only">
        <table>
          <caption>{resumen}</caption>
          <tbody>{columnas.filter((c) => c.total > 0).map((c) => <tr key={c.clave}><td>{c.titulo}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  )
}

export interface ColumnaDoble { clave: string; etiqueta: string; detectadas: number; justificadas: number; titulo: string }

/**
 * Pareja de columnas por periodo: detectadas (marino) y, de ellas, justificadas (verde). La leyenda lleva el nombre escrito y los
 * detalles van en el título de cada pareja y en una tabla para lectores de pantalla.
 */
export function ColumnasDobles({ columnas, resumen, cadaEtiqueta }: { columnas: ColumnaDoble[]; resumen: string; cadaEtiqueta: number }) {
  const mayor = Math.max(...columnas.map((c) => c.detectadas), 1)
  const alto = (n: number) => (n > 0 ? `${Math.max(4, (n / mayor) * 100)}%` : '2px')
  return (
    <figure className="flex flex-1 flex-col">
      <figcaption className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] font-bold text-texto">
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-marino" />Detectadas</span>
        <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full bg-ok" />Justificadas</span>
        <span className="ml-auto font-semibold text-etiqueta">Máximo: {mayor}</span>
      </figcaption>
      <div role="img" aria-label={resumen} className="flex min-h-28 flex-1 items-end gap-[3px]">
        {columnas.map((c) => (
          <div key={c.clave} title={c.titulo} className="flex min-w-0 flex-1 items-end gap-[2px] self-stretch rounded-t-[3px] hover:bg-celeste">
            <div className={`w-1/2 rounded-t-[3px] ${c.detectadas > 0 ? 'bg-marino' : 'bg-borde-suave'}`} style={{ height: alto(c.detectadas) }} />
            <div className={`w-1/2 rounded-t-[3px] ${c.justificadas > 0 ? 'bg-ok' : 'bg-borde-suave'}`} style={{ height: alto(c.justificadas) }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1.5 flex gap-[3px] text-[10px] font-bold text-etiqueta">
        {columnas.map((c, i) => (
          <span key={c.clave} className="relative min-w-0 flex-1">
            {i % cadaEtiqueta === 0 && <span className="absolute left-0 whitespace-nowrap">{c.etiqueta}</span>}
          </span>
        ))}
      </div>
      <div className="h-3.5" />
      <div className="sr-only">
        <table>
          <caption>{resumen}</caption>
          <tbody>{columnas.filter((c) => c.detectadas > 0).map((c) => <tr key={c.clave}><td>{c.titulo}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  )
}

/** Una barra dividida por estado (con una separación de 2 px entre tramos) y debajo la leyenda con cantidades: el color nunca va solo. */
export function BarraEstados({ porEstado, total, enlace }: { porEstado: Partial<Record<EstadoAnomalia, number>>; total: number; enlace?: (estado: EstadoAnomalia) => string }) {
  const presentes = ORDEN_ESTADOS.filter((e) => (porEstado[e] ?? 0) > 0)
  if (total === 0 || presentes.length === 0) return <p className="text-sm font-semibold text-texto-suave">Sin casos en el periodo.</p>
  return (
    <div>
      <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {presentes.map((e) => <div key={e} className={`${COLOR_ESTADO[e]} first:rounded-l-full last:rounded-r-full`} style={{ flexGrow: porEstado[e] as number, flexBasis: 0 }} />)}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {presentes.map((e) => {
          const contenido = (
            <>
              <span aria-hidden="true" className={`size-2.5 flex-none rounded-full ${COLOR_ESTADO[e]}`} />
              {ESTADOS[e].texto}
              <span className="font-extrabold text-marino">{porEstado[e]}</span>
              <span className="font-semibold text-etiqueta">{porcentaje(porEstado[e] as number, total)} %</span>
            </>
          )
          return (
            <li key={e} className="text-[13px] font-bold text-texto">
              {enlace
                ? <Link to={enlace(e)} aria-label={`${ESTADOS[e].texto}: ${porEstado[e]} casos. Ver sus casos`} className="-mx-2 flex items-center gap-2 rounded-[10px] px-2 py-1 hover:bg-lienzo focus-visible:outline-2 focus-visible:outline-marino">{contenido}</Link>
                : <span className="flex items-center gap-2">{contenido}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
