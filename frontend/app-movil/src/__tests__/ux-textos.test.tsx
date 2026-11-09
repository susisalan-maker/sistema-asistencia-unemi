jest.mock('../lib/supabase', () => ({ supabase: {} }))
import { grupoDeDia, grupoDeSemana, venceEl } from '../lib/anomalias'
import { textoDias } from '../lib/marcacion'

describe('textos de la interfaz', () => {
  it('textoDias resume los días laborables', () => {
    expect(textoDias([1, 2, 3, 4, 5])).toBe('Lunes a viernes')
    expect(textoDias([5, 1, 3])).toBe('Lunes, miércoles, viernes')
    expect(textoDias([6, 7])).toBe('Sábado, domingo')
    expect(textoDias([])).toBe('—')
  })

  it('venceEl da la fecha límite exacta en hora de Ecuador', () => {
    // 2026-11-09 13:05 UTC = lunes 08:05 en Ecuador (UTC-5)
    expect(venceEl('2026-11-09T13:05:00Z')).toBe('lunes 9 nov a las 08:05')
  })

  // «Ahora»: domingo 8 nov 2026, 21:40 en Ecuador (= 02:40 UTC del lunes 9)
  const ahora = new Date('2026-11-09T02:40:00Z')

  it('grupoDeDia: Hoy, Ayer o la fecha', () => {
    expect(grupoDeDia('2026-11-09T01:00:00Z', ahora)).toBe('Hoy')      // 20:00 del domingo 8
    expect(grupoDeDia('2026-11-07T20:00:00Z', ahora)).toBe('Ayer')     // 15:00 del sábado 7
    expect(grupoDeDia('2026-11-05T20:00:00Z', ahora)).toBe('5 nov')
  })

  it('grupoDeSemana: de lunes a domingo', () => {
    expect(grupoDeSemana('2026-11-03T20:00:00Z', ahora)).toBe('Esta semana')     // martes 3
    expect(grupoDeSemana('2026-11-02T06:00:00Z', ahora)).toBe('Esta semana')     // lunes 2, 01:00
    expect(grupoDeSemana('2026-11-01T20:00:00Z', ahora)).toBe('Semana pasada')   // domingo 1
    expect(grupoDeSemana('2026-10-26T20:00:00Z', ahora)).toBe('Semana pasada')   // lunes 26
    expect(grupoDeSemana('2026-10-25T20:00:00Z', ahora)).toBe('Antes')           // domingo 25
  })
})
