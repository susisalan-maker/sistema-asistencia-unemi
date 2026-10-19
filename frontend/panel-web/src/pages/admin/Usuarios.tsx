import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton, Chip } from '../../components/ui'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { iniciales, nombreCompleto } from '../../lib/texto'
import NuevoUsuario from './NuevoUsuario'
import { filtrarUsuarios, type FilaUsuario, type SedeOpcion } from './usuariosTipos'

const COLUMNAS = 'grid grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,.8fr)_minmax(0,.9fr)_96px] gap-3'
const selectorFiltro = 'rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-bold text-marino'

export default function Usuarios() {
  const { perfil } = useAuth()
  const [filas, setFilas] = useState<(FilaUsuario & { sede_id: string | null })[]>([])
  const [sedes, setSedes] = useState<SedeOpcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [sede, setSede] = useState('')
  const [rol, setRol] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [aCambiar, setACambiar] = useState<FilaUsuario | null>(null)

  const cargar = useCallback(async () => {
    const [u, s] = await Promise.all([
      supabase.from('usuarios')
        .select('id, nombres, apellidos, email, rol, activo, dispositivo_id, fecha_registro_rostro, sede_id, sedes!usuarios_sede_id_fkey(nombre)')
        .order('apellidos').order('nombres'),
      supabase.from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
    ])
    if (u.error || s.error) setError('No se pudo cargar la lista de usuarios')
    else {
      setError(null)
      setFilas((u.data ?? []) as unknown as (FilaUsuario & { sede_id: string | null })[])
      setSedes((s.data ?? []) as SedeOpcion[])
    }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const visibles = useMemo(
    () => filtrarUsuarios(filas, { texto, sede, rol }, (f) => (f as FilaUsuario & { sede_id: string | null }).sede_id),
    [filas, texto, sede, rol],
  )
  const activos = filas.filter((f) => f.activo).length

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

  return (
    <>
      <EncabezadoPagina titulo="Usuarios" detalle={`${filas.length} registros · ${activos} activos · ${filas.length - activos} inactivos`}>
        <input aria-label="Buscar" placeholder="Buscar nombre, apellido o email…" value={texto} onChange={(e) => setTexto(e.target.value)}
          className="w-[220px] rounded-[11px] border border-borde px-3.5 py-2.5 text-[13px] font-bold text-marino outline-none placeholder:text-placeholder focus:border-marino" />
        <select aria-label="Sede" value={sede} onChange={(e) => setSede(e.target.value)} className={selectorFiltro}>
          <option value="">Sede: todas</option>
          {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <select aria-label="Rol" value={rol} onChange={(e) => setRol(e.target.value)} className={selectorFiltro}>
          <option value="">Rol: todos</option>
          <option value="usuario">Usuario</option>
          <option value="administrador">Administrador</option>
        </select>
        <button onClick={() => setNuevo(true)}
          className="rounded-[11px] bg-ambar px-4 py-[11px] text-[13px] font-extrabold text-ambar-tinta shadow-[0_4px_12px_rgba(245,166,35,.3)]">
          Nuevo usuario
        </button>
      </EncabezadoPagina>

      <div className="space-y-3 p-7">
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Usuario</div><div>Rol</div><div>Sede asignada</div><div>Estado</div><div>Dispositivo</div><div>Acciones</div>
          </div>
          {cargando && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
          {!cargando && visibles.length === 0 && <p className="p-6 text-sm font-semibold text-texto-suave">No hay usuarios que coincidan.</p>}
          {visibles.map((f) => (
            <div key={f.id} className={`${COLUMNAS} items-center border-b border-lienzo px-5 py-3.5 text-sm font-semibold text-texto`}>
              <div className="flex min-w-0 items-center gap-[11px]">
                <div className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">{iniciales(f.nombres, f.apellidos)}</div>
                <div className="min-w-0">
                  <div className="truncate font-extrabold text-marino">{nombreCompleto(f)}</div>
                  <div className="truncate text-xs font-semibold text-etiqueta">{f.email}</div>
                </div>
              </div>
              <div className="font-bold text-marino">{f.rol === 'administrador' ? 'Administrador' : 'Usuario'}</div>
              <div>{f.rol === 'administrador' ? 'Todas las sedes' : (f.sedes?.nombre ?? '—')}</div>
              <div><Chip tono={f.activo ? 'ok' : 'neutro'}>{f.activo ? 'Activo' : 'Inactivo'}</Chip></div>
              <div><Chip tono={f.dispositivo_id ? 'ok' : 'aviso'}>{f.dispositivo_id ? 'Vinculado' : 'Sin vincular'}</Chip></div>
              <div className="flex gap-1.5">
                <button title="Reenviar invitación" aria-label={`Reenviar invitación a ${nombreCompleto(f)}`}
                  onClick={() => accion(`/usuarios/${f.id}/reenviar-invitacion`)}
                  className="grid size-8 place-items-center rounded-lg border border-borde text-marino hover:bg-lienzo">✉</button>
                <button title={f.activo ? 'Desactivar' : 'Activar'} aria-label={`${f.activo ? 'Desactivar' : 'Activar'} a ${nombreCompleto(f)}`}
                  disabled={f.id === perfil?.id}
                  onClick={() => (f.activo ? setACambiar(f) : accion(`/usuarios/${f.id}/activar`))}
                  className="grid size-8 place-items-center rounded-lg border border-borde text-marino hover:bg-lienzo disabled:opacity-30">⏻</button>
              </div>
            </div>
          ))}
          <p className="px-5 py-3 text-xs font-semibold text-etiqueta">Mostrando {visibles.length} de {filas.length}</p>
        </div>
      </div>

      {nuevo && (
        <NuevoUsuario sedes={sedes} onCerrar={() => setNuevo(false)}
          onCreado={() => { setNuevo(false); setMensaje('Invitación enviada: la persona recibirá un correo para crear su contraseña'); void cargar() }} />
      )}
      {aCambiar && (
        <Modal titulo="Desactivar usuario" onCerrar={() => setACambiar(null)}
          subtitulo={`${nombreCompleto(aCambiar)} dejará de poder iniciar sesión y su rostro registrado se eliminará. Su historial se conserva.`}>
          <div className="grid grid-cols-2 gap-3">
            <Boton variante="borde" onClick={() => setACambiar(null)}>Cancelar</Boton>
            <Boton variante="marino" onClick={() => { const id = aCambiar.id; setACambiar(null); void accion(`/usuarios/${id}/desactivar`) }}>Desactivar</Boton>
          </div>
        </Modal>
      )}
    </>
  )
}
