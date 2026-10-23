import { useMemo, useState } from 'react'
import { Aviso, Boton, Chip } from '../../components/ui'
import { horaLocal, nombreDeTipo, rotuloDeDia, simboloDeTipo } from '../../lib/marcacion'
import type { MarcaDeHistorial } from '../../lib/puntualidad'
import { useHistorial } from '../../lib/useJornada'
import { CargarMas } from './CargarMas'

const RANGOS = [7, 30] as const
/** Días que se ven al abrir y que se suman con «Cargar más». */
const DIAS_POR_TRAMO = 10
const ESTADO_ANOMALIA: Record<string, string> = {
  pendiente: 'abierta', en_revision: 'en revisión', justificada: 'justificada', rechazada: 'rechazada', sin_justificar: 'sin justificar',
}

/** Historial (M4 del mockup): solo consulta. En el computador cada día es una fila con sus marcaciones en línea. */
export default function Historial() {
  const [dias, setDias] = useState<(typeof RANGOS)[number]>(7)
  const [soloAnomalias, setSoloAnomalias] = useState(false)
  const [visibles, setVisibles] = useState(DIAS_POR_TRAMO)
  const { historial, error, recargar } = useHistorial(dias)

  const todas = useMemo(() => (historial?.dias ?? []).flatMap((d) => d.marcaciones), [historial])
  const conAnomalia = todas.filter((m) => m.anomalia).length
  const porWeb = todas.filter((m) => m.origen === 'web').length
  const lista = useMemo(
    () => (historial?.dias ?? []).filter((d) => !soloAnomalias || d.marcaciones.some((m) => m.anomalia)),
    [historial, soloAnomalias],
  )

  const cambiarRango = (r: (typeof RANGOS)[number]) => { setDias(r); setVisibles(DIAS_POR_TRAMO) }
  const cambiarSolo = () => { setSoloAnomalias((v) => !v); setVisibles(DIAS_POR_TRAMO) }

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-4 p-4 sm:p-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Historial</h1>
          <p className="text-[13px] font-semibold text-texto-suave">Últimos {dias} días</p>
        </div>
        <div role="group" aria-label="Periodo" className="flex rounded-full bg-white p-1 ring-1 ring-borde-suave">
          {RANGOS.map((r) => (
            <button key={r} type="button" aria-pressed={dias === r} onClick={() => cambiarRango(r)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${dias === r ? 'bg-marino font-extrabold text-white' : 'font-bold text-texto-suave hover:text-marino'}`}>
              {r} días
            </button>
          ))}
        </div>
      </header>

      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <div className="max-w-[200px]"><Boton variante="borde" onClick={() => void recargar()}>Reintentar</Boton></div>
        </>
      )}
      {!error && !historial && <p role="progressbar" aria-label="Cargando tu historial" className="text-sm font-semibold text-texto-suave">Cargando tu historial…</p>}
      {!error && historial?.total === 0 && (
        <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">Aún no tienes marcaciones en los últimos {dias} días.</div>
      )}

      {!error && historial && historial.total > 0 && (
        <>
          <dl className="grid grid-cols-3 gap-3">
            <Dato etiqueta="Marcaciones" valor={historial.total} />
            <Dato etiqueta="Con anomalía" valor={conAnomalia} resaltar={conAnomalia > 0} />
            <Dato etiqueta="Por la web" valor={porWeb} />
          </dl>

          <div className="flex w-fit items-center gap-2.5 text-sm font-bold text-texto-suave">
            <button type="button" role="switch" aria-checked={soloAnomalias} aria-label="Solo con anomalías" onClick={cambiarSolo}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-marino ${soloAnomalias ? 'bg-marino' : 'bg-borde'}`}>
              <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${soloAnomalias ? 'translate-x-5' : ''}`} />
            </button>
            <span aria-hidden="true" onClick={cambiarSolo} className="cursor-pointer select-none">Solo con anomalías</span>
          </div>

          {lista.length === 0 && (
            <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">No hay días con anomalías en este periodo.</div>
          )}
          <div className="space-y-3">
            {lista.slice(0, visibles).map((dia) => <FilaDia key={dia.fecha} fecha={dia.fecha} marcaciones={dia.marcaciones} />)}
          </div>
          <CargarMas mostrados={Math.min(visibles, lista.length)} total={lista.length} unidad="días" onMas={() => setVisibles((n) => n + DIAS_POR_TRAMO)} />
        </>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor, resaltar = false }: { etiqueta: string; valor: number; resaltar?: boolean }) {
  return (
    <div className="rounded-[16px] border border-borde-suave bg-white px-4 py-3">
      <dt className="text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta">{etiqueta}</dt>
      <dd className={`mt-0.5 text-[22px] font-extrabold ${resaltar ? 'text-aviso' : 'text-marino'}`}>{valor}</dd>
    </div>
  )
}

/** Un día: en el computador, la fecha a la izquierda y sus marcaciones en una sola fila de columnas; en el celular, apiladas. */
function FilaDia({ fecha, marcaciones }: { fecha: string; marcaciones: MarcaDeHistorial[] }) {
  const [diaSemana, diaMes] = rotuloDeDia(fecha).split(' · ')
  // Si todas se hicieron en el mismo lugar, se dice una vez junto a la fecha; si no, en cada marcación.
  const lugares = [...new Set(marcaciones.map((m) => m.lugar).filter(Boolean))]
  const lugarUnico = lugares.length === 1 ? lugares[0]! : null
  return (
    <section aria-label={rotuloDeDia(fecha)} className="rounded-[20px] border border-borde-suave bg-white px-4 py-3 sm:px-5 md:flex md:items-start md:gap-5 md:py-4">
      <h2 className="pb-1 md:w-[104px] md:flex-none md:pb-0">
        <span className="block text-[11px] font-extrabold uppercase tracking-[.1em] text-etiqueta">
          {diaSemana}{diaMes && <span className="md:hidden"> · {diaMes}</span>}
        </span>
        {diaMes && <span className="block text-[15px] font-extrabold text-marino max-md:hidden">{diaMes}</span>}
        {lugarUnico && <span className="block truncate text-xs font-semibold text-etiqueta md:mt-0.5" title={lugarUnico}>{lugarUnico}</span>}
      </h2>
      <ul className="divide-y divide-lienzo md:grid md:flex-1 md:grid-cols-4 md:gap-x-4 md:divide-y-0">
        {marcaciones.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3 md:items-start md:py-0">
            <span aria-hidden="true" className={`grid size-9 flex-none place-items-center rounded-full text-sm font-extrabold md:hidden ${m.anomalia ? 'bg-aviso-fondo text-aviso' : 'bg-celeste text-marino'}`}>
              {m.anomalia ? '!' : simboloDeTipo(m.tipo)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 md:flex-col md:items-start md:gap-0">
                <span className="text-[15px] font-extrabold text-marino md:order-2 md:text-[17px]">{horaLocal(m.fecha_hora)}</span>
                <span className="text-[15px] font-extrabold text-marino md:order-1 md:text-xs md:font-bold md:text-texto-suave">{nombreDeTipo(m.tipo)}</span>
                {m.origen === 'web' && <span className="self-center md:order-3 md:mt-1"><Chip tono="neutro">WEB</Chip></span>}
                {m.sin_conexion && <span className="self-center md:order-3 md:mt-1"><Chip tono="neutro">SIN CONEXIÓN</Chip></span>}
              </p>
              {m.lugar && !lugarUnico && <p className="truncate text-xs font-semibold text-etiqueta">{m.lugar}</p>}
              {m.anomalia && <p className="text-xs font-bold text-aviso">Anomalía {ESTADO_ANOMALIA[m.anomalia.estado] ?? m.anomalia.estado}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
