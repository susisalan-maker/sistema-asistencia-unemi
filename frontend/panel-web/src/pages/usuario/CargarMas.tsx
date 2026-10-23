import { Boton } from '../../components/ui'

/** Pie de una lista que se muestra por tramos: «Mostrando 8 de 23» y el botón para ver más. No dibuja nada si ya se ve todo. */
export function CargarMas({ mostrados, total, unidad, onMas }: { mostrados: number; total: number; unidad: string; onMas: () => void }) {
  if (total <= mostrados) return null
  return (
    <div className="flex flex-col items-center gap-2.5 pt-1">
      <p className="text-xs font-bold text-etiqueta">Mostrando {mostrados} de {total} {unidad}</p>
      <div className="w-full max-w-[220px]"><Boton variante="borde" onClick={onMas}>Cargar más</Boton></div>
    </div>
  )
}

/** Cuántos elementos se ven al abrir y cuántos se suman con «Cargar más». */
export const TRAMO = 8
