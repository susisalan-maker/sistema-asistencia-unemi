import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import { abrirCamara, cerrarCamara, ErrorCamara, tomarFoto, type FotoTomada } from '../../lib/camara'
import {
  avisoDeAnomalia, horaLocal, MOTIVOS, nombreDeTipo, registradoDe, textoDeMotivo, type MotivoContingencia, type RespuestaMarcar, type TipoMarcacion,
} from '../../lib/marcacion'
import { nuevoId } from '../../lib/motivo'
import { ErrorUbicacion, obtenerPosicion, VIGENCIA_MS, type Posicion } from '../../lib/ubicacion'
import type { Zona } from '../../lib/useJornada'
import { nombreCompleto } from '../../lib/texto'

/** Los pasos del mockup: solicitud (U3) → cámara (U4) → analizando → registrada (U5) o sin verificar (U6). */
type Fase = 'aviso' | 'camara' | 'analizando' | 'listo' | 'rostro' | 'error'

const PASOS = ['Rostro detectado', 'Comparando con el rostro registrado', 'Registrando la asistencia']

interface Props {
  tipo: TipoMarcacion
  zona: Zona
  posicion: Posicion
  motivo: MotivoContingencia | ''
  onMotivo: (m: MotivoContingencia | '') => void
  /** Cierra el flujo. `registrada` avisa si hay que recargar los datos del inicio. */
  onCerrar: (registrada: boolean) => void
}

export default function FlujoMarcacion({ tipo, zona, posicion: posicionInicial, motivo, onMotivo, onCerrar }: Props) {
  const { perfil, cerrarSesion } = useAuth()
  const [fase, setFase] = useState<Fase>('aviso')
  const [posicion, setPosicion] = useState(posicionInicial)
  const [foto, setFoto] = useState<FotoTomada | null>(null)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const [camaraLista, setCamaraLista] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fallo, setFallo] = useState<{ mensaje: string; generico: boolean; intento: number | null } | null>(null)
  const [resultado, setResultado] = useState<RespuestaMarcar | null>(null)
  const [paso, setPaso] = useState(0)
  const [horaInicio] = useState(() => new Date().toISOString())
  const video = useRef<HTMLVideoElement>(null)
  // El id se fija en el primer envío: si falla la red y se reintenta, la marcación no se duplica.
  const intento = useRef<string | null>(null)
  // Si el servidor rechazó la ubicación por poca precisión, al reintentar hay que medirla otra vez (no vale la de antes).
  const remedir = useRef(false)
  const nombre = nombreDeTipo(tipo)
  const hora = horaLocal(horaInicio)

  // La cámara solo está encendida mientras se ve la vista previa.
  useEffect(() => {
    if (fase !== 'camara') return
    let flujo: MediaStream | null = null
    let vigente = true
    setErrorCamara(null)
    setCamaraLista(false)
    abrirCamara().then((f) => {
      if (!vigente) { cerrarCamara(f); return }
      flujo = f
      if (video.current) video.current.srcObject = f
    }).catch((e) => {
      if (vigente) setErrorCamara(e instanceof ErrorCamara ? e.message : 'No se pudo abrir la cámara.')
    })
    return () => { vigente = false; cerrarCamara(flujo) }
  }, [fase])

  // Los tres pasos de «Analizando» avanzan mientras el servidor responde.
  useEffect(() => {
    if (fase !== 'analizando') return
    setPaso(0)
    const uno = setTimeout(() => setPaso(1), 900)
    const dos = setTimeout(() => setPaso(2), 2200)
    return () => { clearTimeout(uno); clearTimeout(dos) }
  }, [fase])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape' && fase === 'aviso') onCerrar(false) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [fase, onCerrar])

  function capturar() {
    if (!video.current) return
    setError(null)
    let f: FotoTomada
    try {
      f = tomarFoto(video.current)
    } catch (e) {
      setError(e instanceof ErrorCamara ? e.message : 'No se pudo tomar la foto. Inténtalo de nuevo.')
      return
    }
    setFoto(f)
    void enviar(f)
  }

  async function enviar(f: FotoTomada | null = foto) {
    if (!f || !motivo) return
    setError(null)
    setFase('analizando')
    try {
      // Si pasó mucho desde que se midió, la ubicación ya no vale: se mide otra vez.
      let pos = posicion
      if (remedir.current || Date.now() - posicion.tomadaEn > VIGENCIA_MS) {
        remedir.current = false
        pos = await obtenerPosicion()
        setPosicion(pos)
      }
      intento.current ??= nuevoId()
      // En web no hay dispositivo vinculado: el servidor registra la marcación con origen «web» y el motivo.
      const respuesta = await api<RespuestaMarcar>('/marcaciones', {
        method: 'POST',
        body: {
          id: intento.current,
          tipo,
          latitud: pos.latitud,
          longitud: pos.longitud,
          precision_m: pos.precision_m,
          ubicacion_simulada: false,
          origen: 'web',
          motivo_contingencia: motivo,
          selfie_b64: f.base64,
        },
      })
      setResultado(respuesta)
      setFase('listo')
    } catch (e) {
      if (e instanceof ApiError && e.codigo === 'precision_insuficiente') remedir.current = true   // se muestra como error común; no es del rostro
      else if (e instanceof ApiError && e.status === 422 && e.message !== 'Revisa los datos ingresados') {
        // Rostro que no coincide (con código) o foto sin calidad suficiente (solo mensaje): se repite la verificación.
        setFallo({ mensaje: e.message, generico: e.codigo === 'rostro_no_verificado', intento: e.intento ?? null })
        setFase('rostro')
        return
      }
      setError(e instanceof ErrorUbicacion || e instanceof ApiError ? e.message : 'No se pudo registrar la marcación. Inténtalo de nuevo.')
      setFase('error')
    }
  }

  function reintentarVerificacion() {
    setFoto(null)
    setError(null)
    setFallo(null)
    setFase('camara')
  }

  const pantallaCompleta = fase !== 'aviso'
  const titulo = { aviso: 'Verifica tu identidad', camara: 'Verificación facial', analizando: 'Verificación facial', listo: 'Asistencia registrada', rostro: 'Verificación no superada', error: nombre }[fase]

  return (
    <div role="dialog" aria-modal="true" aria-label={titulo}
      className="fixed inset-0 z-50 flex items-end justify-center bg-marino/40 md:items-center md:p-6">
      <div className={`flex max-h-full w-full flex-col overflow-y-auto bg-white shadow-[0_24px_60px_rgba(27,42,110,.14)] md:max-w-[520px] md:rounded-[24px] ${pantallaCompleta ? 'max-md:h-full' : 'max-md:rounded-t-[24px]'}`}>
        {fase === 'aviso' && (
          <Cuerpo>
            <Cabecera titulo="Verifica tu identidad" onCerrar={() => onCerrar(false)} />
            <p className="text-sm font-semibold text-texto-suave">
              Abriremos la cámara para comparar tu rostro con el registrado en tu cuenta institucional y firmar la marcación de las {hora}.
            </p>
            <div className="rounded-[16px] border border-borde-suave">
              <Fila etiqueta="Marcación" valor={`${nombre} · ${hora}`} />
              <Fila etiqueta="Sede" valor={zona.sede} />
              <Fila etiqueta="Ubicación" valor={zona.dentro ? 'Dentro del perímetro' : 'Fuera del perímetro'} sinBorde />
            </div>
            <div>
              <label htmlFor="motivo" className="text-[13px] font-extrabold text-marino">¿Por qué marcas desde la web?</label>
              <select id="motivo" value={motivo} onChange={(e) => onMotivo(e.target.value as MotivoContingencia | '')}
                className="mt-1.5 w-full rounded-[12px] border border-borde bg-white px-3.5 py-3 text-sm font-bold text-marino outline-none focus:border-marino">
                <option value="">Elige el motivo…</option>
                {MOTIVOS.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </select>
              <p className="mt-1.5 text-xs font-semibold text-texto-suave">La marcación web es de contingencia: queda registrada con este motivo.</p>
            </div>
            <ul className="space-y-1 text-sm font-semibold text-texto">
              <li>• Ubícate en un lugar bien iluminado</li>
              <li>• Retira gafas oscuras, gorra o mascarilla</li>
            </ul>
            {!zona.dentro && !zona.permite_fuera && <Aviso tipo="aviso">Estás fuera de la zona: puedes marcar, pero quedará una observación para revisión.</Aviso>}
            <p className="text-xs font-semibold text-texto-suave">
              Tu navegador te pedirá permiso para usar la cámara. La imagen solo se usa para compararla con el rostro registrado en tu cuenta.
            </p>
            <div className="mt-auto flex flex-col gap-2.5 sm:flex-row-reverse">
              <Boton disabled={!motivo} onClick={() => setFase('camara')}>Iniciar verificación facial</Boton>
              <Boton variante="borde" onClick={() => onCerrar(false)}>Cancelar marcación</Boton>
            </div>
          </Cuerpo>
        )}

        {(fase === 'camara' || fase === 'analizando') && (
          <Cuerpo>
            <Cabecera titulo="Verificación facial" onCerrar={() => setFase('aviso')} deshabilitado={fase === 'analizando'} />
            <p className="text-center text-sm font-bold text-texto-suave">Centra tu rostro dentro del óvalo</p>
            <div className="mx-auto grid h-[300px] w-[232px] flex-none place-items-center overflow-hidden rounded-[116px/150px] border-4 border-ambar bg-marino/90">
              {fase === 'analizando' && foto
                ? <img src={foto.url} alt="Tu foto" className="size-full -scale-x-100 object-cover" />
                : errorCamara
                  ? <p className="px-4 text-center text-xs font-bold text-white">Sin cámara</p>
                  : <video ref={video} autoPlay muted playsInline aria-label="Vista de tu cámara" onLoadedData={() => setCamaraLista(true)}
                      className="size-full -scale-x-100 object-cover" />}
            </div>
            {fase === 'analizando' ? (
              <Analizando paso={paso} />
            ) : (
              <div className="space-y-3">
                {errorCamara && <Aviso tipo="error">{errorCamara}</Aviso>}
                {error && <Aviso tipo="error">{error}</Aviso>}
                <p className="text-center text-sm font-semibold text-texto-suave">
                  Mira de frente a la cámara · comparando con {perfil ? `${nombreCompleto(perfil)} · ${perfil.email}` : 'tu cuenta'}
                </p>
                {errorCamara
                  ? <Boton onClick={() => setFase('aviso')}>Volver</Boton>
                  : <Boton disabled={!camaraLista} onClick={capturar}>Tomar foto</Boton>}
              </div>
            )}
          </Cuerpo>
        )}

        {fase === 'listo' && resultado && (
          <Cuerpo>
            <div className="rounded-[20px] border border-ok-borde bg-ok-fondo p-6 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-ok text-3xl font-extrabold text-white" aria-hidden="true">✓</div>
              <h2 className="mt-3 text-xl font-extrabold tracking-tight text-marino">
                {resultado.reintento
                  ? `${nombreDeTipo(resultado.marcacion.tipo)} ya estaba registrado`
                  : registradoDe(resultado.marcacion.tipo)} · {horaLocal(resultado.marcacion.fecha_hora)}
              </h2>
              <p className="mt-1 text-sm font-semibold text-texto-suave">{zona.lugar ?? zona.sede} · {zona.dentro ? 'dentro del perímetro' : 'fuera del perímetro'}</p>
              <p className="mt-1 text-sm font-semibold text-texto-suave">Identidad verificada por reconocimiento facial.</p>
            </div>
            <div className="rounded-[16px] border border-borde-suave">
              <Fila etiqueta="Tipo" valor={nombreDeTipo(resultado.marcacion.tipo)} />
              <Fila etiqueta="Sede" valor={zona.sede} />
              <Fila etiqueta="Registrado desde" valor="Navegador web" />
              <Fila etiqueta="Motivo" valor={motivo ? textoDeMotivo(motivo) : '—'} />
              <Fila etiqueta="Estado" valor="Sincronizado" sinBorde />
            </div>
            {resultado.anomalias.length > 0 && (
              <div role="alert" className="space-y-1 rounded-[14px] border border-aviso-borde bg-aviso-fondo p-3.5 text-[13px] font-bold text-aviso">
                {resultado.anomalias.map((a) => <p key={a.tipo}>{avisoDeAnomalia(a.tipo)}</p>)}
                <p>Quedó una observación para revisión.</p>
              </div>
            )}
            <div className="mt-auto flex flex-col gap-2.5">
              <Boton onClick={() => onCerrar(true)}>Volver al inicio</Boton>
              <Boton variante="borde" onClick={() => void cerrarSesion()}>Cerrar sesión</Boton>
            </div>
          </Cuerpo>
        )}

        {fase === 'rostro' && fallo && (
          <Cuerpo>
            <div className="rounded-[20px] border border-aviso-borde bg-aviso-fondo p-6 text-center">
              <div className="mx-auto grid size-14 place-items-center rounded-full bg-ambar text-3xl font-extrabold text-ambar-tinta" aria-hidden="true">!</div>
              <h2 className="mt-3 text-xl font-extrabold tracking-tight text-marino">No pudimos verificar tu identidad</h2>
              <p className="mt-1 text-sm font-semibold leading-relaxed text-aviso">
                {fallo.generico ? 'No pudimos reconocer tu rostro' : fallo.mensaje.replace(/[.\s]+$/, '')}. Tu marcación de las {hora} no se ha guardado.
              </p>
            </div>
            <div>
              <p className="mb-1.5 px-1 text-xs font-extrabold uppercase tracking-[.1em] text-etiqueta">Antes de reintentar</p>
              <div className="rounded-[16px] border border-borde-suave">
                {['Busca un lugar con buena iluminación', 'Retira gafas oscuras, gorra o mascarilla', 'Mira de frente y centra el rostro en el óvalo'].map((t, i, a) => (
                  <Fila key={t} etiqueta={t} valor="✓" sinBorde={i === a.length - 1} />
                ))}
              </div>
              {fallo.intento != null && <p className="mt-2 text-center text-xs font-semibold text-texto-suave">Intento {fallo.intento}. Si no se verifica, el intento queda registrado para revisión de Talento Humano.</p>}
            </div>
            <div className="mt-auto flex flex-col gap-2.5 sm:flex-row-reverse">
              <Boton onClick={reintentarVerificacion}>Reintentar verificación</Boton>
              <Boton variante="borde" onClick={() => onCerrar(false)}>Cancelar marcación</Boton>
            </div>
          </Cuerpo>
        )}

        {fase === 'error' && (
          <Cuerpo>
            <Cabecera titulo={nombre} onCerrar={() => onCerrar(false)} />
            <Aviso tipo="error">{error ?? 'No se pudo registrar la marcación.'}</Aviso>
            <div className="mt-auto flex flex-col gap-2.5 sm:flex-row-reverse">
              <Boton onClick={() => void enviar()}>Reintentar</Boton>
              <Boton variante="borde" onClick={() => onCerrar(false)}>Cancelar marcación</Boton>
            </div>
          </Cuerpo>
        )}
      </div>
    </div>
  )
}

function Cuerpo({ children }: { children: ReactNode }) {
  return <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">{children}</div>
}

function Cabecera({ titulo, onCerrar, deshabilitado }: { titulo: string; onCerrar: () => void; deshabilitado?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <h2 className="text-xl font-extrabold tracking-tight text-marino">{titulo}</h2>
      <button type="button" onClick={onCerrar} disabled={deshabilitado} aria-label="Cerrar"
        className="ml-auto text-xl font-bold text-etiqueta hover:text-marino disabled:opacity-40">×</button>
    </div>
  )
}

function Fila({ etiqueta, valor, sinBorde }: { etiqueta: string; valor: string; sinBorde?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${sinBorde ? '' : 'border-b border-lienzo'}`}>
      <span className="font-semibold text-texto-suave">{etiqueta}</span>
      <span className="text-right font-extrabold text-marino">{valor}</span>
    </div>
  )
}

function Analizando({ paso }: { paso: number }) {
  return (
    <div className="space-y-3" role="progressbar" aria-label="Analizando rostro">
      <p className="text-lg font-extrabold text-marino">Analizando rostro…</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-celeste">
        <div className="h-full bg-ambar transition-[width] duration-500" style={{ width: `${Math.round(((paso + 1) / PASOS.length) * 100)}%` }} />
      </div>
      {PASOS.map((t, i) => (
        <p key={t} className={`text-sm font-bold ${i > paso ? 'text-placeholder' : 'text-marino'}`}>{i < paso ? '✓' : i === paso ? '•' : '○'} {t}</p>
      ))}
    </div>
  )
}
