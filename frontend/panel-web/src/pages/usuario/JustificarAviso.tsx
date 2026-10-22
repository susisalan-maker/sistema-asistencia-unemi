import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Chip } from '../../components/ui'
import { ApiError } from '../../lib/api'
import {
  type AnomaliaDetalle, TEXTO_MAX, cierreDeConversacion, ESTADOS, etiquetaDia, justificarAnomalia, mensajeInicial, nombreDeAnomalia,
  obtenerAnomalia, problemaDeTexto, textoCaso,
} from '../../lib/anomalias'
import { useAvisos } from './contexto'

/** Justificar una anomalía (M6 del mockup): chat con el asistente. Termina con «Enviado a revisión». */
export default function JustificarAviso() {
  const { id = '' } = useParams()
  const { recargar: recontar } = useAvisos()
  const [a, setA] = useState<AnomaliaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const fin = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    setA(null)
    setError(null)
    obtenerAnomalia(id)
      .then((d) => { if (vivo) setA(d) })
      .catch((e) => { if (vivo) setError(e instanceof ApiError ? e.message : 'No se pudo cargar la anomalía.') })
    return () => { vivo = false }
  }, [id])

  // Siempre se baja hasta el último mensaje.
  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'end' }) }, [a, enviando])

  async function enviar() {
    if (!a || enviando) return
    const problema = problemaDeTexto(texto, a.mensajes.length > 0)
    if (problema) { setErrorEnvio(problema); return }
    setEnviando(true)
    setErrorEnvio(null)
    try {
      setA(await justificarAnomalia(a.id, texto))
      setTexto('')
      void recontar()
    } catch (e) {
      setErrorEnvio(e instanceof ApiError ? e.message : 'No se pudo enviar tu justificación.')
      // Si el servidor dice que ya no se puede (plazo vencido o ya justificada), se muestra el estado real.
      if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
        try { setA(await obtenerAnomalia(a.id)); void recontar() } catch { /* se queda el aviso */ }
      }
    } finally {
      setEnviando(false)
    }
  }

  // Enter envía; Mayús + Enter baja de línea.
  const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void enviar() }
  }

  const estado = a ? ESTADOS[a.estado] : null
  return (
    <div className="mx-auto w-full max-w-[720px] p-4 sm:p-7">
      <div className="flex flex-col overflow-hidden rounded-[22px] border border-borde-suave bg-white">
        <header className="flex items-center gap-3.5 border-b border-borde-suave px-4 py-3.5 sm:px-5">
          <Link to="/usuario/avisos" aria-label="Volver"
            className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-xl font-extrabold text-marino hover:brightness-95">‹</Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-extrabold text-marino">Justificar anomalía</h1>
            {a && <p className="text-xs font-semibold text-etiqueta">{textoCaso(a.caso)} · {nombreDeAnomalia(a.tipo)}</p>}
          </div>
          {estado && <Chip tono={estado.tono}>{estado.texto}</Chip>}
        </header>

        <div className="flex min-h-[320px] flex-col gap-3.5 bg-lienzo p-4 sm:p-5 md:max-h-[58vh] md:overflow-y-auto" aria-live="polite">
          {error && <Aviso tipo="error">{error}</Aviso>}
          {!error && !a && <p role="progressbar" aria-label="Cargando la anomalía" className="text-sm font-semibold text-texto-suave">Cargando…</p>}
          {a && (
            <>
              <p className="self-center rounded-full bg-[#dfe5f0] px-3 py-1.5 text-xs font-bold text-texto-suave">{etiquetaDia(a.creada)}</p>
              <BurbujaAsistente texto={mensajeInicial(a)} />
              {a.mensajes.map((m, i) =>
                m.emisor === 'usuario' ? <BurbujaUsuario key={i} texto={m.contenido} /> : <BurbujaAsistente key={i} texto={m.contenido} />,
              )}
              {enviando && (
                <>
                  <BurbujaUsuario texto={texto.trim()} />
                  <BurbujaAsistente texto="Escribiendo…" />
                </>
              )}
              <Cierre a={a} />
            </>
          )}
          <div ref={fin} />
        </div>

        {a && (
          <footer className="space-y-2.5 border-t border-borde-suave bg-white px-4 py-3.5 sm:px-5">
            {a.puede_justificar ? (
              <>
                {errorEnvio && <Aviso tipo="error">{errorEnvio}</Aviso>}
                <div className="flex items-end gap-2.5">
                  <textarea aria-label="Tu respuesta" rows={2} value={texto} maxLength={TEXTO_MAX + 200}
                    placeholder={a.mensajes.length > 0 ? 'Escribe tu respuesta' : 'Cuéntanos qué ocurrió'}
                    onChange={(e) => { setTexto(e.target.value); setErrorEnvio(null) }} onKeyDown={alTeclear}
                    className="max-h-40 min-h-12 flex-1 resize-none rounded-[22px] border-[1.5px] border-marino bg-white px-4 py-3 text-[15px] font-semibold leading-snug text-marino outline-none placeholder:text-placeholder focus-visible:ring-2 focus-visible:ring-marino/25" />
                  <button type="button" onClick={() => void enviar()} disabled={enviando} aria-label="Enviar respuesta" aria-busy={enviando}
                    className="grid size-12 flex-none place-items-center rounded-full bg-ambar text-xl font-extrabold text-ambar-tinta shadow-[0_6px_10px_rgba(245,166,35,.32)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-marino disabled:opacity-60">
                    {enviando ? '…' : '↑'}
                  </button>
                </div>
                <p className="text-center text-[11px] font-semibold text-placeholder">Tu justificación será revisada por Talento Humano<span className="max-sm:hidden"> · Enter envía, Mayús + Enter baja de línea</span></p>
              </>
            ) : (
              <>
                <p className="text-center text-xs font-bold text-etiqueta">{cierreDeConversacion(a.estado)}</p>
                <Link to="/usuario/avisos"
                  className="grid h-12 w-full place-items-center rounded-[14px] bg-ambar text-[15px] font-extrabold text-ambar-tinta hover:brightness-95 sm:mx-auto sm:max-w-[240px]">
                  Volver a avisos
                </Link>
              </>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}

function BurbujaAsistente({ texto }: { texto: string }) {
  return (
    <div className="flex items-end gap-2.5">
      <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-full bg-celeste text-xs font-extrabold text-marino">SA</span>
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-bl-[6px] border border-borde-suave bg-white px-4 py-3.5 text-[15px] font-medium leading-snug text-texto sm:max-w-[78%]">{texto}</p>
    </div>
  )
}

function BurbujaUsuario({ texto }: { texto: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-[6px] bg-marino px-4 py-3.5 text-[15px] font-medium leading-snug text-white sm:max-w-[78%]">{texto}</p>
    </div>
  )
}

/** Cómo termina la conversación según el estado del caso. */
function Cierre({ a }: { a: AnomaliaDetalle }) {
  if (a.puede_justificar) return null
  if (a.decision) {
    const ok = a.decision === 'aprobada'
    return (
      <TarjetaCierre ok={ok} titulo={ok ? 'Justificación aceptada' : 'Justificación rechazada'}
        texto={a.comentario ?? (ok
          ? (a.automatica ? 'Revisamos tu explicación y la aceptamos automáticamente.' : 'Talento Humano aceptó tu explicación.')
          : 'Talento Humano no aceptó tu explicación.')} />
    )
  }
  if (a.estado === 'en_revision') {
    return <TarjetaCierre ok titulo="Enviado a revisión" texto={`Talento Humano responderá en un plazo de ${a.plazo_revision_h} h. Estado actual: En revisión.`} />
  }
  return <TarjetaCierre ok={false} titulo="El plazo terminó" texto="No se justificó a tiempo. El caso pasará a revisión de Talento Humano." />
}

function TarjetaCierre({ ok, titulo, texto }: { ok: boolean; titulo: string; texto: string }) {
  return (
    <div role="alert" className={`flex items-start gap-3 rounded-2xl border p-4 ${ok ? 'border-ok-borde bg-ok-fondo' : 'border-error-borde bg-error-fondo'}`}>
      <span aria-hidden="true" className={`mt-px grid size-[26px] flex-none place-items-center rounded-full text-sm font-extrabold text-white ${ok ? 'bg-ok' : 'bg-error'}`}>{ok ? '✓' : '!'}</span>
      <div className="min-w-0">
        <p className={`text-[15px] font-extrabold ${ok ? 'text-ok' : 'text-error'}`}>{titulo}</p>
        <p className={`mt-0.5 text-[13px] font-semibold leading-snug ${ok ? 'text-texto-suave' : 'text-error'}`}>{texto}</p>
      </div>
    </div>
  )
}
