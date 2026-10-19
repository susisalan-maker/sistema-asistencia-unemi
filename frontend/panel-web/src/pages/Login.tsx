import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { rutaInicio, useAuth } from '../auth/AuthContext'
import { Aviso, Boton, Campo, Cargando, TarjetaAcceso } from '../components/ui'
import { configuracionCompleta } from '../lib/supabase'

export default function Login() {
  const { cargando, session, perfil, iniciarSesion, cerrarSesion } = useAuth()
  const [email, setEmail] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (cargando) return <Cargando />
  if (session && perfil?.activo) return <Navigate to={rutaInicio(perfil.rol)} replace />

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    const mensaje = await iniciarSesion(email, contrasena)
    setEnviando(false)
    if (mensaje) setError(mensaje)
  }

  return (
    <TarjetaAcceso titulo="Iniciar sesión" subtitulo="Sistema de control de asistencia">
      {!configuracionCompleta && (
        <div className="mb-4">
          <Aviso tipo="error">Falta configurar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (ver .env.example).</Aviso>
        </div>
      )}
      {session && perfil && !perfil.activo && (
        <div className="mb-4 space-y-2">
          <Aviso tipo="error">Tu cuenta está desactivada. Comunícate con Talento Humano.</Aviso>
          <button onClick={cerrarSesion} className="text-sm font-bold text-marino underline">Salir</button>
        </div>
      )}
      {session && !perfil && (
        <div className="mb-4 space-y-2">
          <Aviso tipo="error">Tu cuenta no tiene un perfil asignado. Comunícate con Talento Humano.</Aviso>
          <button onClick={cerrarSesion} className="text-sm font-bold text-marino underline">Salir</button>
        </div>
      )}
      <form onSubmit={enviar} className="space-y-4">
        <Campo etiqueta="Correo institucional" type="email" autoComplete="username" required value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <Campo etiqueta="Contraseña" type="password" autoComplete="current-password" required value={contrasena}
          onChange={(e) => setContrasena(e.target.value)} />
        {error && <Aviso tipo="error">{error}</Aviso>}
        <Boton type="submit" cargando={enviando}>Entrar</Boton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/recuperar-contrasena" className="font-bold text-marino hover:underline">¿Olvidaste tu contraseña?</Link>
      </p>
      <p className="mt-6 text-center text-xs font-semibold text-texto-suave">
        No hay registro público: Talento Humano te envía una invitación por correo.
      </p>
    </TarjetaAcceso>
  )
}
