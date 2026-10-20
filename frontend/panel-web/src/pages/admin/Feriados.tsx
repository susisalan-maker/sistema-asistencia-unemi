import { useCallback, useEffect, useState } from 'react'
import { Confirmar } from '../../components/Confirmar'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso, Chip } from '../../components/ui'
import { api } from '../../lib/api'
import { diasDelFeriado, fechaLarga } from '../../lib/horario'
import { supabase } from '../../lib/supabase'
import FormularioFeriado from './FormularioFeriado'
import type { Feriado } from './feriadosTipos'

const COLUMNAS = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,.7fr)_minmax(0,1.3fr)] gap-3'
const botonFila = 'rounded-lg border border-borde px-2.5 py-1.5 text-xs font-extrabold text-marino hover:bg-lienzo'

export default function Feriados() {
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<{ feriado?: Feriado } | null>(null)
  const [aDesactivar, setADesactivar] = useState<Feriado | null>(null)

  const cargar = useCallback(async () => {
    const r = await supabase.from('feriados').select('id, fecha_inicio, fecha_fin, nombre, activo').order('fecha_inicio', { ascending: false })
    if (r.error) setError('No se pudo cargar la lista de feriados')
    else {
      setError(null)
      setFeriados((r.data ?? []) as Feriado[])
    }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  async function accion(ruta: string) {
    setMensaje(null)
    setError(null)
    try {
      const r = await api<{ mensaje: string }>(ruta, { method: 'POST' })
      setMensaje(r.mensaje)
      await cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'La acción falló')
    }
  }

  const activos = feriados.filter((f) => f.activo).length

  return (
    <>
      <EncabezadoPagina titulo="Feriados" detalle={`${feriados.length} registrados · ${activos} activos`}>
        <button onClick={() => setFormulario({})}
          className="rounded-[11px] bg-ambar px-4 py-[11px] text-[13px] font-extrabold text-ambar-tinta shadow-[0_4px_12px_rgba(245,166,35,.3)]">
          Nuevo feriado
        </button>
      </EncabezadoPagina>

      <div className="space-y-3 p-7">
        <p className="text-sm font-semibold text-texto-suave">
          Marcar asistencia en un feriado activo genera una anomalía de «día no laborable». Los días de la semana que
          trabaja cada persona se definen en Usuarios → editar horario.
        </p>
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Fecha</div><div>Nombre</div><div>Estado</div><div>Acciones</div>
          </div>
          {cargando && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
          {!cargando && feriados.length === 0 && !error && (
            <p className="p-6 text-sm font-semibold text-texto-suave">Todavía no hay feriados. Crea el primero con «Nuevo feriado».</p>
          )}
          {feriados.map((f) => (
            <div key={f.id} className={`${COLUMNAS} items-center border-b border-lienzo px-5 py-3.5 text-sm font-semibold text-texto`}>
              <div>
                <div className="font-extrabold capitalize text-marino">{fechaLarga(f.fecha_inicio)}</div>
                {f.fecha_fin !== f.fecha_inicio && (
                  <div className="text-xs font-semibold text-etiqueta">
                    hasta el {fechaLarga(f.fecha_fin)} · {diasDelFeriado(f.fecha_inicio, f.fecha_fin)} días
                  </div>
                )}
              </div>
              <div className="truncate">{f.nombre}</div>
              <div><Chip tono={f.activo ? 'ok' : 'neutro'}>{f.activo ? 'Activo' : 'Inactivo'}</Chip></div>
              <div className="flex gap-1.5">
                <button className={botonFila} aria-label={`Editar ${f.nombre}`} onClick={() => setFormulario({ feriado: f })}>Editar</button>
                {f.activo
                  ? <button className={botonFila} aria-label={`Desactivar ${f.nombre}`} onClick={() => setADesactivar(f)}>Desactivar</button>
                  : <button className={botonFila} aria-label={`Activar ${f.nombre}`} onClick={() => void accion(`/feriados/${f.id}/activar`)}>Activar</button>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {formulario && (
        <FormularioFeriado feriado={formulario.feriado} onCerrar={() => setFormulario(null)}
          onGuardado={(m) => { setFormulario(null); setMensaje(m); void cargar() }} />
      )}
      {aDesactivar && (
        <Confirmar titulo="Desactivar feriado" confirmar="Desactivar" onCancelar={() => setADesactivar(null)}
          texto={`«${aDesactivar.nombre}» dejará de contar como día no laborable. Se conserva en el historial.`}
          onConfirmar={() => { const id = aDesactivar.id; setADesactivar(null); void accion(`/feriados/${id}/desactivar`) }} />
      )}
    </>
  )
}
