import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ESTADOS, nombreDeTipo, type EstadoAnomalia } from './anomaliasTipos'
import { BarraEstados, BarrasHorizontales, ColumnasTiempo, TituloGrafica } from './GraficasReporte'
import { franjaDe, resolucionDe, type AgregadoReporte, type FilaHistorico, type Indicadores } from './reportesDatos'
import { fechaHoraCompleta } from './reportesExportar'
import { columnasPorDia, columnasPorHora, filasPorSede, filasPorTipo, textoVariacion } from './reportesVista'

export interface DatosImpresion {
  periodo: string
  sede: string
  /** Filtros de la tabla que estaban puestos al exportar, en palabras («Estado: Rechazada · Tipo: …»); vacío si ninguno. */
  filtros: string
  resumen: string | null
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
  const celda = 'border border-borde px-1.5 py-1 align-top'
  return createPortal(
    <div id="reporte-impresion" className="font-sans text-[11px] leading-snug text-texto">
      <header className="mb-4 border-b-2 border-marino pb-3">
        <p className="text-[10px] font-extrabold text-etiqueta">Asistencia Universitaria</p>
        <h1 className="text-[22px] font-extrabold text-marino">Reporte de anomalías</h1>
        <p className="mt-1 text-[12px] font-bold text-texto">{datos.periodo} · {datos.sede}</p>
        <p className="text-[10px] font-semibold text-etiqueta">Generado el {fechaHoraCompleta(new Date().toISOString())} (hora de Ecuador)</p>
      </header>

      {datos.resumen && (
        <section className="mb-4 break-inside-avoid rounded-lg border border-borde bg-lienzo p-3">
          <h2 className="mb-1 text-[12px] font-extrabold text-marino">Resumen ejecutivo <span className="font-semibold text-etiqueta">· generado por IA</span></h2>
          <p className="whitespace-pre-line text-[11px] font-semibold">{datos.resumen}</p>
        </section>
      )}

      <section className="mb-4 grid grid-cols-4 gap-2">
        <Dato titulo="Anomalías del periodo" valor={String(ind.total)} detalle={textoVariacion(ind)} />
        <Dato titulo="Por cada 100 marcaciones" valor={ind.porCada100Marcaciones === null ? '—' : String(ind.porCada100Marcaciones).replace('.', ',')} detalle={`${ind.marcaciones} marcaciones`} />
        <Dato titulo="Justificadas a tiempo" valor={ind.aTiempoPct === null ? '—' : `${String(ind.aTiempoPct).replace('.', ',')} %`} detalle={`${ind.aTiempo} de ${ind.evaluadas} casos`} />
        <Dato titulo="Por resolver" valor={String(ind.porResolver)} detalle="En revisión o sin justificar" />
      </section>

      <section className="mb-4 break-inside-avoid">
        <TituloGrafica>Distribución por estado</TituloGrafica>
        <BarraEstados porEstado={a.por_estado} total={a.total} />
      </section>

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

      <section className="mb-4 grid grid-cols-2 gap-6">
        <div className="break-inside-avoid">
          <TituloGrafica detalle={ind.diaPico ? `Más casos: ${ind.diaPico.dia} (${ind.diaPico.total})` : undefined}>Casos por día</TituloGrafica>
          <ColumnasTiempo {...columnasPorDia(a, datos.dias)} />
        </div>
        <div className="break-inside-avoid">
          <TituloGrafica detalle={ind.horaPico ? `Más casos: ${franjaDe(ind.horaPico.hora)} (${ind.horaPico.total})` : undefined}>Casos por hora del día</TituloGrafica>
          <ColumnasTiempo {...columnasPorHora(a)} />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-[13px] font-extrabold text-marino">Histórico de anomalías del periodo</h2>
        <p className="mb-2 text-[10px] font-semibold text-etiqueta">
          {datos.filas.length === 0 ? 'Sin casos.' : `${datos.recortado ? `Primeros ${datos.filas.length} de ${datos.total} casos (para ver todos, exporta el CSV)` : `${datos.total} ${datos.total === 1 ? 'caso' : 'casos'}`}`}
          {datos.filtros && ` · ${datos.filtros}`}
        </p>
        {datos.filas.length > 0 && (
          <table className="w-full border-collapse text-[9.5px]">
            <thead className="bg-cabecera text-left text-[9px] font-extrabold text-etiqueta">
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
      </section>
    </div>,
    document.body,
  )
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle: string }) {
  return (
    <div className="break-inside-avoid rounded-lg border border-borde p-2.5">
      <p className="text-[9px] font-extrabold text-etiqueta">{titulo}</p>
      <p className="mt-0.5 text-[20px] font-extrabold text-marino">{valor}</p>
      <p className="text-[9.5px] font-semibold text-texto-suave">{detalle}</p>
    </div>
  )
}
