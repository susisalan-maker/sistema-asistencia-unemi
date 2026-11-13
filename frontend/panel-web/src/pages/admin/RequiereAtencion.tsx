import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Esqueleto } from '../../components/Esqueleto'
import { Aviso, Chip } from '../../components/ui'
import type { Atencion } from './estadoHoy'
import { panel } from './PiezasReporte'

type Tono = 'error' | 'aviso' | 'neutro'

/** `n` es el número que se ve en el recuadro de color; `titulo` dice qué es, sin repetirlo. */
export interface ItemAtencion { clave: string; tono: Tono; n: number; titulo: string; detalle: string; a: string }

const REVISAR = '/admin/anomalias?estado=por_resolver'

/** Lo que conviene resolver, ordenado por urgencia. Cada cosa lleva a donde se resuelve. Lo calcula la base (`atencion_hoy`). */
export function itemsDeAtencion(a: Atencion): ItemAtencion[] {
  const items: ItemAtencion[] = []
  const { vencidos, por_vencer } = a.revision
  if (vencidos > 0) {
    items.push({
      clave: 'vencidos', tono: 'error', n: vencidos,
      titulo: vencidos === 1 ? `Caso en revisión que ya pasó el plazo de ${a.plazo_revision_h} h` : `Casos en revisión que ya pasaron el plazo de ${a.plazo_revision_h} h`,
      detalle: 'Es el tiempo que se le prometió a la persona para responder.', a: REVISAR,
    })
  }
  if (por_vencer > 0) {
    const casos = a.revision.por_vencer_casos
    items.push({
      clave: 'por-vencer', tono: 'aviso', n: por_vencer,
      titulo: por_vencer === 1 ? 'Caso en revisión que vence en menos de 6 horas' : 'Casos en revisión que vencen en menos de 6 horas',
      detalle: `${casos.length > 0 ? `${casos.join(' · ')}${por_vencer > casos.length ? ' · …' : ''}. ` : ''}El plazo es de ${a.plazo_revision_h} h desde que la persona terminó de justificar.`, a: REVISAR,
    })
  }
  if (a.sin_justificar > 0) {
    items.push({
      clave: 'sin-justificar', tono: 'aviso', n: a.sin_justificar,
      titulo: a.sin_justificar === 1 ? 'Caso sin justificar espera tu decisión' : 'Casos sin justificar esperan tu decisión',
      detalle: 'La persona no justificó a tiempo. Tú decides si el caso se justifica o se rechaza.', a: REVISAR,
    })
  }
  for (const r of a.rostro) {
    items.push({
      clave: `rostro-${r.usuario_id}`, tono: 'aviso', n: r.intentos,
      titulo: `${r.nombre}: verificaciones faciales fallidas en 7 días`,
      detalle: 'Puede ser un cambio de apariencia o de cámara. Mira sus casos y, si hace falta, reinicia su rostro desde Usuarios.',
      a: `/admin/anomalias?estado=todas&tipo=verificacion_fallida&q=${encodeURIComponent(r.nombre)}`,
    })
  }
  if (a.sin_celular > 0) {
    items.push({
      clave: 'sin-celular', tono: 'neutro', n: a.sin_celular,
      titulo: a.sin_celular === 1 ? 'Persona todavía sin celular vinculado' : 'Personas todavía sin celular vinculado',
      detalle: 'Su celular se vincula la primera vez que usan la app con su cuenta.', a: '/admin/usuarios',
    })
  }
  return items
}

const COLOR_N: Record<Tono, string> = { error: 'bg-error-fondo text-error', aviso: 'bg-aviso-fondo text-aviso', neutro: 'bg-celeste text-marino' }

const VISIBLES = 4

interface Props { atencion: Atencion | null; error: boolean; onReintentar: () => void }

export function RequiereAtencion({ atencion, error, onReintentar }: Props) {
  const [verTodos, setVerTodos] = useState(false)
  if (!atencion && error) {
    return (
      <Aviso tipo="error">
        No se pudo cargar lo que requiere atención.{' '}
        <button type="button" onClick={onReintentar} className="underline">Reintentar</button>
      </Aviso>
    )
  }
  if (!atencion) {
    return (
      <div aria-hidden="true" className={`${panel} gap-3 p-5`}>
        <Esqueleto className="h-5 w-40" /><Esqueleto className="h-[56px] w-full" /><Esqueleto className="h-[56px] w-full" /><Esqueleto className="h-[56px] w-full" />
      </div>
    )
  }
  const items = itemsDeAtencion(atencion)
  const visibles = verTodos ? items : items.slice(0, VISIBLES)
  const porResolver = atencion.revision.total + atencion.sin_justificar

  return (
    <section aria-label="Requiere atención" className={panel}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="text-[15px] font-extrabold text-marino">Requiere atención</h2>
        {porResolver > 0 && <Chip tono="error">{porResolver} {porResolver === 1 ? 'caso' : 'casos'}</Chip>}
        <span className="text-[13px] font-semibold text-texto-suave">Lo urgente, primero</span>
        {items.length > VISIBLES && (
          <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}
            className="text-[13px] font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">{verTodos ? 'Ver menos' : `Ver las ${items.length}`}</button>
        )}
      </div>
      {error && <div className="mx-5 mt-2"><Aviso tipo="aviso">No se pudo actualizar; se muestra lo último que llegó.</Aviso></div>}

      {items.length === 0 ? (
        <p className="m-5 rounded-[14px] border border-ok-borde bg-ok-fondo px-4 py-3 text-sm font-bold text-ok">Todo al día: nada requiere tu atención ahora.</p>
      ) : (
        <ul className="mt-2.5">
          {visibles.map((i) => (
            <li key={i.clave} className="border-t border-borde-suave first:border-t-0">
              <Link to={i.a} aria-label={`${i.n} ${i.titulo}. ${i.detalle}`} className="flex items-center gap-3.5 px-5 py-3 transition-colors hover:bg-cabecera focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino">
                <span aria-hidden="true" className={`grid size-10 flex-none place-items-center rounded-xl text-lg font-extrabold ${COLOR_N[i.tono]}`}>{i.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-extrabold leading-snug text-marino">{i.titulo}</span>
                  <span className="mt-px block text-[13px] font-semibold leading-snug text-texto-suave">{i.detalle}</span>
                </span>
                <span aria-hidden="true" className="flex-none text-lg font-bold text-marino-suave">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(atencion.sospechosas > 0 || porResolver > 0) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-b-[18px] border-t border-borde-suave bg-cabecera px-5 py-3.5">
          <p className="min-w-40 flex-1 text-xs font-semibold leading-snug text-texto-suave">
            {atencion.sospechosas > 0
              ? `La IA clasificó ${atencion.sospechosas} ${atencion.sospechosas === 1 ? 'caso' : 'casos'} como sospechoso${atencion.sospechosas === 1 ? '' : 's'}. Solo sugiere: la decisión es de una persona.`
              : 'Todo caso lo decide una persona: la IA solo sugiere.'}
          </p>
          {porResolver > 0 && (
            <Link to={REVISAR} className="rounded-[11px] bg-ambar px-4 py-2.5 text-center text-[13px] font-extrabold text-ambar-tinta shadow-[0_1px_2px_rgba(32,24,10,.22),0_4px_10px_rgba(32,24,10,.12)] hover:brightness-95 max-sm:w-full">
              {porResolver === 1 ? 'Revisar el caso' : `Revisar los ${porResolver} casos`}
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
