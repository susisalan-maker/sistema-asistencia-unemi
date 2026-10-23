import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Boton, Chip } from '../../components/ui'
import { ApiError } from '../../lib/api'
import {
  type Anomalia, type EstadoAnomalia, ESTADOS, etiquetaDia, fechaCorta, iconoDeAnomalia, listarAnomalias, nombreDeAnomalia, textoCaso, tiempoRestante,
} from '../../lib/anomalias'
import { CargarMas, TRAMO } from './CargarMas'
import { useAvisos } from './contexto'

type Pestana = 'por_explicar' | 'anteriores'
type Filtro = 'todas' | Exclude<EstadoAnomalia, 'pendiente'>

const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'todas', texto: 'Todas' },
  { valor: 'en_revision', texto: 'En revisión' },
  { valor: 'justificada', texto: 'Justificadas' },
  { valor: 'rechazada', texto: 'Rechazadas' },
  { valor: 'sin_justificar', texto: 'Sin justificar' },
]
const URGENTE_MS = 12 * 3_600_000

/** Avisos (M5 del mockup): en una pestaña lo que espera explicación y en otra las anteriores, con filtros y «Cargar más». */
export default function Avisos() {
  const { recargar: recontar } = useAvisos()
  const [lista, setLista] = useState<Anomalia[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState<Pestana | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [verPorExplicar, setVerPorExplicar] = useState(TRAMO)
  const [verAnteriores, setVerAnteriores] = useState(TRAMO)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      setLista(await listarAnomalias())
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus avisos.')
    }
  }, [])
  useEffect(() => { void cargar() }, [cargar])
  // El contador de la pestaña se actualiza también cuando se vuelve a esta pantalla.
  useEffect(() => { void recontar() }, [recontar])

  // La más urgente primero; las anteriores, de la más reciente a la más antigua.
  const porExplicar = useMemo(
    () => (lista ?? []).filter((a) => a.puede_justificar).sort((a, b) => new Date(a.vence).getTime() - new Date(b.vence).getTime()),
    [lista],
  )
  const anteriores = useMemo(
    () => (lista ?? []).filter((a) => !a.puede_justificar).sort((a, b) => new Date(b.creada).getTime() - new Date(a.creada).getTime()),
    [lista],
  )
  const filtradas = filtro === 'todas' ? anteriores : anteriores.filter((a) => a.estado === filtro)
  const cuantas = (f: Filtro) => (f === 'todas' ? anteriores.length : anteriores.filter((a) => a.estado === f).length)

  // Sin elección, se abre en «Por explicar» si hay algo pendiente y, si no, en «Anteriores».
  const pestana: Pestana = elegida ?? (porExplicar.length > 0 ? 'por_explicar' : 'anteriores')
  const subtitulo =
    lista === null ? ' '
    : porExplicar.length === 0 ? 'No tienes anomalías por explicar'
    : porExplicar.length === 1 ? '1 anomalía requiere tu explicación'
    : `${porExplicar.length} anomalías requieren tu explicación`

  return (
    <div className="mx-auto w-full max-w-[820px] space-y-4 p-4 sm:p-7">
      <header>
        <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Avisos</h1>
        <p className="text-[13px] font-semibold text-texto-suave">{subtitulo}</p>
      </header>

      {error && (
        <>
          <Aviso tipo="error">{error}</Aviso>
          <div className="max-w-[200px]"><Boton variante="borde" onClick={() => void cargar()}>Reintentar</Boton></div>
        </>
      )}
      {!error && lista === null && <p role="progressbar" aria-label="Cargando tus avisos" className="text-sm font-semibold text-texto-suave">Cargando tus avisos…</p>}
      {!error && lista?.length === 0 && (
        <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">No tienes avisos. ¡Todo en orden!</div>
      )}

      {!error && lista && lista.length > 0 && (
        <>
          <div role="tablist" aria-label="Tipo de aviso" className="flex w-fit max-w-full gap-1 rounded-full bg-white p-1 ring-1 ring-borde-suave">
            <PestanaBoton activa={pestana === 'por_explicar'} onClick={() => setElegida('por_explicar')} texto="Por explicar" cantidad={porExplicar.length} resaltar />
            <PestanaBoton activa={pestana === 'anteriores'} onClick={() => setElegida('anteriores')} texto="Anteriores" cantidad={anteriores.length} />
          </div>

          {pestana === 'por_explicar' && (
            <section role="tabpanel" aria-label="Por explicar" className="space-y-3">
              {porExplicar.length === 0 && (
                <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">No tienes anomalías por explicar. ¡Todo en orden!</div>
              )}
              {porExplicar.slice(0, verPorExplicar).map((a) => <FilaPorExplicar key={a.id} a={a} />)}
              <CargarMas mostrados={Math.min(verPorExplicar, porExplicar.length)} total={porExplicar.length} unidad="avisos" onMas={() => setVerPorExplicar((n) => n + TRAMO)} />
            </section>
          )}

          {pestana === 'anteriores' && (
            <section role="tabpanel" aria-label="Anteriores" className="space-y-3">
              <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
                {FILTROS.filter((f) => f.valor === 'todas' || cuantas(f.valor) > 0).map((f) => (
                  <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => { setFiltro(f.valor); setVerAnteriores(TRAMO) }}
                    className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${filtro === f.valor ? 'border-marino bg-marino font-extrabold text-white' : 'border-borde-suave bg-white font-bold text-texto-suave hover:text-marino'}`}>
                    {f.texto} <span className={filtro === f.valor ? 'text-white/80' : 'text-etiqueta'}>{cuantas(f.valor)}</span>
                  </button>
                ))}
              </div>
              {filtradas.length === 0 ? (
                <div className="rounded-[20px] border border-borde-suave bg-white p-6 text-center text-[15px] font-bold text-texto-suave">No hay avisos anteriores.</div>
              ) : (
                <ul className="divide-y divide-lienzo rounded-[20px] border border-borde-suave bg-white px-4">
                  {filtradas.slice(0, verAnteriores).map((a) => <FilaAnterior key={a.id} a={a} />)}
                </ul>
              )}
              <CargarMas mostrados={Math.min(verAnteriores, filtradas.length)} total={filtradas.length} unidad="avisos" onMas={() => setVerAnteriores((n) => n + TRAMO)} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PestanaBoton({ activa, onClick, texto, cantidad, resaltar = false }: { activa: boolean; onClick: () => void; texto: string; cantidad: number; resaltar?: boolean }) {
  return (
    <button type="button" role="tab" aria-selected={activa} onClick={onClick}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${activa ? 'bg-marino font-extrabold text-white' : 'font-bold text-texto-suave hover:text-marino'}`}>
      {texto}
      <span aria-hidden="true" className={`grid min-w-[20px] place-items-center rounded-full px-1.5 text-[11px] font-extrabold leading-5 ${resaltar && cantidad > 0 ? 'bg-ambar text-ambar-tinta' : activa ? 'bg-white/20 text-white' : 'bg-lienzo text-texto-suave'}`}>{cantidad}</span>
    </button>
  )
}

/** Una anomalía por explicar: en el computador cabe en una sola fila; en el celular, apilada. */
function FilaPorExplicar({ a }: { a: Anomalia }) {
  const resta = tiempoRestante(a.vence)
  const urgente = new Date(a.vence).getTime() - Date.now() < URGENTE_MS
  return (
    <article className={`flex flex-col gap-3 rounded-[20px] border bg-white p-4 sm:p-5 md:flex-row md:items-center md:gap-4 ${urgente ? 'border-[#f0ddb7] shadow-[0_6px_16px_rgba(245,166,35,.16)]' : 'border-borde-suave'}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-aviso-fondo text-lg font-extrabold text-aviso">!</span>
        <div className="min-w-0">
          <h2 className="break-words text-[16px] font-extrabold leading-snug text-marino">{nombreDeAnomalia(a.tipo)}</h2>
          {a.detalle && <p className="mt-0.5 break-words text-sm font-medium leading-snug text-texto">{a.detalle}</p>}
          <p className="mt-1 text-xs font-bold text-etiqueta">{etiquetaDia(a.creada)} h · {textoCaso(a.caso)}</p>
          {resta && <p className={`mt-1 text-[13px] font-bold ${urgente ? 'text-error' : 'text-aviso'}`}>Te quedan {resta} para explicarlo</p>}
        </div>
      </div>
      <Link to={`/usuario/avisos/${a.id}`}
        className="grid h-11 w-full flex-none place-items-center rounded-[14px] bg-ambar text-[15px] font-extrabold text-ambar-tinta hover:brightness-95 focus-visible:outline-2 focus-visible:outline-marino md:w-[150px]">
        Explicar
      </Link>
    </article>
  )
}

function FilaAnterior({ a }: { a: Anomalia }) {
  const estado = ESTADOS[a.estado]
  return (
    <li>
      <Link to={`/usuario/avisos/${a.id}`} aria-label={`${textoCaso(a.caso)}, ${nombreDeAnomalia(a.tipo)}`} className="flex items-center gap-3 py-3.5 hover:opacity-80">
        <span aria-hidden="true" className="grid size-10 flex-none place-items-center rounded-full bg-celeste text-base font-extrabold text-marino">{iconoDeAnomalia(a.tipo)}</span>
        <span className="min-w-0 flex-1">
          <span className="block break-words text-[15px] font-extrabold leading-snug text-marino">{nombreDeAnomalia(a.tipo)}</span>
          <span className="block text-xs font-semibold text-etiqueta">{fechaCorta(a.creada)} · {textoCaso(a.caso)}</span>
        </span>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </Link>
    </li>
  )
}
