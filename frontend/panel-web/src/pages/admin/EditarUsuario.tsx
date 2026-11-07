import { useState, type FormEvent } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { CamposHorario, type ValorHorario } from '../../components/CamposHorario'
import { Modal } from '../../components/Modal'
import { Aviso, Boton, Campo, Chip } from '../../components/ui'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { horaCorta, validarHorario } from '../../lib/horario'
import { nombreCompleto } from '../../lib/texto'
import type { FilaUsuario, SedeOpcion } from './usuariosTipos'

type Rol = 'usuario' | 'administrador'
const etiqueta = 'text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta'

/**
 * Editar a una persona: nombres, correo, rol, sede, horario y el celular vinculado. Solo se envía lo que cambió, en una sola
 * llamada (o cambia todo o nada). El celular se reinicia aparte porque es una acción con su propia confirmación.
 */
export default function EditarUsuario({ usuario, sedes, onCerrar, onGuardado }: {
  usuario: FilaUsuario; sedes: SedeOpcion[]; onCerrar: () => void; onGuardado: (mensaje: string) => void
}) {
  const { perfil } = useAuth()
  const esYo = perfil?.id === usuario.id
  const [nombres, setNombres] = useState(usuario.nombres)
  const [apellidos, setApellidos] = useState(usuario.apellidos)
  const [email, setEmail] = useState(usuario.email)
  const [rol, setRol] = useState<Rol>(usuario.rol)
  const [sedeId, setSedeId] = useState(usuario.sede_id ?? '')
  const [horario, setHorario] = useState<ValorHorario>({
    inicio: horaCorta(usuario.jornada_inicio), fin: horaCorta(usuario.jornada_fin), dias: usuario.dias_laborables,
  })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoCelular, setConfirmandoCelular] = useState(false)
  const [reiniciando, setReiniciando] = useState(false)
  const [confirmandoRostro, setConfirmandoRostro] = useState(false)
  const [reseteandoRostro, setReseteandoRostro] = useState(false)

  const esUsuario = rol === 'usuario'
  // Si su sede actual ya está inactiva no aparece en la lista de sedes activas: se deja visible para no confundir.
  const opcionesSede = !usuario.sede_id || sedes.some((s) => s.id === usuario.sede_id)
    ? sedes
    : [{ id: usuario.sede_id, nombre: `${usuario.sedes?.nombre ?? 'Sede actual'} (inactiva)` }, ...sedes]

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (nombres.trim().length < 2 || apellidos.trim().length < 2) return setError('Los nombres y los apellidos deben tener al menos 2 letras')
    if (esUsuario) {
      if (!sedeId) return setError('Elige la sede de la persona')
      const problema = validarHorario(horario.inicio, horario.fin, horario.dias)
      if (problema) return setError(problema)
    }
    const cambios: Record<string, unknown> = {}
    if (nombres.trim() !== usuario.nombres) cambios.nombres = nombres.trim()
    if (apellidos.trim() !== usuario.apellidos) cambios.apellidos = apellidos.trim()
    if (email.trim().toLowerCase() !== usuario.email.toLowerCase()) cambios.email = email.trim()
    if (rol !== usuario.rol) cambios.rol = rol
    if (esUsuario) {
      if (sedeId !== (usuario.sede_id ?? '')) cambios.sede_id = sedeId
      if (horario.inicio !== horaCorta(usuario.jornada_inicio)) cambios.jornada_inicio = horario.inicio
      if (horario.fin !== horaCorta(usuario.jornada_fin)) cambios.jornada_fin = horario.fin
      if (horario.dias.join() !== usuario.dias_laborables.join()) cambios.dias_laborables = horario.dias
    }
    if (Object.keys(cambios).length === 0) return setError('No hay cambios para guardar')
    setError(null)
    setEnviando(true)
    try {
      const r = await api<{ mensaje?: string | null }>(`/usuarios/${usuario.id}`, { method: 'PATCH', body: cambios })
      onGuardado(r?.mensaje ?? `Los datos de ${nombres.trim()} ${apellidos.trim()} se actualizaron`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar los cambios')
      setEnviando(false)
    }
  }

  async function reiniciarCelular() {
    setError(null)
    setReiniciando(true)
    try {
      const r = await api<{ mensaje: string }>(`/usuarios/${usuario.id}/reiniciar-dispositivo`, { method: 'POST' })
      onGuardado(r.mensaje)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reiniciar el celular')
      setReiniciando(false)
      setConfirmandoCelular(false)
    }
  }

  // El administrador llama directo a la función `resetear_rostro` de la base: ella comprueba que quien llama es
  // administrador, borra el rostro cifrado y retira el consentimiento, y la bitácora deja constancia.
  async function resetearRostro() {
    setError(null)
    setReseteandoRostro(true)
    const { error: errorRpc } = await supabase.rpc('resetear_rostro', { p_usuario: usuario.id })
    if (errorRpc) {
      setError(`No se pudo resetear el rostro: ${errorRpc.message}`)
      setReseteandoRostro(false)
      setConfirmandoRostro(false)
      return
    }
    onGuardado(`El rostro de ${nombreCompleto(usuario)} se reinició. Deberá registrarlo de nuevo desde la app.`)
  }

  return (
    <Modal titulo="Editar usuario" subtitulo={nombreCompleto(usuario)} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombres" required minLength={2} value={nombres} onChange={(e) => setNombres(e.target.value)} />
          <Campo etiqueta="Apellidos" required minLength={2} value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Campo etiqueta="Correo institucional" type="email" required value={email} disabled={esYo}
            onChange={(e) => setEmail(e.target.value)} />
          <p className="text-xs font-semibold text-texto-suave">
            {esYo
              ? 'Tu propio correo no se puede cambiar desde aquí.'
              : email.trim().toLowerCase() !== usuario.email.toLowerCase()
                ? 'Es con el correo que la persona inicia sesión: al guardar, deberá entrar con el correo nuevo.'
                : 'Es con el correo que la persona inicia sesión.'}
          </p>
        </div>
        <div className="flex flex-col gap-[7px]">
          <span className={etiqueta}>Rol</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rol">
            {(['usuario', 'administrador'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rol === r} disabled={esYo} onClick={() => setRol(r)}
                className={`rounded-[13px] border px-4 py-3 text-sm font-extrabold disabled:opacity-60 ${rol === r ? 'border-marino bg-marino text-white' : 'border-borde bg-lienzo text-marino'}`}>
                {r === 'usuario' ? 'Usuario' : 'Administrador'}
              </button>
            ))}
          </div>
          {esYo && <p className="text-xs font-semibold text-texto-suave">No puedes cambiar tu propio rol.</p>}
          {!esYo && rol !== usuario.rol && (
            <p className="text-xs font-semibold text-texto-suave">
              {rol === 'administrador'
                ? 'Pasará a gestionar el sistema desde el panel y ya no marcará asistencia en la app.'
                : 'Pasará a marcar asistencia desde la app: necesita sede y horario.'}
            </p>
          )}
        </div>

        {esUsuario && (
          <>
            <div className="flex flex-col gap-[7px]">
              <label htmlFor="sede-usuario" className={etiqueta}>Sede asignada</label>
              <select id="sede-usuario" value={sedeId} onChange={(e) => setSedeId(e.target.value)}
                className="h-[52px] rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino">
                <option value="">Selecciona una sede</option>
                {opcionesSede.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
              <p className="text-xs font-semibold text-texto-suave">
                Las marcaciones nuevas se validan contra esta sede. Las que ya hizo conservan la sede de ese momento.
              </p>
            </div>
            <CamposHorario valor={horario} onCambio={setHorario} />
          </>
        )}

        {usuario.rol === 'usuario' && (
          <div className="space-y-2 rounded-[14px] border border-borde-suave bg-lienzo p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className={etiqueta}>Celular</span>
              <Chip tono={usuario.dispositivo_id ? 'ok' : 'aviso'}>{usuario.dispositivo_id ? 'Vinculado' : 'Sin vincular'}</Chip>
            </div>
            {usuario.dispositivo_id && !confirmandoCelular && (
              <Boton type="button" variante="borde" onClick={() => setConfirmandoCelular(true)}>Reiniciar celular vinculado</Boton>
            )}
            {usuario.dispositivo_id && confirmandoCelular && (
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-texto">
                  Se cerrarán sus sesiones abiertas: dejará de poder marcar desde su celular actual y, al iniciar sesión de nuevo, podrá vincular otro. ¿Reiniciar?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Boton type="button" variante="borde" disabled={reiniciando} onClick={() => setConfirmandoCelular(false)}>No, volver</Boton>
                  <Boton type="button" variante="marino" cargando={reiniciando} onClick={reiniciarCelular}>Sí, reiniciar</Boton>
                </div>
              </div>
            )}
            {!usuario.dispositivo_id && (
              <p className="text-xs font-semibold text-texto-suave">Se vincula solo cuando la persona lo pide desde la app.</p>
            )}
          </div>
        )}

        {usuario.rol === 'usuario' && (
          <div className="space-y-2 rounded-[14px] border border-borde-suave bg-lienzo p-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className={etiqueta}>Rostro</span>
              <Chip tono={usuario.fecha_registro_rostro ? 'ok' : 'aviso'}>
                {usuario.fecha_registro_rostro ? 'Registrado' : 'Sin registrar'}
              </Chip>
            </div>
            {usuario.fecha_registro_rostro && !confirmandoRostro && (
              <Boton type="button" variante="borde" onClick={() => setConfirmandoRostro(true)}>Resetear rostro</Boton>
            )}
            {usuario.fecha_registro_rostro && confirmandoRostro && (
              <div className="space-y-2">
                <p className="text-[13px] font-semibold text-texto">
                  Se borrará su rostro y su consentimiento. No podrá marcar hasta que lo registre de nuevo en la app, aceptando un consentimiento nuevo. ¿Resetear?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Boton type="button" variante="borde" disabled={reseteandoRostro} onClick={() => setConfirmandoRostro(false)}>No, volver</Boton>
                  <Boton type="button" variante="marino" cargando={reseteandoRostro} onClick={resetearRostro}>Sí, resetear</Boton>
                </div>
              </div>
            )}
            {!usuario.fecha_registro_rostro && (
              <p className="text-xs font-semibold text-texto-suave">Lo registra la persona desde la app, la primera vez que la usa.</p>
            )}
          </div>
        )}

        <Aviso tipo="aviso">
          Los feriados se administran en «Feriados». Los turnos rotativos, las vacaciones y los permisos todavía no se manejan aquí.
        </Aviso>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>Guardar cambios</Boton>
        </div>
      </form>
    </Modal>
  )
}
