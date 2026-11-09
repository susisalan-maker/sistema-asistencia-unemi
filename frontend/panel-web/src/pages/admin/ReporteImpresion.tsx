import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ESTADOS, nombreDeTipo, type EstadoAnomalia } from './anomaliasTipos'
import { BarraEstados, BarrasHorizontales, ColumnasTiempo, TituloGrafica } from './GraficasReporte'
import { franjaDe, resolucionDe, type AgregadoReporte, type FilaHistorico, type Indicadores } from './reportesDatos'
import type { SeccionExport } from './exportarSecciones'
import type { PatronPersona } from './patrones'
import { fechaHoraCompleta } from './reportesExportar'
import { coma, columnasPorDia, columnasPorHora, filasPorSede, filasPorTipo, textoHoras, textoVariacion } from './reportesVista'
import type { FilaSede } from './sedesComparar'

export interface DatosImpresion {
  periodo: string
  sede: string
  /** Filtros de la tabla que estaban puestos al exportar, en palabras («Estado: Rechazada · Tipo: …»); vacío si ninguno. */
  filtros: string
  /** Qué partes lleva el archivo (las que se marcaron en el cuadro de exportar). */
  secciones: ReadonlySet<SeccionExport>
  resumen: string | null
  /** Sede contra sede, si se pidió y se pudo calcular. */
  comparativo: FilaSede[] | null
  /** Patrones a revisar, si se pidieron. */
  patrones: PatronPersona[] | null
  agregado: AgregadoReporte
  indicadores: Indicadores
  filas: FilaHistorico[]
  total: number
  recortado: boolean
  dias: string[]
}

/**
 * La versión del reporte para imprimir o guardar como PDF. Vive fuera de la aplicación (colgada de `body`) y solo se ve al
 * imprimir (ver `index.css`): se arma una vez con los datos ya cargados y se abre el diálogo de impresión del navegador,
 * donde se elige «Guardar como PDF». Al cerrar el diálogo se retira.
 */
export function ReporteImpresion({ datos, alTerminar }: { datos: DatosImpresion; alTerminar: () => void }) {
  useEffect(() => {
    const tituloAnterior = document.title
    document.title = `Reporte de anomalías · ${datos.periodo}`   // el navegador lo propone como nombre del archivo
    const terminar = () => { document.title = tituloAnterior; alTerminar() }
    window.addEventListener('afterprint', terminar, { once: true })
    // Un instante para que el navegador termine de pintar el contenido antes de abrir el diálogo.
    const espera = setTimeout(() => window.print(), 80)
    return () => {
      clearTimeout(espera)
      window.removeEventListener('afterprint', terminar)
      document.title = tituloAnterior
    }
  // Se imprime una vez por cada exportación: `datos` es nuevo cada vez.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos])

  const { agregado: a, indicadores: ind } = datos
  const lleva = (id: SeccionExport) => datos.secciones.has(id)
  const celda = 'border border-borde px-1.5 py-1 align-top'
  return createPortal(
    <div id="reporte-impresion" className="font-sans text-[11px] leading-snug text-texto">
      <header className="mb-4 border-b-2 border-marino pb-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-etiqueta">Asistencia Universitaria</p>
        <h1 className="text-[22px] font-extrabold text-marino">Reporte de anomalías</h1>
        <p className="mt-1 text-[12px] font-bold text-texto">{datos.periodo} · {datos.sede}</p>
        <p className="text-[10px] font-semibold text-etiqueta">Generado el {fechaHoraCompleta(new Date().toISOString())} (hora de Ecuador)</p>
      </header>

      {lleva('resumen') && datos.resumen && (
        <section className="mb-4 break-inside-avoid rounded-lg border border-borde bg-lienzo p-3">
          <h2 className="mb-1 text-[12px] font-extrabold text-marino">Resumen ejecutivo <span className="font-semibold text-etiqueta">· redactado por IA a partir de las cifras</span></h2>
          <p className="whitespace-pre-line text-[11px] font-semibold">{datos.resumen}</p>
        </section>
      )}

      {lleva('indicadores') && <section className="mb-4 grid grid-cols-4 gap-2">
        <Dato titulo="Anomalías del periodo" valor={String(ind.total)} detalle={textoVariacion(ind)} />
        <Dato titulo="Por cada 100 marcaciones" valor={ind.porCada100Marcaciones === null ? '—' : String(ind.porCada100Marcaciones).replace('.', ',')} detalle={`${ind.marcaciones} marcaciones`} />
        <Dato titulo="Justificadas a tiempo" valor={ind.aTiempoPct === null ? '—' : `${String(ind.aTiempoPct).replace('.', ',')} %`} detalle={`${ind.aTiempo} de ${ind.evaluadas} casos`} />
        <Dato titulo="Por resolver" valor={String(ind.porResolver)} detalle="En revisión o sin justificar" />
      </section>}

      {lleva('estado') && <section className="mb-4 break-inside-avoid">
        <TituloGrafica>Distribución por estado</TituloGrafica>
        <BarraEstados porEstado={a.por_estado} total={a.total} />
      </section>}

      {lleva('graficas') && <>
        <section className="mb-4 grid grid-cols-2 gap-6">
          <div className="break-inside-avoid">
            <TituloGrafica>Por tipo de anomalía</TituloGrafica>
            <BarrasHorizontales filas={filasPorTipo(a)} total={a.total} />
          </div>
          <div className="break-inside-avoid">
            <TituloGrafica>Por sede</TituloGrafica>
            <BarrasHorizontales filas={filasPorSede(a)} total={a.total} />
          </div>
        </section>
        <section className="mb-4 break-inside-avoid">
          <TituloGrafica detalle={ind.diaPico ? `Más casos: ${ind.diaPico.dia} (${ind.diaPico.total})` : undefined}>Casos por día</TituloGrafica>
          <ColumnasTiempo {...columnasPorDia(a, datos.dias)} />
        </section>
      </>}

      {lleva('hora') && <section className="mb-4 break-inside-avoid">
        <TituloGrafica detalle={ind.horaPico ? `Más casos: ${franjaDe(ind.horaPico.hora)} (${ind.horaPico.total})` : undefined}>Casos por hora del día</TituloGrafica>
        <ColumnasTiempo {...columnasPorHora(a)} />
      </section>}

      {lleva('comparativo') && datos.comparativo && datos.comparativo.length > 0 && (
        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[13px] font-extrabold text-marino">Sede contra sede</h2>
          <p className="mb-2 text-[10px] font-semibold text-etiqueta">Las mismas cifras de cada sede, frente al periodo anterior. No ordena ni califica a ninguna sede.</p>
          <table className="w-full border-collapse text-[9.5px]">
            <thead className="bg-cabecera text-left text-[9px] font-extrabold uppercase tracking-[.05em] text-etiqueta">
              <tr>{['Sede', 'Anomalías', 'Antes', 'Puntualidad', 'Tiempo medio', 'Rechazo facial'].map((t) => <th key={t} className={celda}>{t}</th>)}</tr>
            </thead>
            <tbody>
              {datos.comparativo.map((f) => (
                <tr key={f.sede_id} className="break-inside-avoid">
                  <td className={`${celda} font-extrabold text-marino`}>{f.sede}</td>
                  <td className={celda}>{f.ind.total}</td>
                  <td className={celda}>{f.ind.anterior ?? '—'}</td>
                  <td className={celda}>{f.ind.puntualidadPct === null ? '—' : `${coma(f.ind.puntualidadPct)} %`}</td>
                  <td className={celda}>{f.ind.resolucionHoras === null ? '—' : textoHoras(f.ind.resolucionHoras)}</td>
                  <td className={celda}>{f.ind.rechazoPct === null ? '—' : `${coma(f.ind.rechazoPct)} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {lleva('patrones') && datos.patrones && (
        <section className="mb-4 break-inside-avoid">
          <h2 className="mb-1 text-[13px] font-extrabold text-marino">Patrones a revisar</h2>
          <p className="mb-2 text-[10px] font-semibold text-etiqueta">Personas con 3 o más casos en los últimos 30 días. Es para conversar o revisar, no para sancionar.</p>
          {datos.patrones.length === 0 ? <p className="text-[10px] font-semibold">Ninguna persona con 3 o más casos.</p> : (
            <table className="w-full border-collapse text-[9.5px]">
              <thead className="bg-cabecera text-left text-[9px] font-extrabold uppercase tracking-[.05em] text-etiqueta">
                <tr>{['Persona', 'Sede', 'Casos', 'Justificados', 'Más frecuente'].map((t) => <th key={t} className={celda}>{t}</th>)}</tr>
              </thead>
              <tbody>
                {datos.patrones.map((p) => (
                  <tr key={p.usuario_id} className="break-inside-avoid">
                    <td className={`${celda} font-extrabold text-marino`}>{p.nombre}</td>
                    <td className={celda}>{p.sede ?? '—'}</td>
                    <td className={celda}>{p.total}</td>
                    <td className={celda}>{p.justificadas}</td>
                    <td className={celda}>{nombreDeTipo(p.tipo)} ({p.tipo_total})</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {lleva('tabla') && <section>
        <h2 className="mb-1 text-[13px] font-extrabold text-marino">Histórico de anomalías del periodo</h2>
        <p className="mb-2 text-[10px] font-semibold text-etiqueta">
          {datos.filas.length === 0 ? 'Sin casos.' : `${datos.recortado ? `Primeros ${datos.filas.length} de ${datos.total} casos (acota el periodo para ver el resto)` : `${datos.total} ${datos.total === 1 ? 'caso' : 'casos'}`}`}
          {datos.filtros && ` · ${datos.filtros}`}
        </p>
        {datos.filas.length > 0 && (
          <table className="w-full border-collapse text-[9.5px]">
            <thead className="bg-cabecera text-left text-[9px] font-extrabold uppercase tracking-[.05em] text-etiqueta">
              <tr>{['Caso', 'Fecha', 'Colaborador', 'Tipo', 'Sede', 'Estado', 'Resolución'].map((t) => <th key={t} className={celda}>{t}</th>)}</tr>
            </thead>
            <tbody>
              {datos.filas.map((f) => (
                <tr key={f.id} className="break-inside-avoid">
                  <td className={`${celda} font-extrabold text-marino`}>{f.caso}</td>
                  <td className={`${celda} whitespace-nowrap`}>{fechaHoraCompleta(f.created_at)}</td>
                  <td className={celda}>{f.colaborador ?? '—'}</td>
                  <td className={celda}>{nombreDeTipo(f.tipo)}</td>
                  <td className={celda}>{f.sede ?? '—'}</td>
                  <td className={celda}>{ESTADOS[f.estado as EstadoAnomalia]?.texto ?? f.estado}</td>
                  <td className={celda}>{resolucionDe(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>}
    </div>,
    document.body,
  )
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="break-inside-avoid rounded-lg border border-borde p-2.5">
      <p className="text-[9px] font-extrabold uppercase tracking-[.06em] text-etiqueta">{titulo}</p>
      <p className="mt-0.5 text-[20px] font-extrabold text-marino">{valor}</p>
      <p className="text-[9.5px] font-semibold text-texto-suave">{detalle}</p>
    </div>
  )
}
