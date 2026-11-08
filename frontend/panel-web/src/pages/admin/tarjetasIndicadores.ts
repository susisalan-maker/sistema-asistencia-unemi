import type { Indicadores } from './reportesDatos'
import {
  META_A_TIEMPO, META_PUNTUALIDAD, coma, textoHoras, textoPuntos, textoPuntosCorto, textoResolucion, textoResolucionCorto, textoVariacion, textoVariacionCorto,
} from './reportesVista'

/** Los indicadores que se dibujan como tarjeta (en el Dashboard y en las plantillas de Reportes). */
export type IdIndicador = 'anomalias' | 'aTiempo' | 'puntualidad' | 'resolucion' | 'rechazo' | 'porResolver'

export interface DatosTarjeta {
  titulo: string
  valor: string
  /** Una línea corta, debajo del número. */
  detalle: string
  /** La explicación completa: se ve al pasar el cursor y la leen los lectores de pantalla. */
  ayuda: string
  aviso?: boolean
  barra?: { pct: number | null; meta: number }
}

const pct = (n: number | null) => (n === null ? '—' : `${coma(n)} %`)

/** Todo lo que dice cada tarjeta, calculado a partir de los indicadores ya listos. */
export function tarjetaDe(id: IdIndicador, i: Indicadores): DatosTarjeta {
  switch (id) {
    case 'anomalias':
      return { titulo: 'Anomalías', valor: String(i.total), detalle: textoVariacionCorto(i), ayuda: `Anomalías del periodo. ${textoVariacion(i)}` }
    case 'aTiempo':
      return {
        titulo: 'Justificadas a tiempo', valor: pct(i.aTiempoPct), barra: { pct: i.aTiempoPct, meta: META_A_TIEMPO },
        detalle: i.evaluadas === 0 ? 'Sin plazos vencidos' : `${i.aTiempo} de ${i.evaluadas} casos`,
        ayuda: `Justificadas a tiempo. ${i.evaluadas === 0 ? 'Aún no hay casos con plazo vencido' : `${i.aTiempo} de ${i.evaluadas} casos con plazo vencido o justificados`}. Meta de referencia ${META_A_TIEMPO} %`,
      }
    case 'puntualidad': {
      const dentro = i.jornadaMarcaciones - i.jornadaConFalta
      return {
        titulo: 'Puntualidad', valor: pct(i.puntualidadPct), barra: { pct: i.puntualidadPct, meta: META_PUNTUALIDAD },
        detalle: i.jornadaMarcaciones === 0 ? 'Sin ingresos ni salidas' : `${dentro} de ${i.jornadaMarcaciones} · ${textoPuntosCorto(i.puntualidadPts)}`,
        ayuda: i.jornadaMarcaciones === 0
          ? `Puntualidad. Sin ingresos ni salidas en el periodo. Meta de referencia ${META_PUNTUALIDAD} %`
          : `Puntualidad. ${dentro} de ${i.jornadaMarcaciones} ingresos y salidas dentro del horario · ${textoPuntos(i.puntualidadPts)}. Meta de referencia ${META_PUNTUALIDAD} %`,
      }
    }
    case 'resolucion': {
      const corto = textoResolucionCorto(i)
      return {
        titulo: 'Resolución', valor: i.resolucionHoras === null ? '—' : textoHoras(i.resolucionHoras),
        detalle: corto.texto, aviso: corto.aviso, ayuda: `Tiempo medio de resolución. ${textoResolucion(i).texto}`,
      }
    }
    case 'rechazo': {
      const sube = i.rechazoPts !== null && i.rechazoPts > 0
      return {
        titulo: 'Rechazo facial', valor: pct(i.rechazoPct), aviso: sube,
        detalle: i.rechazoPct === null ? 'Sin intentos' : `${i.rechazoFallidas} ${i.rechazoFallidas === 1 ? 'fallida' : 'fallidas'} · ${textoPuntosCorto(i.rechazoPts)}`,
        ayuda: i.rechazoPct === null
          ? 'Rechazo facial. Sin intentos de verificación en el periodo'
          : `Rechazo facial. ${i.rechazoFallidas} ${i.rechazoFallidas === 1 ? 'verificación fallida' : 'verificaciones fallidas'} · ${textoPuntos(i.rechazoPts)}${sube ? ' · conviene vigilar el umbral' : ''}`,
      }
    }
    case 'porResolver':
      return {
        titulo: 'Por resolver', valor: String(i.porResolver), aviso: i.porResolver > 0,
        detalle: i.porResolver === 0 ? 'Nada pendiente' : 'En revisión o sin justificar',
        ayuda: 'Por resolver. Casos del periodo que esperan la decisión de una persona (en revisión o sin justificar)',
      }
  }
}
