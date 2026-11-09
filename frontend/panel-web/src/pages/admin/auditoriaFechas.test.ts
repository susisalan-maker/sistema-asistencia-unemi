import { describe, expect, it } from 'vitest'
import { diaEcuador, fechaLarga, fechaYHoraLarga, horaEcuador, relativo, tituloDeDia } from './auditoriaFechas'

describe('diaEcuador y horaEcuador', () => {
  it('usan la hora de Ecuador, aunque en UTC ya sea otro día', () => {
    expect(diaEcuador('2026-11-06T03:30:00Z')).toBe('2026-11-05')
    expect(horaEcuador('2026-11-06T03:30:00Z')).toBe('22:30')
    expect(horaEcuador('2026-11-05T05:00:00Z')).toBe('00:00')
  })
  it('una fecha inválida da vacío', () => {
    expect(diaEcuador('ayer')).toBe('')
    expect(horaEcuador('ayer')).toBe('')
    expect(fechaYHoraLarga('ayer')).toBe('')
  })
})

describe('títulos de día', () => {
  it('«Hoy», «Ayer» y, antes, solo la fecha con su día de la semana', () => {
    expect(tituloDeDia('2026-11-08', '2026-11-08')).toBe('Hoy · domingo 8 de noviembre')
    expect(tituloDeDia('2026-11-07', '2026-11-08')).toBe('Ayer · sábado 7 de noviembre')
    expect(tituloDeDia('2026-11-04', '2026-11-08')).toBe('Miércoles 4 de noviembre')
  })
  it('con otro año lo dice', () => {
    expect(tituloDeDia('2025-12-31', '2026-01-02')).toBe('Miércoles 31 de diciembre de 2025')
    expect(fechaLarga('2026-03-01')).toBe('domingo 1 de marzo')
  })
  it('«Ayer» cruza el cambio de mes y de año', () => {
    expect(tituloDeDia('2026-10-31', '2026-11-01')).toBe('Ayer · sábado 31 de octubre')
    expect(tituloDeDia('2025-12-31', '2026-01-01')).toBe('Ayer · miércoles 31 de diciembre de 2025')
  })
})

describe('relativo', () => {
  const ahora = new Date('2026-11-08T22:12:00Z')   // 17:12 en Ecuador
  it('minutos y horas el mismo día', () => {
    expect(relativo('2026-11-08T22:12:00Z', ahora)).toBe('ahora')
    expect(relativo('2026-11-08T21:52:00Z', ahora)).toBe('hace 20 min')
    expect(relativo('2026-11-08T20:00:00Z', ahora)).toBe('hace 2 h')
  })
  it('«ayer» y días; pasado un mes no dice nada', () => {
    expect(relativo('2026-11-07T16:05:00Z', ahora)).toBe('ayer')
    expect(relativo('2026-11-03T16:05:00Z', ahora)).toBe('hace 5 días')
    expect(relativo('2026-09-03T16:05:00Z', ahora)).toBe('')
  })
  it('cuenta los días en hora de Ecuador: a las 22:30 de ayer en Ecuador ya es «ayer» aunque en UTC sea hoy', () => {
    expect(relativo('2026-11-08T03:30:00Z', new Date('2026-11-08T15:00:00Z'))).toBe('ayer')
  })
  it('un instante en el futuro o inválido no rompe', () => {
    expect(relativo('2026-11-08T22:30:00Z', ahora)).toBe('ahora')
    expect(relativo('x', ahora)).toBe('')
  })
})

describe('fechaYHoraLarga', () => {
  it('lleva día de la semana, año y hora de Ecuador', () => {
    expect(fechaYHoraLarga('2026-11-07T14:14:00Z')).toBe('Sábado 7 de noviembre de 2026 · 09:14 (hora de Ecuador)')
  })
})
