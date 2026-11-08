import { META_A_TIEMPO, META_PUNTUALIDAD } from './reportesVista'
import { tarjeta } from './PiezasReporte'

const ITEMS: { clave: string; titulo: string; texto: string }[] = [
  { clave: 'puntualidad', titulo: 'Puntualidad', texto: `Porcentaje de los ingresos y salidas del periodo que no tienen la anomalía «Fuera de horario». Las marcaciones del almuerzo no cuentan. Meta de referencia: ${META_PUNTUALIDAD} %.` },
  { clave: 'a-tiempo', titulo: 'Justificadas a tiempo', texto: `De los casos ya evaluados (con decisión o con plazo vencido), cuántos justificó la persona antes de que venciera el plazo. Meta de referencia: ${META_A_TIEMPO} %.` },
  { clave: 'resolucion', titulo: 'Tiempo medio de resolución', texto: 'Horas entre que se detecta el caso y una persona lo decide, promediadas sobre los casos que una persona ya decidió. Los casos que siguen abiertos no cuentan.' },
  { clave: 'rechazo', titulo: 'Rechazo facial', texto: 'Verificaciones faciales fallidas sobre el total de intentos (las marcaciones guardadas más las fallidas).' },
  { clave: 'variacion', titulo: 'Flechas ▲ ▼', texto: 'Comparan con el periodo inmediatamente anterior de la misma duración. En verde, el cambio mejora la cifra; en rojo, la empeora.' },
  { clave: 'ia', titulo: 'Qué hace la IA', texto: 'Solo redacta un resumen a partir de números ya contados y sugiere un tipo de caso. Nunca decide un caso: lo decide una persona.' },
]

/** Transparencia: cómo se calcula cada cifra del reporte, en palabras. */
export function ComoSeCalcula() {
  return (
    <section aria-label="Cómo se calcula" className={tarjeta}>
      <h2 className="text-[17px] font-extrabold text-marino">Cómo se calcula</h2>
      <p className="mb-2 mt-0.5 text-xs font-semibold text-texto-suave">Cada indicador, explicado</p>
      {ITEMS.map((i, n) => (
        <details key={i.clave} open={n === 0} className="border-t border-lienzo py-2.5 first:border-t-0">
          <summary className="cursor-pointer text-[13px] font-extrabold text-marino">{i.titulo}</summary>
          <p className="mt-1.5 text-xs font-semibold leading-relaxed text-texto-suave">{i.texto}</p>
        </details>
      ))}
    </section>
  )
}
