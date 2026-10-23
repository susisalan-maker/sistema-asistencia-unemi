import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Confirmar } from '../../components/Confirmar'
import { Modal } from '../../components/Modal'
import { Aviso, Boton, Campo, Chip } from '../../components/ui'
import { ApiError, api } from '../../lib/api'
import {
  errorDeLlave, errorDeModelo, errorDeNombre,
  type ClaveIA, type EstadoIA, type ProveedorIA, type ProveedorInfo,
} from './iaTipos'

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ApiError || e instanceof Error ? e.message : defecto)
const botonChico = '!w-auto !px-4 !py-2.5 !text-[13px]'

/**
 * Pestaña «Inteligencia artificial»: las claves de IA guardadas (proveedor + modelo + llave) como tarjetas, y UNA sola
 * activa: la que responde en el chat de justificación. Se agrega y se edita en ventanas; las tarjetas solo se leen
 * (más «Probar» y «Activar»). Todo pasa por el microservicio (`/ia/claves`), que cifra las llaves.
 */
export default function ConfiguracionIA() {
  const [estado, setEstado] = useState<EstadoIA | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [agregando, setAgregando] = useState(false)
  const [editando, setEditando] = useState<ClaveIA | null>(null)
  const [activando, setActivando] = useState<ClaveIA | null>(null)
  const [eliminando, setEliminando] = useState<ClaveIA | null>(null)

  const cargar = useCallback(async () => {
    try {
      setEstado(await api<EstadoIA>('/ia/claves'))
      setError(null)
    } catch (e) {
      setError(mensajeDe(e, 'No se pudo consultar las claves de IA'))
    }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function guardado(texto: string) {
    setAgregando(false)
    setEditando(null)
    setMensaje(texto)
    await cargar()
  }

  async function activar() {
    const clave = activando
    setActivando(null)
    if (!clave) return
    setMensaje(null)
    try {
      await api(`/ia/claves/${clave.id}`, { method: 'PATCH', body: { activa: true } })
      setMensaje(`Ahora responde «${clave.nombre}» (${clave.proveedor_nombre}). Rige desde la próxima justificación.`)
      await cargar()
    } catch (e) {
      setMensaje(null)
      setError(mensajeDe(e, 'No se pudo activar la clave'))
    }
  }

  async function eliminar() {
    const clave = eliminando
    setEliminando(null)
    if (!clave) return
    setMensaje(null)
    try {
      const r = await api<{ mensaje: string }>(`/ia/claves/${clave.id}`, { method: 'DELETE' })
      setMensaje(r.mensaje)
      await cargar()
    } catch (e) {
      setMensaje(null)
      setError(mensajeDe(e, 'No se pudo eliminar la clave'))
    }
  }

  if (cargando) return <p className="p-4 text-sm font-semibold text-texto-suave sm:p-7">Cargando…</p>

  const claves = estado?.claves ?? []
  const activa = claves.find((c) => c.activa)

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-5 sm:px-7 sm:pt-6">
        <p className="text-sm font-semibold text-texto-suave">Quién responde en el chat de justificación · vale para todas las sedes</p>
        {estado && (
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:ml-auto sm:w-auto">
            <Boton type="button" className={botonChico} onClick={() => { setMensaje(null); setAgregando(true) }}>Agregar clave</Boton>
          </div>
        )}
      </div>

      <div className="space-y-4 px-4 pb-7 pt-4 sm:px-7">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}

        {estado && (
          <>
            {estado.activa_ilegible && (
              <Aviso tipo="aviso">No se pudo abrir la clave activa guardada (¿cambió ROSTRO_CLAVE_AES en el servidor?). Escríbela de nuevo en «Editar».</Aviso>
            )}
            {!estado.puede_guardar_llaves && (
              <Aviso tipo="aviso">El servidor no tiene la clave de cifrado (ROSTRO_CLAVE_AES), así que no puede guardar llaves desde aquí. Configúrala en su .env.</Aviso>
            )}
            <EnUsoFranja estado={estado} />

            {claves.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-borde bg-white p-6 text-center">
                <p className="text-[15px] font-extrabold text-marino">Todavía no hay claves guardadas</p>
                <p className="mt-1 text-[13px] font-semibold text-texto-suave">Agrega la clave de Gemini, Claude u OpenAI y déjala activa para que responda el chat.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {claves.map((c) => (
                  <TarjetaClave key={c.id} clave={c} alEditar={() => { setMensaje(null); setEditando(c) }} alActivar={() => { setMensaje(null); setActivando(c) }} />
                ))}
              </div>
            )}

            <p className="px-1 text-xs font-semibold text-etiqueta">
              Cada cambio queda en la bitácora; de las llaves solo se anotan los últimos 4 caracteres. Si la IA falla o no hay clave activa, el caso pasa a revisión de Talento Humano.
            </p>
          </>
        )}
      </div>

      {agregando && estado && (
        <FormularioClave key="nueva" proveedores={estado.proveedores} hayActiva={!!activa} puedeGuardarLlaves={estado.puede_guardar_llaves}
          alCerrar={() => setAgregando(false)} alGuardar={guardado} />
      )}
      {editando && estado && (
        <FormularioClave key={editando.id} clave={editando} proveedores={estado.proveedores} hayActiva={!!activa} puedeGuardarLlaves={estado.puede_guardar_llaves}
          alCerrar={() => setEditando(null)} alGuardar={guardado} alEliminar={() => { setEliminando(editando); setEditando(null) }} />
      )}
      {activando && (
        <Confirmar
          titulo={`¿Activar «${activando.nombre}»?`}
          texto={`Desde la próxima justificación responderá ${activando.proveedor_nombre}, con el modelo ${activando.modelo ?? `recomendado (${activando.modelo_predeterminado})`}${activa ? ` y «${activa.nombre}» pasará a inactiva` : ''}.`}
          confirmar="Activar" onConfirmar={() => void activar()} onCancelar={() => setActivando(null)}
        />
      )}
      {eliminando && (
        <Confirmar titulo={`¿Eliminar «${eliminando.nombre}»?`} confirmar="Eliminar" onConfirmar={() => void eliminar()} onCancelar={() => setEliminando(null)}
          texto="Se borra la clave guardada, incluida su llave. No se puede deshacer." />
      )}
    </>
  )
}

function EnUsoFranja({ estado }: { estado: EstadoIA }) {
  const u = estado.en_uso
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border px-4 py-3 text-sm font-bold ${u ? 'border-ok-borde bg-ok-fondo text-ok' : 'border-aviso-borde bg-aviso-fondo text-aviso'}`}>
      {u ? (
        <>
          <span>En uso ahora:</span>
          <span><strong className="text-marino">{u.origen === 'panel' ? u.nombre : 'Llave del servidor (.env)'}</strong> · {u.proveedor_nombre} · {u.modelo}</span>
        </>
      ) : (
        <span>Sin IA activa: el chat funciona sin repreguntas (un mensaje y el caso pasa a revisión de Talento Humano).</span>
      )}
    </div>
  )
}

function TarjetaClave({ clave, alEditar, alActivar }: { clave: ClaveIA; alEditar: () => void; alActivar: () => void }) {
  const [probando, setProbando] = useState(false)
  const [prueba, setPrueba] = useState<{ ok: boolean; mensaje: string } | null>(null)

  async function probar() {
    setProbando(true)
    setPrueba(null)
    try {
      setPrueba(await api<{ ok: boolean; mensaje: string }>(`/ia/claves/${clave.id}/probar`, { method: 'POST', body: {} }))
    } catch (e) {
      setPrueba({ ok: false, mensaje: mensajeDe(e, 'No se pudo hacer la prueba') })
    }
    setProbando(false)
  }

  const titulo = `ia-clave-${clave.id}`
  return (
    <section aria-labelledby={titulo}
      className={`flex flex-col gap-3 rounded-[18px] border bg-white p-4 shadow-[0_2px_8px_rgba(27,42,110,.04)] sm:p-5 ${clave.activa ? 'border-marino ring-1 ring-marino/30' : 'border-borde-suave'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-stretch gap-2.5">
          <span aria-hidden="true" className={`w-1 flex-none rounded-full ${clave.activa ? 'bg-ambar' : 'bg-borde'}`} />
          <h2 id={titulo} className="break-words text-[17px] font-extrabold leading-snug text-marino">{clave.nombre}</h2>
        </div>
        <Chip tono={clave.activa ? 'ok' : 'neutro'}>{clave.activa ? 'Activa' : 'Inactiva'}</Chip>
      </div>
      <dl className="space-y-1 text-[13px] font-semibold text-texto-suave">
        <div className="flex gap-1.5"><dt className="sr-only">Proveedor</dt><dd className="font-extrabold text-marino">{clave.proveedor_nombre}</dd></div>
        <div className="flex gap-1.5"><dt>Modelo:</dt><dd>{clave.modelo ?? `recomendado (${clave.modelo_predeterminado})`}</dd></div>
        <div className="flex gap-1.5"><dt className="sr-only">Llave</dt><dd>Guardada · termina en …{clave.ultimos_4}</dd></div>
      </dl>
      {prueba && <Aviso tipo={prueba.ok ? 'ok' : 'error'}>{prueba.mensaje}</Aviso>}
      <div className="mt-auto flex flex-wrap gap-2.5 pt-1">
        {!clave.activa && <Boton type="button" className={botonChico} onClick={alActivar}>Activar</Boton>}
        <Boton type="button" variante="borde" className={botonChico} cargando={probando} onClick={() => void probar()}
          title="Hace una llamada mínima con el modelo y la llave guardados">Probar</Boton>
        <Boton type="button" variante="borde" className={botonChico} onClick={alEditar}>Editar</Boton>
      </div>
    </section>
  )
}

interface PropsFormulario {
  /** Sin `clave` es una nueva; con ella, se edita (el proveedor no cambia). */
  clave?: ClaveIA
  proveedores: ProveedorInfo[]
  hayActiva: boolean
  puedeGuardarLlaves: boolean
  alCerrar: () => void
  alGuardar: (mensaje: string) => void | Promise<void>
  alEliminar?: () => void
}

function FormularioClave({ clave, proveedores, hayActiva, puedeGuardarLlaves, alCerrar, alGuardar, alEliminar }: PropsFormulario) {
  const editar = !!clave
  const [proveedor, setProveedor] = useState<ProveedorIA>(clave?.proveedor ?? proveedores[0]?.id ?? 'gemini')
  const [nombre, setNombre] = useState(clave?.nombre ?? '')
  const [modelo, setModelo] = useState(clave?.modelo ?? '')
  const [llave, setLlave] = useState('')
  const [activar, setActivar] = useState(editar ? !!clave?.activa : !hayActiva)
  const [motivo, setMotivo] = useState('')
  const [intento, setIntento] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const info = proveedores.find((p) => p.id === proveedor)
  const eNombre = errorDeNombre(nombre)
  const eModelo = errorDeModelo(modelo)
  const eLlave = editar && !llave.trim() ? null : errorDeLlave(llave)
  const cambioNombre = editar && nombre.trim() !== clave?.nombre
  const cambioModelo = editar && (modelo.trim() || null) !== clave?.modelo
  const cambioLlave = editar && llave.trim() !== ''
  const cambioActiva = editar && activar && !clave?.activa
  const hayCambios = !editar || cambioNombre || cambioModelo || cambioLlave || cambioActiva
  const bloqueada = !puedeGuardarLlaves && (!editar || cambioLlave)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    setError(null)
    if (eNombre || eModelo || eLlave || !hayCambios || bloqueada) return
    setGuardando(true)
    try {
      const motivoLimpio = motivo.trim() || undefined
      if (editar && clave) {
        const cuerpo: Record<string, unknown> = {}
        if (cambioNombre) cuerpo.nombre = nombre.trim()
        if (cambioModelo) cuerpo.modelo = modelo.trim() || null
        if (cambioLlave) cuerpo.llave = llave.trim()
        if (cambioActiva) cuerpo.activa = true
        if (motivoLimpio) cuerpo.motivo = motivoLimpio
        await api(`/ia/claves/${clave.id}`, { method: 'PATCH', body: cuerpo })
        await alGuardar(`Clave «${nombre.trim()}» guardada.${clave.activa || cambioActiva ? ' Rige desde la próxima justificación.' : ''}`)
      } else {
        await api('/ia/claves', {
          method: 'POST',
          body: { proveedor, nombre: nombre.trim(), modelo: modelo.trim() || null, llave: llave.trim(), activar, ...(motivoLimpio ? { motivo: motivoLimpio } : {}) },
        })
        await alGuardar(`Clave «${nombre.trim()}» guardada${activar ? ' y activa. Rige desde la próxima justificación' : ''}.`)
      }
    } catch (err) {
      setError(mensajeDe(err, 'No se pudo guardar la clave'))
      setGuardando(false)
    }
  }

  const mostrar = (m: string | null) => (intento || undefined) && m
  return (
    <Modal titulo={editar ? `Editar «${clave?.nombre}»` : 'Agregar clave'} onCerrar={alCerrar}
      subtitulo={editar ? undefined : 'Una clave es el acceso que te da el proveedor de IA. La llave se guarda cifrada y no se vuelve a mostrar.'}>
      <form onSubmit={(e) => void enviar(e)} noValidate className="flex flex-col gap-4">
        {editar ? (
          <p className="text-sm font-semibold text-texto-suave">Proveedor: <strong className="text-marino">{clave?.proveedor_nombre}</strong> (no cambia después de crearla).</p>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Proveedor</legend>
            <div role="radiogroup" aria-label="Proveedor" className="grid gap-2.5 sm:grid-cols-3">
              {proveedores.map((p) => {
                const marcado = p.id === proveedor
                return (
                  <label key={p.id} className={`flex cursor-pointer items-center justify-center rounded-[14px] border p-3 text-center text-sm font-extrabold text-marino has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marino ${marcado ? 'border-marino bg-celeste' : 'border-borde bg-white hover:bg-lienzo'}`}>
                    <input type="radio" name="ia-proveedor" value={p.id} checked={marcado} onChange={() => setProveedor(p.id)} className="sr-only" />
                    {p.nombre}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-1.5">
          <Campo id="ia-nombre" etiqueta="Nombre *" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80}
            placeholder="Por ejemplo, Producción" autoComplete="off" aria-invalid={!!mostrar(eNombre)} aria-describedby="ia-nombre-ayuda" />
          {mostrar(eNombre) ? <p role="alert" className="text-[13px] font-bold text-error">{eNombre}</p> : (
            <p id="ia-nombre-ayuda" className="text-[13px] font-semibold text-texto-suave">Para reconocerla en la lista.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Campo id="ia-modelo" etiqueta="Modelo" value={modelo} onChange={(e) => setModelo(e.target.value)}
            placeholder={info?.modelo_predeterminado ?? ''} autoComplete="off" spellCheck={false}
            aria-invalid={!!mostrar(eModelo)} aria-describedby="ia-modelo-ayuda" />
          {mostrar(eModelo) && <p role="alert" className="text-[13px] font-bold text-error">{eModelo}</p>}
          <p id="ia-modelo-ayuda" className="text-[13px] font-semibold text-texto-suave">
            Vacío = el recomendado ({info?.modelo_predeterminado}). Si escribes otro, debe existir en {info?.nombre ?? clave?.proveedor_nombre}.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Campo id="ia-llave" etiqueta={editar ? 'Clave de API' : 'Clave de API *'} type="password" value={llave} onChange={(e) => setLlave(e.target.value)}
            autoComplete="off" spellCheck={false} placeholder={editar ? 'Pega otra para reemplazarla' : 'Pega aquí la llave del proveedor'}
            disabled={!puedeGuardarLlaves} aria-invalid={!!mostrar(eLlave)} aria-describedby="ia-llave-ayuda" />
          {mostrar(eLlave) && <p role="alert" className="text-[13px] font-bold text-error">{eLlave}</p>}
          <p id="ia-llave-ayuda" className="text-[13px] font-semibold text-texto-suave">
            {editar ? `Guardada · termina en …${clave?.ultimos_4}. Escribe otra para cambiarla; vacía, se conserva.` : 'Solo se escribe: nunca se vuelve a mostrar.'}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5 text-sm font-bold text-texto-suave">
            <button type="button" role="switch" aria-checked={activar} aria-labelledby="ia-activar-texto" disabled={editar && !!clave?.activa} onClick={() => setActivar((a) => !a)}
              className={`relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-marino disabled:opacity-60 ${activar ? 'bg-marino' : 'bg-borde'}`}>
              <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${activar ? 'translate-x-5' : ''}`} />
            </button>
            <span id="ia-activar-texto">{editar ? 'Activa' : 'Activar al guardar'}</span>
          </div>
          <p className="text-[13px] font-semibold text-texto-suave">
            {editar && clave?.activa ? 'Es la clave que responde ahora. Para desactivarla, activa otra.' : hayActiva ? 'Solo una clave puede estar activa: la que lo está pasará a inactiva.' : 'Todavía no hay ninguna activa.'}
          </p>
        </div>

        <Campo id="ia-motivo" etiqueta={editar ? 'Motivo del cambio (opcional)' : 'Motivo (opcional)'} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} autoComplete="off" />
        <p className="-mt-3 text-[13px] font-semibold text-texto-suave">Queda en la bitácora.</p>

        {!puedeGuardarLlaves && <Aviso tipo="aviso">El servidor no tiene la clave de cifrado (ROSTRO_CLAVE_AES): no puede guardar llaves.</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {editar && alEliminar && !clave?.activa && (
            <Boton type="button" variante="borde" className={botonChico} onClick={alEliminar}>Eliminar clave</Boton>
          )}
          <div className="ml-auto flex gap-3">
            <Boton type="button" variante="borde" className={botonChico} onClick={alCerrar}>Cancelar</Boton>
            <Boton type="submit" className={botonChico} cargando={guardando} disabled={bloqueada || (editar && !hayCambios)}>Guardar</Boton>
          </div>
        </div>
      </form>
    </Modal>
  )
}
