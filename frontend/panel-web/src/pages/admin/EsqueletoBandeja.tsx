import { Esqueleto } from '../../components/Esqueleto'

/** Lo que se ve mientras llega la primera página de la bandeja: tarjetas «vacías» con la forma de las de verdad. */
export function EsqueletoBandeja() {
  return (
    <div role="status" aria-label="Cargando anomalías" className="grid gap-4 pt-1 md:grid-cols-2 2xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex flex-col gap-4 rounded-[18px] border border-borde-suave bg-white p-5">
          <div className="flex justify-between"><Esqueleto className="h-4 w-16" /><Esqueleto className="h-5 w-28 rounded-full" /></div>
          <Esqueleto className="h-5 w-3/4" />
          <Esqueleto className="h-4 w-full" />
          <Esqueleto className="h-14 w-full rounded-xl" />
          <div className="flex justify-between"><Esqueleto className="h-4 w-24" /><Esqueleto className="h-9 w-20" /></div>
        </div>
      ))}
    </div>
  )
}
