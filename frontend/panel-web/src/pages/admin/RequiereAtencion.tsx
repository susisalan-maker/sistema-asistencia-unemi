import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Esqueleto } from '../../components/Esqueleto'
import { Aviso } from '../../components/ui'
import type { Atencion } from './estadoHoy'

type Tono = 'error' | 'aviso' | 'neutro'

interface ItemAtencion { clave: string; tono: Tono; titulo: string; detalle: string; a: string; boton: string }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Lo que conviene resolver, ordenado por urgencia. Cada cosa lleva a donde se resuelve. Lo calcula la base (`atencion_hoy`). */
export function itemsDeAtencion(a: Atencion): ItemAtencion[] {
  const items: ItemAtencion[] = []
  const { vencidos, por_vencer } = a.revision
  if (vencidos > 0) {
    items.push({
      clave: 'vencidos', tono: 'error',
      titulo: `${plural(vencidos, 'caso en revisión ya pasó', 'casos en revisión ya pasaron')} el plazo de ${a.plazo_revision_h} h`,
      detalle: 'Es el tiempo que se le prometió a la persona para responder.',
      a: '/admin/anomalias?estado=por_resolver', boton: 'Revisar ahora',
    })
  }
  if (por_vencer > 0) {
    items.push({
      clave: 'por-vencer', tono: 'aviso',
      titulo: `${plural(por_vencer, 'caso en revisión vence', 'casos en revisión vencen')} en menos de 6 horas`,
      detalle: `${a.revision.por_vencer_casos.length > 0 ? `${a.revision.por_vencer_casos.join(' · ')}${por_vencer > a.revision.por_vencer_casos.length ? ' · …' : ''}. ` : ''}El plazo de revisión es de ${a.plazo_revision_h} h desde que la persona terminó de justificar.`,
      a: '/admin/anomalias?estado=por_resolver', boton: 'Revisar',
    })
  }
  if (a.sin_justificar > 0) {
    items.push({
      clave: 'sin-justificar', tono: 'aviso',
      titulo: `${plural(a.sin_justificar, 'caso sin justificar espera', 'casos sin justificar esperan')} tu decisión`,
      detalle: 'La persona no justificó a tiempo. Tú decides si el caso se justifica o se rechaza.',
      a: '/admin/anomalias?estado=por_resolver', boton: 'Revisar',
    })
  }
  if (a.sospechosas > 0) {
    items.push({
      clave: 'sospechosas', tono: 'aviso',
      titulo: `La IA clasificó ${plural(a.sospechosas, 'caso', 'casos')} como sospechoso${a.sospechosas === 1 ? '' : 's'}`,
      detalle: 'La IA solo sugiere: la decisión es de una persona.',
      a: '/admin/anomalias?estado=por_resolver', boton: 'Revisar',
    })
  }
  for (const r of a.rostro) {
    items.push({
      clave: `rostro-${r.usuario_id}`, tono: 'aviso',
      titulo: `${r.nombre}: ${r.intentos} verificaciones faciales fallidas en 7 días`,
      detalle: 'Puede ser un cambio de apariencia o de cámara. Mira sus casos y, si hace falta, reinicia su rostro desde Usuarios.',
      a: `/admin/anomalias?estado=todas&tipo=verificacion_fallida&q=${encodeURIComponent(r.nombre)}`, boton: 'Ver casos',
    })
  }
  if (a.sin_celular > 0) {
    items.push({
      clave: 'sin-celular', tono: 'neutro',
      titulo: `${plural(a.sin_celular, 'persona todavía no tiene', 'personas todavía no tienen')} un celular vinculado`,
      detalle: 'Su celular se vincula la primera vez que usan la app con su cuenta.',
      a: '/admin/usuarios', boton: 'Ver usuarios',
    })
  }
  return items
}

const ESTILO: Record<Tono, { borde: string; boton: string }> = {
  error: { borde: 'border-l-error', boton: 'bg-marino text-white shadow-[0_4px_10px_rgba(27,42,110,.3)] hover:brightness-110 border-marino' },
  aviso: { borde: 'border-l-ambar', boton: 'bg-white text-marino border-borde hover:bg-lienzo' },
  neutro: { borde: 'border-l-marino-suave', boton: 'bg-white text-marino border-borde hover:bg-lienzo' },
}

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
      <div aria-hidden="true" className="space-y-2">
        <Esqueleto className="h-5 w-40" /><Esqueleto className="h-[52px] w-full" /><Esqueleto className="h-[52px] w-full" />
      </div>
    )
  }
  const items = itemsDeAtencion(atencion)
  const visibles = verTodos ? items : items.slice(0, VISIBLES)
  return (
    <section aria-label="Requiere atención" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-extrabold text-marino">Requiere atención</h2>
        <span className="text-xs font-semibold text-texto-suave">Lo urgente, primero</span>
        {items.length > VISIBLES && (
          <button type="button" onClick={() => setVerTodos((v) => !v)} aria-expanded={verTodos}
            className="text-xs font-extrabold text-marino underline-offset-2 hover:underline sm:ml-auto">{verTodos ? 'Ver menos' : `Ver las ${items.length}`}</button>
        )}
      </div>
      {error && <Aviso tipo="aviso">No se pudo actualizar; se muestra lo último que llegó.</Aviso>}
      {items.length === 0 ? (
        <p className="rounded-[14px] border border-ok-borde bg-ok-fondo px-4 py-3 text-sm font-bold text-ok">Todo al día: nada requiere tu atención ahora.</p>
      ) : (
        <ul className="grid gap-2">
          {visibles.map((i) => (
            <li key={i.clave} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[12px] border border-l-[5px] border-borde-suave bg-white px-3 py-2 ${ESTILO[i.tono].borde}`}>
              <div className="min-w-[12rem] flex-1">
                <p className="text-[13px] font-extrabold leading-snug text-marino">{i.titulo}</p>
                <p className="text-[11.5px] font-semibold leading-snug text-texto-suave">{i.detalle}</p>
              </div>
              <Link to={i.a} className={`rounded-[9px] border px-3 py-1.5 text-xs font-extrabold max-sm:w-full max-sm:text-center ${ESTILO[i.tono].boton}`}>{i.boton}</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
