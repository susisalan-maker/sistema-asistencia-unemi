import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Chip } from '../../components/ui'
import { ESTADOS, fechaHora, nombreDeTipo } from './anomaliasTipos'
import { DIAS_FICHA, buscarPersonas, casosDePersona, resumenDeFicha, type CasoFicha, type PersonaBuscada } from './fichaDatos'
import { tarjeta } from './PiezasReporte'
import type { Sede } from './useFiltrosPeriodo'

const PUNTO: Record<string, string> = { justificada: 'border-ok', rechazada: 'border-error', sin_justificar: 'border-ambar', en_revision: 'border-ambar', pendiente: 'border-marino-suave' }
const ESPERA_MS = 350
const VISIBLES = 8

/**
 * «Ficha por persona»: se busca a alguien por nombre y se ven, en orden, sus casos de los últimos 90 días. Sirve para preparar una
 * conversación; no califica a la persona ni decide nada. Cada caso lleva a su pantalla de revisión.
 */
export function FichaPersona({ sedes }: { sedes: Sede[] | null }) {
  const [texto, setTexto] = useState('')
  const [coincidencias, setCoincidencias] = useState<PersonaBuscada[] | null>(null)
  const [errorBusqueda, setErrorBusqueda] = useState(false)
  const [persona, setPersona] = useState<PersonaBuscada | null>(null)
  const [casos, setCasos] = useState<CasoFicha[] | null>(null)
  const [errorCasos, setErrorCasos] = useState(false)
  const [verTodos, setVerTodos] = useState(false)
  const pedido = useRef(0)

  // Busca cuando se deja de escribir.
  useEffect(() => {
    if (persona) return
    const q = texto.trim()
    if (q.length < 2) { setCoincidencias(null); setErrorBusqueda(false); return }
    const id = ++pedido.current
    const t = setTimeout(() => {
      buscarPersonas(q)
        .then((r) => { if (id === pedido.current) { setCoincidencias(r); setErrorBusqueda(false) } })
        .catch(() => { if (id === pedido.current) { setCoincidencias(null); setErrorBusqueda(true) } })
    }, ESPERA_MS)
    return () => clearTimeout(t)
  }, [texto, persona])

  // Trae los casos de la persona elegida.
  useEffect(() => {
    if (!persona) return
    let vigente = true
    setCasos(null)
    setErrorCasos(false)
    setVerTodos(false)
    casosDePersona(persona.id).then((r) => { if (vigente) setCasos(r) }).catch(() => { if (vigente) setErrorCasos(true) })
    return () => { vigente = false }
  }, [persona])

  const elegir = (p: PersonaBuscada) => { setPersona(p); setTexto(p.nombre); setCoincidencias(null) }
  const cambiar = (v: string) => { setPersona(null); setCasos(null); setTexto(v) }
  const resumen = casos ? resumenDeFicha(casos) : null
  const sede = persona?.sede_id ? sedes?.find((s) => s.id === persona.sede_id)?.nombre : null

  return (
    <section aria-label="Ficha por persona" className={tarjeta}>
      <h2 className="text-[17px] font-extrabold text-marino">Ficha por persona</h2>
      <p className="mb-3 mt-0.5 text-xs font-semibold text-texto-suave">Sus casos de los últimos {DIAS_FICHA} días</p>
      <input value={texto} onChange={(e) => cambiar(e.target.value)} aria-label="Buscar persona" placeholder="Nombre o apellido"
        className="w-full rounded-[11px] border border-borde bg-white px-3 py-2.5 text-[13px] font-semibold text-marino outline-none placeholder:text-placeholder focus:border-marino" />

      {errorBusqueda && <div className="mt-2"><Aviso tipo="error">No se pudo buscar. Intenta de nuevo.</Aviso></div>}
      {!persona && coincidencias && coincidencias.length === 0 && <p className="mt-2 text-xs font-semibold text-texto-suave">Nadie coincide con «{texto.trim()}».</p>}
      {!persona && coincidencias && coincidencias.length > 0 && (
        <ul aria-label="Coincidencias" className="mt-2 divide-y divide-lienzo rounded-[11px] border border-borde-suave">
          {coincidencias.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => elegir(p)} className="w-full px-3 py-2 text-left text-[13px] font-bold text-marino hover:bg-lienzo">{p.nombre}</button>
            </li>
          ))}
        </ul>
      )}

      {persona && (
        <div className="mt-3">
          {errorCasos && <Aviso tipo="error">No se pudieron cargar sus casos.</Aviso>}
          {!casos && !errorCasos && <p aria-busy="true" className="text-xs font-semibold text-texto-suave">Cargando…</p>}
          {resumen && casos && (
            <>
              <div className="mb-3.5 flex flex-wrap gap-1.5">
                {sede && <Chip tono="neutro">{sede}</Chip>}
                <Chip tono="neutro">{resumen.total} {resumen.total === 1 ? 'caso' : 'casos'}</Chip>
                {resumen.justificados > 0 && <Chip tono="ok">{resumen.justificados} {resumen.justificados === 1 ? 'justificado' : 'justificados'}</Chip>}
                {resumen.rechazados > 0 && <Chip tono="error">{resumen.rechazados} {resumen.rechazados === 1 ? 'rechazado' : 'rechazados'}</Chip>}
                {resumen.sinDecidir > 0 && <Chip tono="aviso">{resumen.sinDecidir} sin decidir</Chip>}
              </div>
              {casos.length === 0 ? (
                <p className="text-sm font-semibold text-texto-suave">No tiene casos en los últimos {DIAS_FICHA} días.</p>
              ) : (
                <ol aria-label={`Casos de ${persona.nombre}`} className="relative grid gap-3.5 pl-7 before:absolute before:bottom-1.5 before:left-[7px] before:top-1.5 before:w-0.5 before:bg-borde">
                  {(verTodos ? casos : casos.slice(0, VISIBLES)).map((c) => (
                    <li key={c.id} className="relative text-[13px] font-semibold">
                      <span aria-hidden="true" className={`absolute -left-7 top-0.5 size-4 rounded-full border-[3px] bg-white ${PUNTO[c.estado] ?? 'border-marino-suave'}`} />
                      <Link to={`/admin/anomalias/${c.id}`} className="font-extrabold text-marino underline-offset-2 hover:underline">{nombreDeTipo(c.tipo)}</Link>
                      <span className="block text-[11px] font-bold text-etiqueta">{c.caso} · {fechaHora(c.created_at)} · {ESTADOS[c.estado].texto.toLowerCase()}</span>
                    </li>
                  ))}
                </ol>
              )}
              {casos.length > VISIBLES && (
                <button type="button" onClick={() => setVerTodos((v) => !v)} className="mt-3 text-[13px] font-extrabold text-marino underline underline-offset-2">
                  {verTodos ? 'Ver menos' : `Ver los ${casos.length} casos`}
                </button>
              )}
              {casos.length >= 100 && <p className="mt-3 text-[11px] font-semibold text-etiqueta">Se muestran los 100 más recientes.</p>}
            </>
          )}
        </div>
      )}
    </section>
  )
}
