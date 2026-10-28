import { useAuth } from '../../auth/AuthContext'
import { Boton } from '../../components/ui'
import { nombreCompleto } from '../../lib/texto'

/** Pantalla provisional de las secciones que todavía no se desarrollan en la web (Historial y Avisos). */
export function Proximamente({ titulo, detalle }: { titulo: string; detalle: string }) {
  return (
    <div className="mx-auto max-w-[720px] p-4 sm:p-7">
      <h1 className="text-[21px] font-extrabold tracking-tight text-marino">{titulo}</h1>
      <div className="mt-4 rounded-[18px] border border-borde-suave bg-white p-6">
        <p className="text-sm font-extrabold text-marino">Próximamente</p>
        <p className="mt-1 text-sm font-semibold text-texto-suave">{detalle}</p>
      </div>
    </div>
  )
}

export function Historial() {
  return <Proximamente titulo="Historial" detalle="Aquí verás todas tus marcaciones por día. Por ahora puedes consultarlas en la app del celular; las últimas aparecen en el Inicio." />
}

export function Avisos() {
  return <Proximamente titulo="Avisos" detalle="Aquí podrás justificar tus observaciones. Por ahora hazlo desde la app del celular." />
}

export function Perfil() {
  const { perfil, cerrarSesion } = useAuth()
  return (
    <div className="mx-auto max-w-[720px] p-4 sm:p-7">
      <h1 className="text-[21px] font-extrabold tracking-tight text-marino">Perfil</h1>
      <div className="mt-4 rounded-[18px] border border-borde-suave bg-white p-6">
        <p className="text-base font-extrabold text-marino">{perfil ? nombreCompleto(perfil) : ''}</p>
        <p className="text-sm font-semibold text-texto-suave">{perfil?.email}</p>
        <p className="mt-4 text-sm font-semibold text-texto-suave">Tus datos y tu rostro registrado se gestionan desde la app del celular.</p>
        <div className="mt-5 max-w-[200px]"><Boton variante="borde" onClick={cerrarSesion}>Cerrar sesión</Boton></div>
      </div>
    </div>
  )
}
