/** Fechas de la Auditoría: siempre en hora de Ecuador, escritas como las diría una persona («hoy · domingo 8 de noviembre», «hace 20 min»). */

const ZONA = 'America/Guayaquil'
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const formato = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function partes(iso: string): Record<string, string> | null {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  return Object.fromEntries(formato.formatToParts(t).map((p) => [p.type, p.value]))
}

/** «2026-11-08» (el día en Ecuador). Vacío si la fecha no es válida. */
export function diaEcuador(iso: string): string {
  const p = partes(iso)
  return p ? `${p.year}-${p.month}-${p.day}` : ''
}

/** «17:12». */
export function horaEcuador(iso: string): string {
  const p = partes(iso)
  return p ? `${p.hour}:${p.minute}` : ''
}

const numeroDeDia = (dia: string) => Math.floor(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10))) / 86_400_000)

/** «domingo 8 de noviembre» (con el año si no es el de `hoy`). */
export function fechaLarga(dia: string, hoy?: string): string {
  const n = numeroDeDia(dia)
  const nombre = DIAS[new Date(n * 86_400_000).getUTCDay()]
  const base = `${nombre} ${Number(dia.slice(8, 10))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`
  return hoy && hoy.slice(0, 4) !== dia.slice(0, 4) ? `${base} de ${dia.slice(0, 4)}` : base
}

/** El título de un grupo de acciones: «Hoy · domingo 8 de noviembre», «Ayer · …», o solo la fecha. */
export function tituloDeDia(dia: string, hoy: string): string {
  const diferencia = numeroDeDia(hoy) - numeroDeDia(dia)
  const fecha = fechaLarga(dia, hoy)
  return diferencia === 0 ? `Hoy · ${fecha}` : diferencia === 1 ? `Ayer · ${fecha}` : fecha[0]!.toUpperCase() + fecha.slice(1)
}

/** «hace 20 min», «hace 2 h», «ayer», «hace 5 días». Pasado un mes no dice nada: ya lo dice el título del día. */
export function relativo(iso: string, ahora: Date): string {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return ''
  const dias = numeroDeDia(diaEcuador(ahora.toISOString())) - numeroDeDia(diaEcuador(iso))
  if (dias <= 0) {
    const minutos = Math.floor((ahora.getTime() - t.getTime()) / 60_000)
    if (minutos < 1) return 'ahora'
    return minutos < 60 ? `hace ${minutos} min` : `hace ${Math.floor(minutos / 60)} h`
  }
  if (dias === 1) return 'ayer'
  return dias < 30 ? `hace ${dias} días` : ''
}

/** «Sábado 7 de noviembre de 2026 · 09:14 (hora de Ecuador)». */
export function fechaYHoraLarga(iso: string): string {
  const dia = diaEcuador(iso)
  if (!dia) return ''
  const f = fechaLarga(dia)
  return `${f[0]!.toUpperCase()}${f.slice(1)} de ${dia.slice(0, 4)} · ${horaEcuador(iso)} (hora de Ecuador)`
}
