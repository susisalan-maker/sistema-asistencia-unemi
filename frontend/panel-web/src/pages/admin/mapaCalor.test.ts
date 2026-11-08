import { describe, expect, it } from 'vitest'
import { DIAS_SEMANA, mapaCalor } from './mapaCalor'
import { leerAgregado } from './reportesDatos'

const con = (celdas: [number, number, number][]) => leerAgregado({ por_dia_hora: celdas.map(([dia, hora, total]) => ({ dia, hora, total })) })

describe('mapaCalor', () => {
  it('arma siete filas, de lunes a domingo, con las horas de 06:00 a 20:00 como mínimo', () => {
    const m = mapaCalor(con([[1, 8, 2]]))
    expect(m.filas.map((f) => f.nombre)).toEqual(DIAS_SEMANA)
    expect(m.horas[0]).toBe(6)
    expect(m.horas.at(-1)).toBe(20)
    expect(m.filas[0].celdas).toHaveLength(15)
  })

  it('amplía las horas si hay casos fuera de ese rango', () => {
    const m = mapaCalor(con([[2, 0, 1], [3, 22, 4]]))
    expect(m.horas[0]).toBe(0)
    expect(m.horas.at(-1)).toBe(22)
  })

  it('el color va de 1 a 4 según qué tan cerca está del máximo; sin casos es 0', () => {
    const m = mapaCalor(con([[1, 8, 8], [1, 9, 4], [1, 10, 1]]))
    const celdas = m.filas[0].celdas
    const nivel = (h: number) => celdas.find((c) => c.hora === h)!.nivel
    expect([nivel(8), nivel(9), nivel(10), nivel(11)]).toEqual([4, 2, 1, 0])
  })

  it('cada celda dice su día, hora y cantidad', () => {
    const m = mapaCalor(con([[3, 14, 1], [3, 15, 2]]))
    const c = m.filas[2].celdas
    expect(c.find((x) => x.hora === 14)!.titulo).toBe('Miércoles 14:00: 1 caso')
    expect(c.find((x) => x.hora === 15)!.titulo).toBe('Miércoles 15:00: 2 casos')
    expect(c.find((x) => x.hora === 16)!.titulo).toBe('Miércoles 16:00: sin casos')
  })

  it('la frase señala el tramo de 3 horas con más casos y el segundo pico', () => {
    const m = mapaCalor(con([[1, 7, 4], [1, 8, 4], [1, 9, 2], [5, 17, 3], [2, 11, 1]]))
    expect(m.resumen).toBe('Lunes de 07:00 a 10:00 concentra 10 de 14 casos (71 %). El segundo pico es el viernes a las 17:00 (3 casos). Puede servir para ajustar el horario o enviar un recordatorio.')
  })

  it('el tramo empieza en una hora con casos, aunque haya empate', () => {
    expect(mapaCalor(con([[2, 11, 9]])).resumen).toMatch(/^Martes de 11:00 a 14:00 concentra 9 de 9 casos \(100 %\)\.$|^Martes de 11:00 a 14:00 concentra 9 de 9 casos \(100 %\)\. Puede/)
  })

  it('con un solo caso no hay segundo pico y usa singular', () => {
    const m = mapaCalor(con([[4, 9, 1]]))
    expect(m.resumen).toBe('Jueves de 09:00 a 12:00 concentra 1 de 1 casos (100 %). Puede servir para ajustar el horario o enviar un recordatorio.')
  })

  it('sin casos no inventa un horario', () => {
    const m = mapaCalor(con([]))
    expect(m.mayor).toBe(0)
    expect(m.resumen).toBe('Sin casos en el periodo: no hay un horario que destacar.')
    expect(m.filas.every((f) => f.celdas.every((c) => c.nivel === 0))).toBe(true)
  })
})

describe('mapaCalor · frase corta para la pantalla', () => {
  it('dice el pico y el segundo pico en una línea, y deja la frase larga para el lector de pantalla', () => {
    const m = mapaCalor(con([[1, 7, 4], [1, 8, 6], [5, 17, 3]]))
    expect(m.resumenCorto).toBe('Lunes 07:00–10:00 concentra 10 de 13 casos (77 %). Segundo pico: viernes 17:00.')
    expect(m.resumen).toContain('Puede servir para ajustar el horario')
    expect(m.resumen.length).toBeGreaterThan(m.resumenCorto.length)
  })

  it('sin segundo pico, no lo menciona', () => {
    const m = mapaCalor(con([[2, 9, 5]]))
    expect(m.resumenCorto).toBe('Martes 09:00–12:00 concentra 5 de 5 casos (100 %).')
  })

  it('sin casos lo dice breve', () => {
    expect(mapaCalor(con([])).resumenCorto).toBe('Sin casos en el periodo.')
  })
})
