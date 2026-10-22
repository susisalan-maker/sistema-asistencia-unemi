import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Confirmar } from '../../components/Confirmar'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Mapa } from '../../components/Mapa'
import { Aviso, Chip } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import {
  CLASIFICACIONES_IA, ESTADOS, ESTADOS_POR_RESOLVER, MOTIVOS_CONTINGENCIA, TIPOS_MARCACION, caso, errorDeDecision, fechaHora, justificacionDe,
  nombreDe, nombreDeTipo, puedeDecidir, type Decision, type DetalleAnomalia,
} from './anomaliasTipos'

const COLUMNAS_DETALLE = `
  id, numero, tipo, estado, detalle, created_at, intentos_fallidos, fecha_vencimiento, descripcion_ia,
  usuarios(nombres, apellidos, email),
  marcaciones(tipo, fecha_hora, latitud, longitud, precision_m, origen, motivo_contingencia, verificacion, similitud_score, sedes(nombre)),
  justificaciones(resumen_ia, clasificacion_ia, confianza_ia, decision_final, comentario_admin, fecha_decision, revisado_por,
                  mensajes_chat(emisor, contenido, created_at))`

const tarjeta = 'rounded-[18px] border border-borde-suave bg-white p-6'
const dato = 'rounded-xl bg-lienzo px-4 py-3'
const etiqueta = 'text-[10px] font-extrabold uppercase tracking-[.08em] text-etiqueta'

const TEXTOS_DECISION: Record<Decision, { titulo: (c: string) => string; texto: (p: string) => string; confirmar: string; hecho: string }> = {
  aprobada: {
    titulo: (c) => `¿Aprobar la justificación del caso #${c}?`,
    texto: (p) => `${p} verá la decisión en la app y el caso pasará a estado «Justificada». El comentario escrito se guardará en el expediente.`,
    confirmar: 'Confirmar aprobación',
    hecho: 'La justificación fue aprobada y el caso quedó como «Justificada».',
  },
  rechazada: {
    titulo: (c) => `¿Rechazar el caso #${c}?`,
    texto: (p) => `${p} verá la decisión y tu comentario en la app, y el caso pasará a estado «Rechazada».`,
    confirmar: 'Confirmar rechazo',
    hecho: 'El caso fue rechazado y quedó registrado en el expediente.',
  },
  escalada: {
    titulo: (c) => `¿Escalar el caso #${c} a jefatura?`,
    texto: () => 'El caso permanecerá «En revisión» hasta que jefatura decida. Queda registrado en el expediente.',
    confirmar: 'Confirmar escalamiento',
    hecho: 'El caso se escaló a jefatura y sigue «En revisión».',
  },
}

export default function AnomaliaDetalle() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const [datos, setDatos] = useState<DetalleAnomalia | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState<string[]>([])
  const [comentario, setComentario] = useState('')
  const [confirmando, setConfirmando] = useState<Decision | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [errorDecision, setErrorDecision] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const r = await supabase.from('anomalias').select(COLUMNAS_DETALLE).eq('id', id).maybeSingle()
    if (r.error) setError('No se pudo cargar el caso')
    else if (!r.data) setError('No se encontró el caso')
    else { setError(null); setDatos(r.data as unknown as DetalleAnomalia) }
    setCargando(false)
  }, [id])

  const cargarPendientes = useCallback(async () => {
    const r = await supabase.from('anomalias').select('id').in('estado', ESTADOS_POR_RESOLVER).order('created_at', { ascending: true }).limit(500)
    if (!r.error) setPendientes(((r.data ?? []) as { id: string }[]).map((f) => f.id))
  }, [])

  useEffect(() => {
    setCargando(true)
    setDatos(null)
    setComentario('')
    setMensaje(null)
    setErrorDecision(null)
    void cargar()
    void cargarPendientes()
  }, [cargar, cargarPendientes])

  const nombre = datos ? nombreDe(datos.usuarios) : ''
  const justificacion = datos ? justificacionDe(datos) : null
  const mensajes = [...(justificacion?.mensajes_chat ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const m = datos?.marcaciones ?? null

  // Anterior / siguiente dentro de la bandeja por resolver (si el caso ya no está en ella, «siguiente» es el más antiguo).
  const posicion = pendientes.indexOf(id)
  const anterior = posicion > 0 ? pendientes[posicion - 1] : undefined
  const siguiente = pendientes.find((p, i) => p !== id && i > posicion)

  function pedir(decision: Decision) {
    setErrorDecision(null)
    if (decision === 'rechazada' && !comentario.trim()) {
      setErrorDecision('Para rechazar un caso escribe un comentario: la persona lo verá en la app.')
      return
    }
    setConfirmando(decision)
  }

  async function decidir(decision: Decision) {
    setGuardando(true)
    setErrorDecision(null)
    const r = await supabase.rpc('decidir_anomalia', { p_anomalia: id, p_decision: decision, p_comentario: comentario.trim() || null })
    setGuardando(false)
    setConfirmando(null)
    if (r.error) {
      setErrorDecision(errorDeDecision(r.error.message))
      return
    }
    setComentario('')
    setMensaje(TEXTOS_DECISION[decision].hecho)
    await Promise.all([cargar(), cargarPendientes()])
  }

  const volver = (
    <Link to="/admin/anomalias" className="rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo">
      ‹ Volver a la bandeja
    </Link>
  )

  if (cargando) return <><EncabezadoPagina titulo="Anomalías" /><p className="p-4 text-sm font-semibold text-texto-suave sm:p-7">Cargando…</p></>
  if (error || !datos) {
    return (
      <>
        <EncabezadoPagina titulo="Anomalías">{volver}</EncabezadoPagina>
        <div className="p-4 sm:p-7"><Aviso tipo="error">{error ?? 'No se encontró el caso'}</Aviso></div>
      </>
    )
  }

  const estado = ESTADOS[datos.estado]
  const decidible = puedeDecidir(datos.estado)
  const escalado = justificacion?.decision_final === 'escalada'
  const automatica = justificacion?.decision_final === 'aprobada' && !justificacion.revisado_por
  const decidido = justificacion?.decision_final === 'aprobada' || justificacion?.decision_final === 'rechazada'

  return (
    <>
      <EncabezadoPagina titulo={`${nombreDeTipo(datos.tipo)} · ${nombre}`} detalle={`Anomalías · Caso #${caso(datos.numero)}`}>
        {volver}
        <Chip tono={estado.tono}>{estado.texto}</Chip>
        <button disabled={!anterior} onClick={() => anterior && navegar(`/admin/anomalias/${anterior}`)}
          className="rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
          Caso anterior
        </button>
        <button disabled={!siguiente} onClick={() => siguiente && navegar(`/admin/anomalias/${siguiente}`)}
          className="rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
          Caso siguiente
        </button>
      </EncabezadoPagina>

      <div className="grid gap-5 p-4 sm:p-7 xl:grid-cols-2">
        <div className="space-y-5">
          <section className={tarjeta} aria-label="Registro original">
            <h2 className="text-lg font-extrabold text-marino">Registro original</h2>
            {datos.detalle && <p className="mt-2 text-sm font-semibold text-texto">{datos.detalle}</p>}
            {m ? (
              <>
                <div className="mt-4">
                  <Mapa alto={220} actual={{ lat: m.latitud, lon: m.longitud, radio: m.precision_m ?? 10 }}
                    ajustarA={[{ lat: m.latitud, lon: m.longitud, radio: Math.max(m.precision_m ?? 10, 60), tono: 'actual' }]} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className={dato}>
                    <div className={etiqueta}>Marcación</div>
                    <div className="mt-0.5 font-extrabold text-marino">{TIPOS_MARCACION[m.tipo] ?? m.tipo} · {fechaHora(m.fecha_hora)}</div>
                    <div className="font-mono text-xs font-semibold text-texto-suave">
                      {m.latitud.toFixed(4)}, {m.longitud.toFixed(4)}{m.precision_m != null && ` · ±${Math.round(m.precision_m)} m`}
                    </div>
                  </div>
                  <div className={dato}>
                    <div className={etiqueta}>Sede</div>
                    <div className="mt-0.5 font-extrabold text-marino">{m.sedes?.nombre ?? '—'}</div>
                  </div>
                  <div className={dato}>
                    <div className={etiqueta}>Origen</div>
                    <div className="mt-0.5 font-extrabold text-marino">
                      {m.origen === 'app' ? 'App · celular vinculado' : `Web · ${MOTIVOS_CONTINGENCIA[m.motivo_contingencia ?? ''] ?? 'contingencia'}`}
                    </div>
                  </div>
                  <div className={dato}>
                    <div className={etiqueta}>Verificación facial</div>
                    <div className="mt-0.5 font-extrabold text-marino">
                      {m.verificacion === 'verificada' ? 'Coincide con el registro' : m.verificacion === 'fallida' ? 'No coincide con el registro' : 'Pendiente de verificar'}
                      {m.similitud_score != null && <span className="font-semibold text-texto-suave"> · {Math.round(m.similitud_score * 100)}&nbsp;%</span>}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-4 rounded-xl bg-lienzo px-4 py-3 text-sm font-semibold text-texto-suave">
                {datos.tipo === 'verificacion_fallida'
                  ? `La marcación no se guardó porque el rostro no coincidió${datos.intentos_fallidos ? ` (${datos.intentos_fallidos} ${datos.intentos_fallidos === 1 ? 'intento' : 'intentos'})` : ''}.`
                  : 'Esta anomalía no está ligada a una marcación: la persona no marcó ese día.'}
              </p>
            )}
          </section>

          <section className={tarjeta} aria-label="Historial del caso">
            <h2 className="text-lg font-extrabold text-marino">Historial del caso</h2>
            <ol className="mt-3 space-y-3">
              <Paso titulo="Detección automática" detalle={fechaHora(datos.created_at)} />
              {mensajes.length > 0 && <Paso titulo="Justificación enviada por la persona" detalle={`${fechaHora(mensajes[0]!.created_at)} · chat`} />}
              {datos.estado === 'sin_justificar' && <Paso titulo="El plazo venció sin justificación" detalle={fechaHora(datos.fecha_vencimiento)} />}
              {(decidido || escalado) && justificacion?.fecha_decision && (
                <Paso
                  titulo={escalado ? 'Escalado a jefatura'
                    : justificacion.decision_final === 'aprobada' ? (automatica ? 'Aprobada automáticamente por el sistema' : 'Justificación aprobada')
                    : 'Caso rechazado'}
                  detalle={fechaHora(justificacion.fecha_decision)}
                  nota={justificacion.comentario_admin}
                  tono={justificacion.decision_final === 'rechazada' ? 'error' : 'ok'}
                />
              )}
              {datos.estado === 'pendiente' && <Paso titulo="Esperando la justificación de la persona" detalle={`Puede justificar hasta el ${fechaHora(datos.fecha_vencimiento)}`} tono="aviso" />}
              {decidible && !decidido && <Paso titulo="Pendiente de decisión de Talento Humano" tono="aviso" />}
            </ol>
          </section>
        </div>

        <div className="space-y-5">
          <section className={tarjeta} aria-label="Justificación">
            <h2 className="text-lg font-extrabold text-marino">Justificación de la persona</h2>
            {(justificacion?.resumen_ia || justificacion?.clasificacion_ia) && (
              <div className="mt-3 rounded-xl bg-lienzo p-4 text-sm font-semibold leading-relaxed text-texto">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={etiqueta}>
                    Resumen generado por IA{justificacion.confianza_ia != null && ` · confianza ${justificacion.confianza_ia.toFixed(2)}`}
                  </span>
                  {justificacion.clasificacion_ia && (
                    <Chip tono={CLASIFICACIONES_IA[justificacion.clasificacion_ia].tono}>{CLASIFICACIONES_IA[justificacion.clasificacion_ia].texto}</Chip>
                  )}
                </div>
                {justificacion.resumen_ia && <p className="mt-1">{justificacion.resumen_ia}</p>}
                <p className="mt-2 text-xs font-semibold text-etiqueta">La IA solo orienta: la decisión es de Talento Humano.</p>
              </div>
            )}
            {mensajes.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-texto-suave">
                {datos.estado === 'sin_justificar' ? 'La persona no envió ninguna justificación en el plazo.' : 'Todavía no hay una justificación de la persona.'}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {mensajes.map((x, i) => (
                  <li key={i} className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm font-semibold ${x.emisor === 'usuario' ? 'bg-celeste text-marino' : 'bg-lienzo text-texto'}`}>
                    <div className={etiqueta}>{x.emisor === 'usuario' ? nombre || 'Persona' : 'Asistente'} · {fechaHora(x.created_at)}</div>
                    <p className="mt-0.5 whitespace-pre-wrap">{x.contenido}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={tarjeta} aria-label="Decisión">
            <h2 className="text-lg font-extrabold text-marino">Decisión</h2>
            {mensaje && <div className="mt-3"><Aviso tipo="ok">{mensaje}</Aviso></div>}
            {decidible ? (
              <>
                <label className="mt-3 block">
                  <span className="sr-only">Comentario para el expediente</span>
                  <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={3} maxLength={500}
                    placeholder="Comentario para el expediente (obligatorio al rechazar)…"
                    className="w-full rounded-xl border border-borde bg-lienzo px-4 py-3 text-sm font-semibold text-marino outline-none placeholder:text-placeholder focus:border-marino" />
                </label>
                {errorDecision && <div className="mt-3"><Aviso tipo="error">{errorDecision}</Aviso></div>}
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <button onClick={() => pedir('aprobada')}
                    className="rounded-[14px] bg-ambar px-4 py-3 text-[15px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95">
                    Aprobar justificación
                  </button>
                  <button onClick={() => pedir('rechazada')}
                    className="rounded-[14px] border border-error-borde bg-error-fondo px-4 py-3 text-[15px] font-extrabold text-error hover:brightness-95">
                    Rechazar
                  </button>
                  <button onClick={() => pedir('escalada')}
                    className="rounded-[14px] border border-marino bg-white px-4 py-3 text-[15px] font-extrabold text-marino hover:bg-lienzo">
                    Escalar a jefatura
                  </button>
                </div>
                <p className="mt-3 text-center text-xs font-semibold text-etiqueta">La decisión se muestra a la persona en la app y queda registrada en el expediente.</p>
              </>
            ) : datos.estado === 'pendiente' ? (
              <p className="mt-3 text-sm font-semibold text-texto-suave">
                La persona todavía puede justificar este caso. Cuando lo haga (o venza el plazo) aparecerá en «Por resolver».
              </p>
            ) : (
              <div className="mt-3 space-y-2 text-sm font-semibold text-texto">
                <p>Este caso ya está resuelto: <strong className="text-marino">{estado.texto.toLowerCase()}</strong>.</p>
                {justificacion?.comentario_admin && <p className="rounded-xl bg-lienzo px-4 py-3">«{justificacion.comentario_admin}»</p>}
              </div>
            )}
            {escalado && decidible && (
              <p className="mt-3 text-xs font-semibold text-aviso">Este caso fue escalado a jefatura. Puedes registrar aquí la decisión final cuando la tengas.</p>
            )}
          </section>
        </div>
      </div>

      {confirmando && (
        <Confirmar
          titulo={TEXTOS_DECISION[confirmando].titulo(caso(datos.numero))}
          texto={TEXTOS_DECISION[confirmando].texto(nombre)}
          confirmar={guardando ? 'Un momento…' : TEXTOS_DECISION[confirmando].confirmar}
          onConfirmar={() => { if (!guardando) void decidir(confirmando) }}
          onCancelar={() => setConfirmando(null)}
        />
      )}
    </>
  )
}

function Paso({ titulo, detalle, nota, tono = 'ok' }: { titulo: string; detalle?: string; nota?: string | null; tono?: 'ok' | 'aviso' | 'error' }) {
  const punto = { ok: 'bg-marino', aviso: 'bg-ambar', error: 'bg-error' }[tono]
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 size-2.5 flex-none rounded-full ${punto}`} />
      <div>
        <div className="text-sm font-extrabold text-marino">{titulo}</div>
        {detalle && <div className="text-xs font-semibold text-texto-suave">{detalle}</div>}
        {nota && <div className="mt-1 text-xs font-semibold text-texto">«{nota}»</div>}
      </div>
    </li>
  )
}
