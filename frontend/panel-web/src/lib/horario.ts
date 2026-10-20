/** Horario laboral: días de la semana (ISO: 1 = lunes … 7 = domingo) y jornada. */
export const DIAS = [
  { n: 1, corto: 'L', nombre: 'Lunes' },
  { n: 2, corto: 'M', nombre: 'Martes' },
  { n: 3, corto: 'X', nombre: 'Miércoles' },
  { n: 4, corto: 'J', nombre: 'Jueves' },
  { n: 5, corto: 'V', nombre: 'Viernes' },
  { n: 6, corto: 'S', nombre: 'Sábado' },
  { n: 7, corto: 'D', nombre: 'Domingo' },
] as const

export const LUN_A_VIE = [1, 2, 3, 4, 5]

const nombreDe = (n: number) => DIAS.find((d) => d.n === n)!.nombre.toLowerCase()

/** [1,2,3,4,5] → «lunes a viernes»; [1,3,5] → «lunes, miércoles, viernes». Igual que el microservicio. */
export function textoDias(dias: number[]): string {
  const orden = [...new Set(dias)].sort((a, b) => a - b)
  if (orden.length > 2 && orden[orden.length - 1]! - orden[0]! === orden.length - 1) {
    return `${nombreDe(orden[0]!)} a ${nombreDe(orden[orden.length - 1]!)}`
  }
  return orden.map(nombreDe).join(', ')
}

/** '08:00:00' → '08:00' (PostgREST entrega las horas con segundos). */
export const horaCorta = (hora: string) => hora.slice(0, 5)

export function resumenHorario(inicio: string, fin: string, dias: number[]): string {
  return `${horaCorta(inicio)}–${horaCorta(fin)} · ${textoDias(dias)}`
}

/** Devuelve el mensaje de error o null si el horario es válido. */
export function validarHorario(inicio: string, fin: string, dias: number[]): string | null {
  if (!inicio || !fin) return 'Indica la hora de entrada y de salida'
  if (fin <= inicio) return 'La salida debe ser después de la entrada'
  if (dias.length === 0) return 'Elige al menos un día laborable'
  return null
}

/** '2026-11-02' → «lunes, 2 de noviembre de 2026». La fecha se lee en UTC para que no se corra un día. */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a!, m! - 1, d!)).toLocaleDateString('es-EC', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  })
}
