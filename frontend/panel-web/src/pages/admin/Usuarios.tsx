import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { Aviso, Boton, Chip } from '../../components/ui'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Confirmar } from '../../components/Confirmar'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { resumenHorario } from '../../lib/horario'
import { iniciales, nombreCompleto } from '../../lib/texto'
import EditarUsuario from './EditarUsuario'
import NuevoUsuario from './NuevoUsuario'
import { filtrarUsuarios, type FilaUsuario, type SedeOpcion } from './usuariosTipos'

const COLUMNAS = '@4xl:grid @4xl:grid-cols-[minmax(0,1.6fr)_minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,.7fr)_minmax(0,.8fr)_168px] @4xl:gap-3'
const botonIcono = 'grid size-8 place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino hover:brightness-95 disabled:opacity-35'
const selectorFiltro = 'rounded-[11px] border border-borde bg-white px-3.5 py-2.5 text-[13px] font-bold text-marino sm:max-w-[190px]'

export default function Usuarios() {
  const { perfil } = useAuth()
  const [filas, setFilas] = useState<FilaUsuario[]>([])
  const [sedes, setSedes] = useState<SedeOpcion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [sede, setSede] = useState('')
  const [rol, setRol] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const [aCambiar, setACambiar] = useState<FilaUsuario | null>(null)
  const [aEditar, setAEditar] = useState<FilaUsuario | null>(null)
  const [aReiniciar, setAReiniciar] = useState<FilaUsuario | null>(null)

  const cargar = useCallback(async () => {
    const [u, s] = await Promise.all([
      supabase.from('usuarios')
        .select('id, nombres, apellidos, email, rol, activo, dispositivo_id, fecha_registro_rostro, jornada_inicio, jornada_fin, dias_laborables, sede_id, sedes!usuarios_sede_id_fkey(nombre)')
        .order('apellidos').order('nombres'),
      supabase.from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
    ])
    if (u.error || s.error) setError('No se pudo cargar la lista de usuarios')
    else {
      setError(null)
      setFilas((u.data ?? []) as unknown as FilaUsuario[])
      setSedes((s.data ?? []) as SedeOpcion[])
    }
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const visibles = useMemo(
    () => filtrarUsuarios(filas, { texto, sede, rol }, (f) => f.sede_id),
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
          className="w-full rounded-[11px] max-sm:!basis-full sm:w-[190px] lg:w-[220px] border border-borde px-3.5 py-2.5 text-[13px] font-bold text-marino outline-none placeholder:text-placeholder focus:border-marino" />
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

      <div className="space-y-3 p-4 sm:p-7">
        {mensaje && <Aviso tipo="ok">{mensaje}</Aviso>}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="@container tabla-ancha overflow-hidden rounded-[18px] border border-borde-suave bg-white">
          <div className={`${COLUMNAS} tabla-cabecera border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
            <div>Usuario</div><div>Rol</div><div>Sede asignada</div><div>Horario</div><div>Estado</div><div>Dispositivo</div><div>Acciones</div>
          </div>
          {cargando && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
          {!cargando && visibles.length === 0 && <p className="p-6 text-sm font-semibold text-texto-suave">No hay usuarios que coincidan.</p>}
          {visibles.map((f) => (
            <div key={f.id} className={`${COLUMNAS} items-center border-b border-lienzo px-4 py-4 @max-4xl:grid @max-4xl:grid-cols-[auto_minmax(0,1fr)_auto] @max-4xl:gap-x-3 @max-4xl:gap-y-2.5 @4xl:px-5 @4xl:py-3.5 text-sm font-semibold text-texto`}>
              <div className={`flex min-w-0 items-center gap-[11px] @max-4xl:order-1 @max-4xl:col-span-2 ${f.activo ? '' : 'opacity-50'}`}>
                <div className="grid size-9 flex-none place-items-center rounded-full bg-celeste text-[13px] font-extrabold text-marino">{iniciales(f.nombres, f.apellidos)}</div>
                <div className="min-w-0">
                  <div className="break-words font-extrabold text-marino @4xl:truncate">{nombreCompleto(f)}</div>
                  <div className="break-all text-xs font-semibold text-etiqueta @4xl:truncate">{f.email}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-2 text-[13px] @max-4xl:order-3 @max-4xl:col-span-3 @max-4xl:[&>*:not(:last-child)]:after:ml-2 @max-4xl:[&>*:not(:last-child)]:after:content-['·'] @4xl:contents">
              <div className={`font-bold text-marino ${f.activo ? '' : 'opacity-50'}`}>{f.rol === 'administrador' ? 'Administrador' : 'Usuario'}</div>
              <div className={f.activo ? '' : 'opacity-50'}>{f.rol === 'administrador' ? 'Todas las sedes' : (f.sedes?.nombre ?? '—')}</div>
              <div className={`@4xl:text-[13px] ${f.activo ? '' : 'opacity-50'}`}>{f.rol === 'administrador' ? '—' : resumenHorario(f.jornada_inicio, f.jornada_fin, f.dias_laborables)}</div>
              </div>
              <div className="@max-4xl:order-2 @max-4xl:justify-self-end"><Chip tono={f.activo ? 'ok' : 'neutro'}>{f.activo ? 'Activo' : 'Inactivo'}</Chip></div>
              <div className="@max-4xl:order-4"><Chip tono={f.dispositivo_id ? 'ok' : 'aviso'}>{f.dispositivo_id ? 'Vinculado' : 'Sin vincular'}</Chip></div>
              <div className="flex gap-1.5 @max-4xl:order-5 @max-4xl:col-span-2 @max-4xl:justify-self-end">
                {(f.rol === 'usuario' || f.id !== perfil?.id) && (
                  <button title="Editar usuario" aria-label={`Editar a ${nombreCompleto(f)}`} disabled={!f.activo} onClick={() => setAEditar(f)}
                    className={botonIcono}>✎</button>
                )}
                <button title="Reiniciar celular vinculado" aria-label={`Reiniciar celular de ${nombreCompleto(f)}`}
                  disabled={!f.activo || !f.dispositivo_id} onClick={() => setAReiniciar(f)}
                  className={botonIcono}>⟳</button>
                <button title={f.activo ? 'Desactivar' : 'Activar'} aria-label={`${f.activo ? 'Desactivar' : 'Activar'} a ${nombreCompleto(f)}`}
                  disabled={f.id === perfil?.id}
                  onClick={() => (f.activo ? setACambiar(f) : accion(`/usuarios/${f.id}/activar`))}
                  className={`${botonIcono} ${f.activo ? '' : '!bg-ok-fondo !text-ok'}`}>⏻</button>
                <button title="Reenviar invitación" aria-label={`Reenviar invitación a ${nombreCompleto(f)}`}
                  disabled={!f.activo}
                  onClick={() => accion(`/usuarios/${f.id}/reenviar-invitacion`)}
                  className={botonIcono}>✉</button>
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
      {aEditar && (
        <EditarUsuario usuario={aEditar} sedes={sedes} onCerrar={() => setAEditar(null)}
          onGuardado={(m) => { setAEditar(null); setMensaje(m); void cargar() }} />
      )}
      {aReiniciar && (
        <Confirmar titulo="Reiniciar vinculación" confirmar="Sí, reiniciar" onCancelar={() => setAReiniciar(null)}
          texto={`${nombreCompleto(aReiniciar)} dejará de poder marcar desde su celular actual y podrá vincular otro al abrir la app.`}
          onConfirmar={() => { const id = aReiniciar.id; setAReiniciar(null); void accion(`/usuarios/${id}/reiniciar-dispositivo`) }} />
      )}
      {aCambiar && (
        <Modal titulo="Desactivar usuario" onCerrar={() => setACambiar(null)}
          subtitulo={`${nombreCompleto(aCambiar)} dejará de poder iniciar sesión y su rostro registrado se eliminará. Su historial se conserva.`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Boton variante="borde" onClick={() => setACambiar(null)}>Cancelar</Boton>
            <Boton variante="marino" onClick={() => { const id = aCambiar.id; setACambiar(null); void accion(`/usuarios/${id}/desactivar`) }}>Desactivar</Boton>
          </div>
        </Modal>
      )}
    </>
  )
}
