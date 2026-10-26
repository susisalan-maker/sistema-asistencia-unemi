import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { Mapa } from '../../components/Mapa'
import { Aviso, Boton, Chip } from '../../components/ui'
import { fechaConDia, horaLocal, nombreDeTipo, rotuloDeDia, simboloDeTipo, textoDeMotivo, type MotivoContingencia } from '../../lib/marcacion'
import { guardarMotivo, leerMotivo } from '../../lib/motivo'
import { puntualidad, type MarcaDeHistorial } from '../../lib/puntualidad'
import { useEstadoHoy, useHistorial, useZona, type Zona } from '../../lib/useJornada'
import { useAvisos } from './contexto'
import FlujoMarcacion from './FlujoMarcacion'

const primerNombre = (nombres: string) => nombres.trim().split(/\s+/)[0] ?? ''

export default function InicioUsuario() {
  const { perfil } = useAuth()
  const { estado: hoy, error: errorHoy, cargando, recargar } = useEstadoHoy()
  const { estado: ubicacion, medir } = useZona()
  const { historial, recargar: recargarHistorial } = useHistorial()
  const { cantidad: porExplicar } = useAvisos()
  const [flujo, setFlujo] = useState(false)
  const [motivo, setMotivo] = useState<MotivoContingencia | ''>(leerMotivo)

  const cambiarMotivo = (m: MotivoContingencia | '') => { setMotivo(m); guardarMotivo(m) }
  const alCerrarFlujo = (registrada: boolean) => {
    setFlujo(false)
    if (registrada) { void recargar(); void recargarHistorial() }
  }

  const zona = ubicacion.fase === 'lista' ? ubicacion.zona : null
  const siguiente = hoy?.siguiente ?? null
  const fueraConObservacion = !!zona && !zona.dentro && !zona.permite_fuera   // se puede marcar, pero queda una observación
  const sinRostro = !!hoy && hoy.rostro_requerido && !hoy.rostro_registrado

  // Por qué no se puede marcar ahora (si no hay motivo, el botón está activo). Estar fuera del perímetro no bloquea: queda una observación.
  let bloqueo: string | null = null
  if (hoy && sinRostro) bloqueo = 'Todavía no registras tu rostro. Hazlo desde la app del celular antes de marcar por la web.'
  else if (hoy && hoy.dia_laborable === false) {
    bloqueo = `${hoy.motivo_no_laborable ?? 'Hoy no es un día laborable para ti.'} Si te toca trabajar hoy, pide a Talento Humano que habilite este día en tu horario.`
  } else if (hoy && !siguiente) bloqueo = 'Ya completaste las marcaciones de hoy.'

  const puede = ubicacion.fase === 'lista' && !!hoy && !bloqueo && !!siguiente
  const pctPuntualidad = puntualidad(historial)
  const recientes = (historial?.dias ?? []).flatMap((d) => [...d.marcaciones].reverse().map((m) => ({ ...m, fecha: d.fecha }))).slice(0, 3)

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-4 sm:p-7">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[13px] font-semibold text-texto-suave">{hoy ? fechaConDia(hoy.fecha) : ' '}</p>
          <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Hola, {primerNombre(perfil?.nombres ?? '')}</h1>
        </div>
        {zona && <span className="ml-auto"><Chip tono="neutro">{zona.sede}</Chip></span>}
      </header>

      {porExplicar > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-aviso-borde bg-white px-3.5 py-2.5 text-sm font-bold text-marino shadow-[0_4px_12px_rgba(245,166,35,.14)]">
          <span aria-hidden="true" className="grid size-6 flex-none place-items-center rounded-full bg-aviso-fondo text-sm font-extrabold text-aviso">!</span>
          <span>{porExplicar === 1 ? 'Tienes 1 anomalía por explicar.' : `Tienes ${porExplicar} anomalías por explicar.`}</span>
          <Link to="/usuario/avisos" className="font-extrabold text-aviso underline-offset-2 hover:underline">Explicar ahora</Link>
        </div>
      )}

      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-aviso-borde bg-aviso-fondo px-3.5 py-2.5 text-sm font-bold text-aviso">
        <span>Estás usando el canal web de contingencia. Tus marcaciones web quedan registradas con su motivo.</span>
        {motivo && <Chip tono="aviso">WEB · {textoDeMotivo(motivo)}</Chip>}
      </div>

      {errorHoy && <Aviso tipo="error">{errorHoy}</Aviso>}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1200px]:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="registro" className="rounded-[20px] border border-borde-suave bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-celeste text-lg font-extrabold text-marino">◎</div>
            <div>
              <h2 id="registro" className="text-[17px] font-extrabold text-marino">Registro de asistencia</h2>
              <p className="text-[13px] font-semibold text-texto-suave">
                {cargando ? 'Cargando tu jornada…' : siguiente
                  ? `Próxima marcación: ${nombreDeTipo(siguiente).toLowerCase()}${hoy?.jornada ? ` · jornada ${hoy.jornada.inicio}` : ''}`
                  : 'Jornada de hoy completa'}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <MapaZona ubicacion={ubicacion} />
            <div className="flex flex-col gap-3">
              {ubicacion.fase === 'buscando' && <p role="progressbar" aria-label="Obteniendo tu ubicación" className="text-sm font-semibold text-texto-suave">Obteniendo tu ubicación…</p>}
              {ubicacion.fase === 'error' && (
                <>
                  <Aviso tipo="error">{ubicacion.mensaje}</Aviso>
                  <Boton variante="borde" onClick={() => void medir()}>Reintentar</Boton>
                </>
              )}
              {zona && (
                <>
                  <div>
                    <Chip tono={zona.dentro ? 'ok' : 'aviso'}>{zona.dentro ? 'DENTRO DEL PERÍMETRO' : 'FUERA DEL PERÍMETRO'}</Chip>
                    {ubicacion.fase === 'lista' && ubicacion.posicion.precision_m != null && (
                      <p className="mt-1.5 text-xs font-semibold text-texto-suave">Ubicación del navegador ±{Math.round(ubicacion.posicion.precision_m)} m</p>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-marino">{zona.lugar ?? zona.sede}</p>
                    {zona.distancia_m != null && zona.radio_m != null && (
                      <p className="text-[13px] font-semibold text-texto-suave">A {formatoDistancia(zona.distancia_m)} del centro de la geocerca · radio {zona.radio_m} m</p>
                    )}
                  </div>
                </>
              )}
              {bloqueo && <p role="status" className="text-[13px] font-bold text-aviso">{bloqueo}</p>}
              {puede && fueraConObservacion && <p role="status" className="text-[13px] font-bold text-aviso">Puedes marcar desde aquí, pero quedará una observación para revisión.</p>}
              {puede && zona && !zona.dentro && zona.permite_fuera && <p className="text-[13px] font-semibold text-texto-suave">Tu sede permite marcar fuera de la zona.</p>}
              <Boton disabled={!puede} onClick={() => setFlujo(true)} className="mt-auto">Registrar asistencia</Boton>
            </div>
          </div>
        </section>

        <div className="min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Dato etiqueta="Jornada" valor={hoy?.jornada ? `${hoy.jornada.inicio} – ${hoy.jornada.fin}` : '—'} />
            <Dato etiqueta="Puntualidad" valor={pctPuntualidad == null ? '—' : `${pctPuntualidad} %`} ayuda="últimos 30 días" />
          </div>
          <section aria-labelledby="recientes" className="rounded-[20px] border border-borde-suave bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 id="recientes" className="text-[15px] font-extrabold text-marino">Historial reciente</h2>
              <Link to="/usuario/historial" className="text-[13px] font-extrabold text-marino hover:underline">Ver historial</Link>
            </div>
            {recientes.length === 0 ? (
              <p className="mt-3 text-sm font-semibold text-texto-suave">Todavía no hay marcaciones.</p>
            ) : (
              <ul className="mt-2 divide-y divide-lienzo">
                {recientes.map((m) => <Reciente key={m.id} m={m} fecha={m.fecha} />)}
              </ul>
            )}
          </section>
        </div>
      </div>

      {flujo && ubicacion.fase === 'lista' && siguiente && (
        <FlujoMarcacion tipo={siguiente} zona={ubicacion.zona} posicion={ubicacion.posicion}
          motivo={motivo} onMotivo={cambiarMotivo} onCerrar={alCerrarFlujo} />
      )}
    </div>
  )
}

const formatoDistancia = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)

function MapaZona({ ubicacion }: { ubicacion: ReturnType<typeof useZona>['estado'] }) {
  if (ubicacion.fase !== 'lista') {
    return <div className="grid h-[220px] place-items-center rounded-[14px] border border-borde bg-lienzo text-sm font-semibold text-texto-suave md:h-[260px]">Mapa de la sede</div>
  }
  const { zona, posicion } = ubicacion
  const punto = { lat: posicion.latitud, lon: posicion.longitud, radio: Math.max(posicion.precision_m ?? 10, 5) }
  const sede = zonaComoCirculo(zona)
  return <Mapa alto={260} actual={punto} contexto={sede ? [sede] : []} ajustarA={sede ? [sede, { ...punto, tono: 'actual' }] : [{ ...punto, tono: 'actual' }]} />
}

function zonaComoCirculo(z: Zona) {
  return z.centro && z.radio_m != null ? { lat: z.centro.latitud, lon: z.centro.longitud, radio: z.radio_m, tono: 'sede' as const } : null
}

function Dato({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  return (
    <div className="rounded-[18px] border border-borde-suave bg-white p-4">
      <p className="text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta">{etiqueta}</p>
      <p className="mt-1 text-[22px] font-extrabold text-marino">{valor}</p>
      {ayuda && <p className="text-[11px] font-semibold text-etiqueta">{ayuda}</p>}
    </div>
  )
}

function Reciente({ m, fecha }: { m: MarcaDeHistorial; fecha: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-sm font-extrabold text-marino">{simboloDeTipo(m.tipo)}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-extrabold text-marino">{nombreDeTipo(m.tipo)} {horaLocal(m.fecha_hora)}</p>
        <p className="truncate text-xs font-semibold text-etiqueta">{rotuloDeDia(fecha)}{m.lugar ? ` · ${m.lugar}` : ''}</p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Chip tono="ok">SINCRONIZADO</Chip>
        {m.origen === 'web' && <Chip tono="neutro">WEB</Chip>}
      </div>
    </li>
  )
}
