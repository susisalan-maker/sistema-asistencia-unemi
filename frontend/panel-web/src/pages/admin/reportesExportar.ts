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
