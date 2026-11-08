import type { AgregadoReporte } from './reportesDatos'

/** Lunes = 1 … domingo = 7, como lo cuenta la base (`isodow`). */
export const DIAS_SEMANA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Cuántos tramos de color hay (0 = sin casos). */
export const NIVELES = 4

export interface CeldaCalor { dia: number; hora: number; total: number; nivel: number; titulo: string }
export interface FilaCalor { dia: number; nombre: string; celdas: CeldaCalor[] }
export interface MapaCalor {
  horas: number[]
  filas: FilaCalor[]
  mayor: number
  /** La frase completa (para lectores de pantalla). */
  resumen: string
  /** La misma idea en una línea, para la pantalla. */
  resumenCorto: string
  /** El tramo de 3 horas de un día con más casos (null si no hubo casos): `dia` 1 = lunes, `desde` = primera hora, `pct` = % de todos los casos. */
  pico: { dia: number; desde: number; casos: number; pct: number } | null
}

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`
const casos = (n: number) => `${n} ${n === 1 ? 'caso' : 'casos'}`
const capital = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Las horas que se dibujan: de 06:00 a 20:00 como mínimo, y más si hay casos fuera de ese rango. */
function horasVisibles(a: AgregadoReporte): number[] {
  const con = a.por_dia_hora.filter((x) => x.total > 0).map((x) => x.hora)
  const desde = Math.min(6, ...con)
  const hasta = Math.max(20, ...con)
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
}

/** El tramo de 3 horas seguidas de un mismo día con más casos (empieza siempre en una hora con casos). */
function mejorTramo(total: Map<string, number>): { dia: number; desde: number; casos: number } | null {
  let mejor: { dia: number; desde: number; casos: number } | null = null
  for (let dia = 1; dia <= 7; dia++) {
    for (let h = 0; h <= 23; h++) {
      if (!(total.get(`${dia}-${h}`) ?? 0)) continue
      const suma = [0, 1, 2].reduce((s, k) => s + (total.get(`${dia}-${h + k}`) ?? 0), 0)
      if (!mejor || suma > mejor.casos) mejor = { dia, desde: h, casos: suma }
    }
  }
  return mejor
}

/**
 * El mapa de calor «día de la semana × hora» de los casos del periodo, con una frase que dice dónde se concentran.
 * La frase solo describe: el mapa sirve para conversar o ajustar horarios, no para señalar a nadie.
 */
export function mapaCalor(a: AgregadoReporte): MapaCalor {
  const total = new Map<string, number>()
  for (const x of a.por_dia_hora) total.set(`${x.dia}-${x.hora}`, (total.get(`${x.dia}-${x.hora}`) ?? 0) + x.total)
  const mayor = Math.max(0, ...total.values())
  const horas = horasVisibles(a)
  const filas = DIAS_SEMANA.map((nombre, i) => ({
    dia: i + 1,
    nombre,
    celdas: horas.map((hora) => {
      const t = total.get(`${i + 1}-${hora}`) ?? 0
      return {
        dia: i + 1, hora, total: t,
        nivel: t === 0 || mayor === 0 ? 0 : Math.max(1, Math.ceil((t / mayor) * NIVELES)),
        titulo: `${capital(nombre)} ${hh(hora)}: ${t === 0 ? 'sin casos' : casos(t)}`,
      }
    }),
  }))

  const todos = a.por_dia_hora.reduce((s, x) => s + x.total, 0)
  const pico = mejorTramo(total)
  if (!pico || todos === 0) return { horas, filas, mayor, resumen: 'Sin casos en el periodo: no hay un horario que destacar.', resumenCorto: 'Sin casos en el periodo.', pico: null }

  const pct = Math.round((pico.casos / todos) * 100)
  let texto = `${capital(DIAS_SEMANA[pico.dia - 1])} de ${hh(pico.desde)} a ${hh(pico.desde + 3)} concentra ${pico.casos} de ${todos} casos (${pct} %).`
  // El segundo pico: la hora con más casos fuera del tramo anterior.
  let segundo: { dia: number; hora: number; total: number } | null = null
  for (const x of a.por_dia_hora) {
    const dentro = x.dia === pico.dia && x.hora >= pico.desde && x.hora < pico.desde + 3
    if (dentro || x.total === 0) continue
    if (!segundo || x.total > segundo.total || (x.total === segundo.total && (x.dia < segundo.dia || (x.dia === segundo.dia && x.hora < segundo.hora)))) segundo = x
  }
  if (segundo) texto += ` El segundo pico es el ${DIAS_SEMANA[segundo.dia - 1]} a las ${hh(segundo.hora)} (${casos(segundo.total)}).`
  texto += ' Puede servir para ajustar el horario o enviar un recordatorio.'
  const corto = `${capital(DIAS_SEMANA[pico.dia - 1])} ${hh(pico.desde)}–${hh(pico.desde + 3)} concentra ${pico.casos} de ${todos} casos (${pct} %).${segundo ? ` Segundo pico: ${DIAS_SEMANA[segundo.dia - 1]} ${hh(segundo.hora)}.` : ''}`
  return { horas, filas, mayor, resumen: texto, resumenCorto: corto, pico: { dia: pico.dia, desde: pico.desde, casos: pico.casos, pct } }
}
