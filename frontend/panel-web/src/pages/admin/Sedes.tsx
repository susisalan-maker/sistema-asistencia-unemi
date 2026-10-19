import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Confirmar } from '../../components/Confirmar'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso, Chip } from '../../components/ui'
import { api } from '../../lib/api'
import { formatoCoordenada } from '../../lib/geo'
import { supabase } from '../../lib/supabase'
import FormularioSede from './FormularioSede'
import type { Sede } from './zonasTipos'

const COLUMNAS = 'grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_minmax(0,.7fr)_minmax(0,.9fr)_minmax(0,.8fr)_minmax(0,1.5fr)] gap-3'
const botonFila = 'rounded-lg border border-borde px-2.5 py-1.5 text-xs font-extrabold text-marino hover:bg-lienzo'

export default function Sedes() {
  const [sedes, setSedes] = useState<Sede[]>([])
  const [bloquesPorSede, setBloquesPorSede] = useState<Record<string, { activos: number; total: number }>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [formulario, setFormulario] = useState<{ sede?: Sede } | null>(null)
  const [aDesactivar, setADesactivar] = useState<Sede | null>(null)

  const cargar = useCallback(async () => {
    const [s, b] = await Promise.all([
      supabase.from('sedes').select('id, nombre, latitud, longitud, radio_metros, permite_fuera_geocerca, activa').order('nombre'),
      supabase.from('bloques').select('sede_id, activo'),
    ])
    if (s.error || b.error) setError('No se pudo cargar la lista de sedes')
    else {
      setError(null)
      setSedes((s.data ?? []) as Sede[])
      const conteo: Record<string, { activos: number; total: number }> = {}
      for (const f of (b.data ?? []) as { sede_id: string; activo: boolean }[]) {
        const c = (conteo[f.sede_id] ??= { activos: 0, total: 0 })
        c.total += 1
        if (f.activo) c.activos += 1
      }
      setBloquesPorSede(conteo)
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

  const activas = sedes.filter((s) => s.activa).length

  return (
    <>
      <EncabezadoPagina titulo="Sedes y bloques" detalle={`${sedes.length} sedes · ${activas} activas · ${sedes.length - activas} inactivas`}>
        <button onClick={() => setFormulario({})}
          className="rounded-[11px] bg-ambar px-4 py-[11px] text-[13px] font-extrabold text-ambar-tinta shadow-[0_4px_12px_rgba(245,166,35,.3)]">
          Nueva sede
        </button>
      </EncabezadoPagina>

      <div className="space-y-3 p-7">
        <p className="text-[13px] font-semibold text-texto-suave">
          Las sedes y sus bloques definen dónde se puede marcar asistencia. Los cambios se aplican de inmediato a todos los usuarios de la sede.
        </p>
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Sede</div><div>Ubicación</div><div>Radio</div><div>Bloques activos</div><div>Estado</div><div>Acciones</div>
          </div>
          {cargando && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
          {!cargando && sedes.length === 0 && (
            <p className="p-6 text-sm font-semibold text-texto-suave">Todavía no hay sedes. Crea la primera con «Nueva sede».</p>
          )}
          {sedes.map((s) => {
            const c = bloquesPorSede[s.id] ?? { activos: 0, total: 0 }
            return (
              <div key={s.id} className={`${COLUMNAS} items-center border-b border-lienzo px-5 py-3.5 text-sm font-semibold text-texto`}>
                <div className="min-w-0">
                  <Link to={`/admin/sedes/${s.id}`} className="block truncate font-extrabold text-marino hover:underline">{s.nombre}</Link>
                  {s.permite_fuera_geocerca && <span className="text-xs font-semibold text-etiqueta">Permite marcar fuera de la zona</span>}
                </div>
                <div className="truncate text-[13px]">{formatoCoordenada(s.latitud)}, {formatoCoordenada(s.longitud)}</div>
                <div>{s.radio_metros} m</div>
                <div>{c.activos} de {c.total}</div>
                <div><Chip tono={s.activa ? 'ok' : 'neutro'}>{s.activa ? 'Activa' : 'Inactiva'}</Chip></div>
                <div className="flex flex-wrap gap-1.5">
                  <Link to={`/admin/sedes/${s.id}`} aria-label={`Ver bloques de ${s.nombre}`} className={botonFila}>Bloques</Link>
                  <button aria-label={`Editar ${s.nombre}`} onClick={() => setFormulario({ sede: s })} className={botonFila}>Editar</button>
                  <button aria-label={`${s.activa ? 'Desactivar' : 'Activar'} ${s.nombre}`}
                    onClick={() => (s.activa ? setADesactivar(s) : accion(`/sedes/${s.id}/activar`))} className={botonFila}>
                    {s.activa ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {formulario && (
        <FormularioSede sede={formulario.sede} onCerrar={() => setFormulario(null)}
          onGuardado={(m) => { setFormulario(null); setMensaje(m); setError(null); void cargar() }} />
      )}
      {aDesactivar && (
        <Confirmar titulo="Desactivar sede" confirmar="Desactivar"
          texto={`«${aDesactivar.nombre}» dejará de aceptar marcaciones nuevas. Su historial se conserva. Solo se puede si no tiene usuarios activos asignados.`}
          onCancelar={() => setADesactivar(null)}
          onConfirmar={() => { const id = aDesactivar.id; setADesactivar(null); void accion(`/sedes/${id}/desactivar`) }} />
      )}
    </>
  )
}
