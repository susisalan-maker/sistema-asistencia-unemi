import { useCallback, useEffect, useState } from 'react'
import { Confirmar } from '../../components/Confirmar'
import { Aviso, Boton, Chip } from '../../components/ui'
import { supabase } from '../../lib/supabase'
import { nombreCompleto } from '../../lib/texto'
import {
  CLAVES, GRUPOS, cambiosDe, erroresDe, horasATexto, aEntero, valoresDeFabrica,
  type ClaveConfig, type FilaConfig, type Parametro, type ValoresConfig,
} from './configuracionTipos'
import { fechaHora } from './anomaliasTipos'

const COLUMNAS = `${CLAVES.join(', ')}, updated_at, updated_by`
type Textos = Record<ClaveConfig, string>

const comoTextos = (v: ValoresConfig): Textos => Object.fromEntries(CLAVES.map((c) => [c, String(v[c])])) as Textos

export default function Parametros({ onCambios }: { onCambios?: (hay: boolean) => void }) {
  const [guardado, setGuardado] = useState<FilaConfig | null>(null)
  const [textos, setTextos] = useState<Textos | null>(null)
  const [editor, setEditor] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [intento, setIntento] = useState(false)           // se muestran los errores de cada campo solo tras intentar guardar
  const [confirmando, setConfirmando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const cargarEditor = useCallback(async (id: string | null) => {
    if (!id) return setEditor(null)
    const r = await supabase.from('usuarios').select('nombres, apellidos').eq('id', id).maybeSingle()
    setEditor(r.data ? nombreCompleto(r.data as { nombres: string; apellidos: string }) : null)
  }, [])

  const cargar = useCallback(async () => {
    const r = await supabase.from('configuracion').select(COLUMNAS).eq('id', 1).maybeSingle()
    if (r.error || !r.data) {
      setError('No se pudo cargar la configuración')
    } else {
      const fila = r.data as unknown as FilaConfig
      setError(null)
      setGuardado(fila)
      setTextos(comoTextos(fila))
      void cargarEditor(fila.updated_by)
    }
    setCargando(false)
  }, [cargarEditor])

  useEffect(() => { void cargar() }, [cargar])

  const errores = textos ? erroresDe(textos) : {}
  const cambios = guardado && textos ? cambiosDe(guardado, textos) : []
  const hayCambios = cambios.length > 0

  useEffect(() => { onCambios?.(hayCambios) }, [hayCambios, onCambios])

  function escribir(clave: ClaveConfig, valor: string) {
    setMensaje(null)
    setTextos((t) => (t ? { ...t, [clave]: valor } : t))
  }

  function pedirGuardar() {
    setMensaje(null)
    setIntento(true)
    if (Object.keys(errores).length > 0) return setError('Revisa los valores marcados en rojo')
    setError(null)
    if (hayCambios) setConfirmando(true)
  }

  async function guardar() {
    if (!textos) return
    setConfirmando(false)
    setGuardando(true)
    const nuevos: Partial<ValoresConfig> = {}
    for (const c of cambios) nuevos[c.clave] = c.despues
    const r = await supabase.from('configuracion').update(nuevos).eq('id', 1).select(COLUMNAS).maybeSingle()
    setGuardando(false)
    if (r.error || !r.data) {
      setError('No se pudo guardar. Revisa tu conexión y que tu cuenta siga siendo de administrador.')
      return
    }
    const fila = r.data as unknown as FilaConfig
    setError(null)
    setIntento(false)
    setGuardado(fila)
    setTextos(comoTextos(fila))
    void cargarEditor(fila.updated_by)
    setMensaje('Configuración guardada. Se aplica desde la próxima marcación.')
  }

  if (cargando) return <p className="p-4 text-sm sm:p-7 font-semibold text-texto-suave">Cargando…</p>

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-5 sm:px-7 sm:pt-6">
        <p className="text-sm font-semibold text-texto-suave">Reglas que el sistema usa al marcar y al justificar · valen para todas las sedes</p>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:ml-auto sm:w-auto">
          <Boton type="button" variante="borde" className="!w-auto !px-4 !py-2.5 !text-[13px]" disabled={!textos || guardando}
            onClick={() => { setMensaje(null); setTextos(comoTextos(valoresDeFabrica())) }}
            title="Pone los valores de fábrica en los campos; se aplican al guardar">
            Restablecer
          </Boton>
          <Boton type="button" className="!w-auto !px-4 !py-2.5 !text-[13px]" cargando={guardando} disabled={!hayCambios} onClick={pedirGuardar}>
            Guardar cambios
          </Boton>
        </div>
      </div>

      <div className="space-y-4 px-4 pb-7 pt-4 sm:px-7">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}

        {textos && guardado && (
          <div className="grid gap-4 xl:grid-cols-2">
            {GRUPOS.map((g) => (
              <section key={g.id} aria-labelledby={`grupo-${g.id}`}
                className="flex flex-col gap-5 rounded-[18px] border border-borde-suave bg-white p-4 shadow-[0_2px_8px_rgba(27,42,110,.04)] sm:p-6">
                <div className="flex items-stretch gap-2.5">
                  <span aria-hidden="true" className="w-1 flex-none rounded-full bg-ambar" />
                  <div>
                    <h2 id={`grupo-${g.id}`} className="text-[17px] font-extrabold leading-snug text-marino">{g.titulo}</h2>
                    <p className="text-[13px] font-semibold text-texto-suave">{g.detalle}</p>
                  </div>
                </div>
                {g.parametros.map((p) => (
                  <Campo key={p.clave} p={p} texto={textos[p.clave]} guardado={guardado[p.clave]}
                    error={intento ? errores[p.clave] : undefined} onCambio={(v) => escribir(p.clave, v)} />
                ))}
              </section>
            ))}
          </div>
        )}

        {guardado && (
          <p className="px-1 text-xs font-semibold text-etiqueta">
            {guardado.updated_at
              ? `Última modificación: ${fechaHora(guardado.updated_at)}${editor ? ` · ${editor}` : ''}`
              : 'Todavía no se ha modificado: son los valores de fábrica.'}
            {' · '}Cada cambio queda en la bitácora. Los ajustes de la IA y del rostro se configuran en el servidor.
          </p>
        )}
      </div>

      {confirmando && (
        <Confirmar
          titulo="¿Guardar los cambios?"
          texto={cambios.map((c) => `${c.titulo}: ${c.antes} → ${c.despues} ${c.unidad}`).join(' · ') + '. Se aplican a todas las sedes desde la próxima marcación.'}
          confirmar="Guardar" onConfirmar={() => void guardar()} onCancelar={() => setConfirmando(false)}
        />
      )}
    </>
  )
}

function Campo({ p, texto, guardado, error, onCambio }: {
  p: Parametro; texto: string; guardado: number; error?: string; onCambio: (v: string) => void
}) {
  const id = `config-${p.clave}`
  const n = aEntero(texto)
  const cambio = n !== null && n !== guardado
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-sm font-extrabold text-marino">{p.titulo}</label>
        {cambio && <Chip tono="aviso">Sin guardar</Chip>}
      </div>
      <div className="flex items-center gap-3">
        <div className={`flex h-[52px] w-full max-w-[210px] items-center rounded-[13px] border bg-lienzo px-4 focus-within:border-marino focus-within:ring-2 focus-within:ring-celeste ${error ? 'border-error' : 'border-borde'}`}>
          <input id={id} inputMode="numeric" autoComplete="off" value={texto} onChange={(e) => onCambio(e.target.value)}
            aria-invalid={!!error} aria-describedby={`${id}-ayuda`}
            className="w-full min-w-0 bg-transparent text-[17px] font-extrabold text-marino outline-none" />
          <span className="flex-none pl-2 text-[13px] font-bold text-etiqueta">{p.unidad}</span>
        </div>
        {p.enHoras && n !== null && <span className="text-[13px] font-bold text-texto-suave">≈ {horasATexto(n)}</span>}
      </div>
      {error && <p role="alert" className="text-[13px] font-bold text-error">{error}</p>}
      <p id={`${id}-ayuda`} className="text-[13px] font-semibold leading-relaxed text-texto-suave">
        {p.ayuda} <span className="text-etiqueta">Entre {p.min} y {p.max} · de fábrica: {p.defecto}.</span>
      </p>
    </div>
  )
}
