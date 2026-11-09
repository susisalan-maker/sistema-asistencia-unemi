jest.mock('../lib/supabase', () => ({ supabase: {} }))
import { venceEl } from '../lib/anomalias'
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
})
