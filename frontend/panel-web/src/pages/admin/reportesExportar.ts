import { CLASIFICACIONES_IA, ESTADOS, nombreDeTipo } from './anomaliasTipos'
import { resolucionDe, type FilaHistorico } from './reportesDatos'

const ZONA = 'America/Guayaquil'

/** «2026-10-20 14:05», siempre en hora de Ecuador (y sin segundos, que no aportan). */
export function fechaHoraCompleta(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t)
  const v = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? ''
  return `${v('year')}-${v('month')}-${v('day')} ${v('hour')}:${v('minute')}`
}

/**
 * Una celda del CSV. Se encierra entre comillas si lo necesita, y si empieza con `=`, `+`, `-` o `@` se le antepone un
 * apóstrofo: Excel lo tomaría por una fórmula (un nombre o un motivo escrito por alguien podría ejecutar algo al abrirlo).
 */
export function celdaCsv(valor: string | number | null | undefined): string {
  let t = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
}

export const ENCABEZADOS_CSV = ['Caso', 'Fecha y hora', 'Colaborador', 'Tipo', 'Sede', 'Estado', 'Resolución', 'Clasificación IA', 'Fecha de decisión']

/**
 * La tabla histórica como CSV: separada por punto y coma (así Excel en español la abre en columnas), en UTF-8 con marca de
 * orden de bytes (para que las tildes y la ñ salgan bien) y con saltos de línea de Windows.
 */
export function aCsv(filas: FilaHistorico[]): string {
  const lineas = [ENCABEZADOS_CSV.map(celdaCsv).join(';')]
  for (const f of filas) {
    lineas.push([
      f.caso,
      fechaHoraCompleta(f.created_at),
      f.colaborador,
      nombreDeTipo(f.tipo),
      f.sede,
      ESTADOS[f.estado]?.texto ?? f.estado,
      resolucionDe(f),
      f.clasificacion_ia ? CLASIFICACIONES_IA[f.clasificacion_ia].texto.replace(/^IA: /, '') : '',
      fechaHoraCompleta(f.fecha_decision),
    ].map(celdaCsv).join(';'))
  }
  return `﻿${lineas.join('\r\n')}\r\n`
}

/** «reporte-anomalias-2026-10-01-a-2026-10-31.csv» */
export function nombreDeArchivo(desde: string, hasta: string, extension: string): string {
  return `reporte-anomalias-${desde}-a-${hasta}.${extension}`
}

/** Hace que el navegador descargue el texto como archivo. */
export function descargarTexto(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Se suelta un poco después: algunos navegadores aún están leyendo el archivo.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Hace que el navegador descargue un archivo binario (por ejemplo, un .xlsx). */
export function descargarBinario(nombre: string, contenido: Uint8Array, tipo: string): void {
  const url = URL.createObjectURL(new Blob([contenido as BlobPart], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
