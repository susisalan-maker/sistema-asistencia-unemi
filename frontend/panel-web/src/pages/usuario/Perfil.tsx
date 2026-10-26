import { useAuth } from '../../auth/AuthContext'
import { Chip } from '../../components/ui'
import { iniciales, nombreCompleto } from '../../lib/texto'
import { useEstadoHoy } from '../../lib/useJornada'

/** Perfil: datos de la cuenta, estado del registro facial. El registro del rostro y del celular se hacen en la app. */
export default function Perfil() {
  const { perfil } = useAuth()
  const { estado } = useEstadoHoy()
  if (!perfil) return null

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 p-4 sm:p-7">
      <h1 className="text-[24px] font-extrabold tracking-tight text-marino">Perfil</h1>

      <section aria-label="Tu cuenta" className="flex flex-col items-center gap-1.5 rounded-[22px] border border-borde-suave bg-white p-6 text-center">
        <span aria-hidden="true" className="mb-1.5 grid size-16 place-items-center rounded-full bg-celeste text-[22px] font-extrabold text-marino">{iniciales(perfil.nombres, perfil.apellidos)}</span>
        <p className="break-words text-xl font-extrabold text-marino">{nombreCompleto(perfil)}</p>
        <p className="mb-1 break-all text-sm font-semibold text-texto-suave">{perfil.email}</p>
        <Chip tono="neutro">Usuario</Chip>
      </section>

      {estado && (
        <section aria-label="Verificación" className="rounded-[22px] border border-borde-suave bg-white p-5">
          <h2 className="text-[15px] font-extrabold text-marino">Verificación</h2>
          <dl className="mt-2 divide-y divide-lienzo text-sm">
            <Fila etiqueta="Rostro" valor={estado.rostro_registrado ? <Chip tono="ok">REGISTRADO</Chip> : <Chip tono="aviso">PENDIENTE</Chip>} />
            <Fila etiqueta="Celular" valor={estado.dispositivo === 'sin_vincular' ? <Chip tono="neutro">SIN VINCULAR</Chip> : <Chip tono="ok">VINCULADO</Chip>} />
          </dl>
          <p className="mt-3 text-[13px] font-semibold text-texto-suave">Tu rostro y tu celular se registran desde la app. Si te falta alguno, hazlo allí antes de marcar.</p>
        </section>
      )}
    </div>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <dt className="font-bold text-texto-suave">{etiqueta}</dt>
      <dd>{valor}</dd>
    </div>
  )
}
