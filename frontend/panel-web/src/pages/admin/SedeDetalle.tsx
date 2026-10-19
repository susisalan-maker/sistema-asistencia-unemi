import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Confirmar } from '../../components/Confirmar'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Mapa, type CirculoMapa } from '../../components/Mapa'
import { Aviso, Chip } from '../../components/ui'
import { api } from '../../lib/api'
import { formatoCoordenada } from '../../lib/geo'
import { supabase } from '../../lib/supabase'
import FormularioBloque from './FormularioBloque'
import FormularioSede from './FormularioSede'
import type { Bloque, Sede } from './zonasTipos'

const COLUMNAS = 'grid grid-cols-[minmax(0,1.4fr)_minmax(0,1.4fr)_minmax(0,.7fr)_minmax(0,.8fr)_minmax(0,1.2fr)] gap-3'
const botonFila = 'rounded-lg border border-borde px-2.5 py-1.5 text-xs font-extrabold text-marino hover:bg-lienzo'

export default function SedeDetalle() {
  const { id = '' } = useParams()
  const [sede, setSede] = useState<Sede | null>(null)
  const [bloques, setBloques] = useState<Bloque[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [editandoSede, setEditandoSede] = useState(false)
  const [formBloque, setFormBloque] = useState<{ bloque?: Bloque } | null>(null)
  const [aDesactivar, setADesactivar] = useState<Bloque | null>(null)

  const cargar = useCallback(async () => {
    const [s, b] = await Promise.all([
      supabase.from('sedes').select('id, nombre, latitud, longitud, radio_metros, permite_fuera_geocerca, activa').eq('id', id).maybeSingle(),
      supabase.from('bloques').select('id, sede_id, nombre, latitud, longitud, radio_metros, activo').eq('sede_id', id).order('nombre'),
    ])
    if (s.error || b.error) setError('No se pudo cargar la sede')
    else {
      setError(null)
      setSede((s.data ?? null) as Sede | null)
      setBloques((b.data ?? []) as Bloque[])
    }
    setCargando(false)
  }, [id])

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

  const circulos = useMemo<CirculoMapa[]>(() => !sede ? [] : [
    { lat: sede.latitud, lon: sede.longitud, radio: sede.radio_metros, tono: 'sede' },
    ...bloques.map((b): CirculoMapa => ({ lat: b.latitud, lon: b.longitud, radio: b.radio_metros, tono: b.activo ? 'bloque' : 'inactivo' })),
  ], [sede, bloques])

  if (cargando) return <p role="status" className="p-7 text-sm font-semibold text-texto-suave">Cargando…</p>
  if (!sede) {
    return (
      <div className="space-y-3 p-7">
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!error && <Aviso tipo="aviso">No se encontró esta sede.</Aviso>}
        <Link to="/admin/sedes" className="text-sm font-extrabold text-marino hover:underline">← Volver a sedes</Link>
      </div>
    )
  }

  const activos = bloques.filter((b) => b.activo).length

  return (
    <>
      <EncabezadoPagina titulo={sede.nombre}
        detalle={`${sede.activa ? 'Sede activa' : 'Sede inactiva'} · radio ${sede.radio_metros} m · ${activos} de ${bloques.length} bloques activos`}>
        <Link to="/admin/sedes" className="rounded-[11px] border border-borde px-4 py-[11px] text-[13px] font-extrabold text-marino hover:bg-lienzo">← Sedes</Link>
        <button onClick={() => setEditandoSede(true)}
          className="rounded-[11px] border border-borde px-4 py-[11px] text-[13px] font-extrabold text-marino hover:bg-lienzo">Editar sede</button>
        <button onClick={() => setFormBloque({})} disabled={!sede.activa}
          className="rounded-[11px] bg-ambar px-4 py-[11px] text-[13px] font-extrabold text-ambar-tinta shadow-[0_4px_12px_rgba(245,166,35,.3)] disabled:opacity-40">
          Nuevo bloque
        </button>
      </EncabezadoPagina>

      <div className="space-y-4 p-7">
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {!sede.activa && <Aviso tipo="aviso">Esta sede está inactiva: no acepta marcaciones ni bloques nuevos.</Aviso>}
        {sede.activa && activos === 0 && (
          <Aviso tipo="aviso">Esta sede no tiene bloques activos: la marcación se valida contra el círculo completo de la sede.</Aviso>
        )}

        <Mapa alto={340} contexto={circulos} ajustarA={circulos} />
        <p className="text-xs font-semibold text-texto-suave">
          Azul oscuro: sede · azul: bloques activos · gris punteado: bloques inactivos. El sistema solo conoce un punto y un radio por zona,
          no la forma del edificio: es una zona aproximada, y el GPS puede errar entre 5 y 20 m (más dentro de edificios).
        </p>

        <div className="overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Bloque</div><div>Ubicación</div><div>Radio</div><div>Estado</div><div>Acciones</div>
          </div>
          {bloques.length === 0 && <p className="p-6 text-sm font-semibold text-texto-suave">Esta sede aún no tiene bloques.</p>}
          {bloques.map((b) => (
            <div key={b.id} className={`${COLUMNAS} items-center border-b border-lienzo px-5 py-3.5 text-sm font-semibold text-texto`}>
              <div className="truncate font-extrabold text-marino">{b.nombre}</div>
              <div className="truncate text-[13px]">{formatoCoordenada(b.latitud)}, {formatoCoordenada(b.longitud)}</div>
              <div>{b.radio_metros} m</div>
              <div><Chip tono={b.activo ? 'ok' : 'neutro'}>{b.activo ? 'Activo' : 'Inactivo'}</Chip></div>
              <div className="flex flex-wrap gap-1.5">
                <button aria-label={`Editar ${b.nombre}`} onClick={() => setFormBloque({ bloque: b })} className={botonFila}>Editar</button>
                <button aria-label={`${b.activo ? 'Desactivar' : 'Activar'} ${b.nombre}`}
                  onClick={() => (b.activo ? setADesactivar(b) : accion(`/bloques/${b.id}/activar`))} className={botonFila}>
                  {b.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editandoSede && (
        <FormularioSede sede={sede} onCerrar={() => setEditandoSede(false)}
          onGuardado={(m) => { setEditandoSede(false); setMensaje(m); setError(null); void cargar() }} />
      )}
      {formBloque && (
        <FormularioBloque sede={sede} bloque={formBloque.bloque} otros={bloques.filter((b) => b.id !== formBloque.bloque?.id)}
          onCerrar={() => setFormBloque(null)}
          onGuardado={(m) => { setFormBloque(null); setMensaje(m); setError(null); void cargar() }} />
      )}
      {aDesactivar && (
        <Confirmar titulo="Desactivar bloque" confirmar="Desactivar"
          texto={`«${aDesactivar.nombre}» dejará de usarse para validar marcaciones nuevas. Si era el último bloque activo, la sede se validará por su círculo completo. Las marcaciones anteriores se conservan.`}
          onCancelar={() => setADesactivar(null)}
          onConfirmar={() => { const bid = aDesactivar.id; setADesactivar(null); void accion(`/bloques/${bid}/desactivar`) }} />
      )}
    </>
  )
}
