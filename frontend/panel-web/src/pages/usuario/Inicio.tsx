import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Mapa } from '../../components/Mapa'
import { Esqueleto } from '../../components/Esqueleto'
import { Aviso, Boton, Chip } from '../../components/ui'
import { fechaConDia, horaLocal, nombreDeTipo, simboloDeTipo, textoDeMotivo, type MarcacionResumen, type MotivoContingencia } from '../../lib/marcacion'
import { guardarMotivo, leerMotivo } from '../../lib/motivo'
import { useEstadoHoy, useZona, type Zona } from '../../lib/useJornada'
import FlujoMarcacion from './FlujoMarcacion'

const primerNombre = (nombres: string) => nombres.trim().split(/\s+/)[0] ?? ''

export default function InicioUsuario() {
  const { perfil } = useAuth()
  const { estado: hoy, error: errorHoy, cargando, recargar } = useEstadoHoy()
  const { estado: ubicacion, medir } = useZona()
  const [flujo, setFlujo] = useState(false)
  const [motivo, setMotivo] = useState<MotivoContingencia | ''>(leerMotivo)

  const cambiarMotivo = (m: MotivoContingencia | '') => { setMotivo(m); guardarMotivo(m) }
  const alCerrarFlujo = (registrada: boolean) => {
    setFlujo(false)
    if (registrada) void recargar()
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

  // El servidor dice qué incertidumbre acepta; si el navegador informa más, no se deja marcar hasta medir mejor.
  const precision = ubicacion.fase === 'lista' ? ubicacion.posicion.precision_m : null
  const imprecisa = !!zona && precision != null && zona.precision_max_m != null && precision > zona.precision_max_m
  const puede = ubicacion.fase === 'lista' && !!hoy && !bloqueo && !!siguiente && !imprecisa

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-4 p-4 sm:p-7">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          {hoy ? <p className="text-[13px] font-semibold text-texto-suave">{fechaConDia(hoy.fecha)}</p> : <Esqueleto className="h-3.5 w-36" />}
          <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Hola, {primerNombre(perfil?.nombres ?? '')}</h1>
        </div>
        {zona && <span className="ml-auto"><Chip tono="neutro">{zona.sede}</Chip></span>}
      </header>

      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-aviso-borde bg-aviso-fondo px-3.5 py-2.5 text-sm font-bold text-aviso">
        <span>Estás usando el canal web de contingencia. Tus marcaciones web quedan registradas con su motivo.</span>
        {motivo && <Chip tono="aviso">WEB · {textoDeMotivo(motivo)}</Chip>}
      </div>

      {errorHoy && <Aviso tipo="error">{errorHoy}</Aviso>}

      <div>
        <section aria-labelledby="registro" className="rounded-[20px] border border-borde-suave bg-white p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="grid size-11 flex-none place-items-center rounded-full bg-celeste text-lg font-extrabold text-marino">◎</div>
            <div>
              <h2 id="registro" className="text-[17px] font-extrabold text-marino">Registro de asistencia</h2>
              {cargando ? (
                <div role="progressbar" aria-label="Cargando tu jornada" className="mt-1.5"><Esqueleto className="h-3.5 w-56 max-w-full" /></div>
              ) : (
                <p className="text-[13px] font-semibold text-texto-suave">
                  {siguiente
                    ? `Próxima marcación: ${nombreDeTipo(siguiente).toLowerCase()}${hoy?.jornada ? ` · jornada ${hoy.jornada.inicio}` : ''}`
                    : 'Jornada de hoy completa'}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
            <MapaZona ubicacion={ubicacion} />
            <div className="flex flex-col gap-3">
              {ubicacion.fase === 'buscando' && (
                <div role="progressbar" aria-label="Obteniendo tu ubicación" className="space-y-3">
                  <Esqueleto className="h-6 w-44 rounded-full" />
                  <div className="space-y-2">
                    <Esqueleto className="h-5 w-3/4" />
                    <Esqueleto className="h-3.5 w-full" />
                  </div>
                </div>
              )}
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
              {imprecisa && zona && (
                <>
                  <p role="status" className="text-[13px] font-bold text-aviso">
                    La precisión de tu ubicación es de ±{Math.round(precision ?? 0)} m y para marcar se necesita ±{zona.precision_max_m} m o menos. Acércate a una ventana, espera unos segundos y vuelve a medir. Un computador no tiene GPS y su ubicación es aproximada: si puedes, marca desde la app en tu celular.
                  </p>
                  <Boton variante="borde" onClick={() => void medir()}>Volver a medir</Boton>
                </>
              )}
              {puede && fueraConObservacion && <p role="status" className="text-[13px] font-bold text-aviso">Puedes marcar desde aquí, pero quedará una observación para revisión.</p>}
              {puede && zona && !zona.dentro && zona.permite_fuera && <p className="text-[13px] font-semibold text-texto-suave">Tu sede permite marcar fuera de la zona.</p>}
              <Boton disabled={!puede} onClick={() => setFlujo(true)} className="mt-auto">Registrar asistencia</Boton>
            </div>
          </div>
        </section>

        <section aria-labelledby="hoy" className="mt-4 rounded-[20px] border border-borde-suave bg-white p-4 sm:p-5">
          <h2 id="hoy" className="text-[15px] font-extrabold text-marino">Tus marcaciones de hoy</h2>
          {cargando ? (
            <div role="progressbar" aria-label="Cargando tus marcaciones" className="mt-3 space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Esqueleto className="size-9 flex-none rounded-full" />
                  <Esqueleto className="h-4 w-40" />
                </div>
              ))}
            </div>
          ) : (hoy?.marcaciones ?? []).length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-texto-suave">Todavía no marcas nada hoy.</p>
          ) : (
            <ul className="mt-2 divide-y divide-lienzo">
              {(hoy?.marcaciones ?? []).map((m) => <MarcaDeHoy key={m.id} m={m} />)}
            </ul>
          )}
        </section>
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
  if (ubicacion.fase === 'buscando') {
    return <Esqueleto className="h-[220px] rounded-[14px] md:h-[260px]" />
  }
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

function MarcaDeHoy({ m }: { m: MarcacionResumen }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-sm font-extrabold text-marino">{simboloDeTipo(m.tipo)}</div>
      <p className="min-w-0 flex-1 truncate text-sm font-extrabold text-marino">{nombreDeTipo(m.tipo)} {horaLocal(m.fecha_hora)}</p>
      <div className="flex flex-col items-end gap-1">
        <Chip tono="ok">SINCRONIZADO</Chip>
        {m.origen === 'web' && <Chip tono="neutro">WEB</Chip>}
      </div>
    </li>
  )
}
