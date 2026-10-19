import { useState, type FormEvent } from 'react'
import { Aviso, Boton, Campo } from '../../components/ui'
import { Modal } from '../../components/Modal'
import { api } from '../../lib/api'
import type { SedeOpcion } from './usuariosTipos'

export default function NuevoUsuario({ sedes, onCerrar, onCreado }: { sedes: SedeOpcion[]; onCerrar: () => void; onCreado: () => void }) {
  const [nombres, setNombres] = useState('')
  const [apellidos, setApellidos] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<'usuario' | 'administrador'>('usuario')
  const [sedeId, setSedeId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    if (rol === 'usuario' && !sedeId) return setError('Selecciona una sede para el usuario')
    setError(null)
    setEnviando(true)
    try {
      await api('/usuarios', { method: 'POST', body: { nombres, apellidos, email, rol, sede_id: rol === 'usuario' ? sedeId : null } })
      onCreado()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el usuario')
      setEnviando(false)
    }
  }

  return (
    <Modal titulo="Nuevo usuario" subtitulo="Se enviará una invitación al correo institucional" onCerrar={onCerrar}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Campo etiqueta="Nombres" placeholder="Ej. Valeria Sofía" required minLength={2} value={nombres}
            onChange={(e) => setNombres(e.target.value)} />
          <Campo etiqueta="Apellidos" placeholder="Ej. Ortega Mora" required minLength={2} value={apellidos}
            onChange={(e) => setApellidos(e.target.value)} />
        </div>
        <Campo etiqueta="Email institucional" type="email" placeholder="nombre@universidad.edu" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <div className="flex flex-col gap-[7px]">
          <span className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Rol</span>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Rol">
            {(['usuario', 'administrador'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={rol === r} onClick={() => setRol(r)}
                className={`rounded-[13px] border px-4 py-3 text-sm font-extrabold ${rol === r ? 'border-marino bg-marino text-white' : 'border-borde bg-lienzo text-marino'}`}>
                {r === 'usuario' ? 'Usuario' : 'Administrador'}
              </button>
            ))}
          </div>
        </div>
        {rol === 'usuario' && (
          <div className="flex flex-col gap-[7px]">
            <label htmlFor="sede" className="text-xs font-extrabold uppercase tracking-[.08em] text-etiqueta">Sede asignada</label>
            <select id="sede" value={sedeId} onChange={(e) => setSedeId(e.target.value)}
              className="h-[52px] rounded-[13px] border border-borde bg-lienzo px-4 text-[15px] font-semibold text-marino">
              <option value="">Selecciona una sede</option>
              {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
            <p className="text-xs font-semibold text-texto-suave">El usuario se valida contra las zonas (bloques) de esta sede.</p>
          </div>
        )}
        <Aviso tipo="aviso">La vinculación del dispositivo se completa desde la app la primera vez que la persona inicie sesión.</Aviso>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Boton type="button" variante="borde" onClick={onCerrar}>Cancelar</Boton>
          <Boton type="submit" cargando={enviando}>Crear usuario</Boton>
        </div>
      </form>
    </Modal>
  )
}
