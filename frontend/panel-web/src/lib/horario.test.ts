import { diasDelFeriado, fechaLarga, horaCorta, resumenHorario, textoDias, validarHorario, validarRangoFeriado } from './horario'

describe('textoDias', () => {
  it.each([
    [[1, 2, 3, 4, 5], 'lunes a viernes'],
    [[1, 2, 3, 4, 5, 6, 7], 'lunes a domingo'],
    [[1, 3, 5], 'lunes, miércoles, viernes'],
    [[6, 7], 'sábado, domingo'],
    [[5, 1, 3, 2, 4], 'lunes a viernes'],
    [[2], 'martes'],
  ])('%j → %s', (dias, texto) => expect(textoDias(dias)).toBe(texto))
})

describe('horario', () => {
  it('acorta la hora que llega con segundos', () => expect(horaCorta('08:00:00')).toBe('08:00'))
  it('resume jornada y días', () => expect(resumenHorario('08:00:00', '17:00:00', [1, 2, 3, 4, 5])).toBe('08:00–17:00 · lunes a viernes'))

  it('valida el horario', () => {
    expect(validarHorario('08:00', '17:00', [1])).toBeNull()
    expect(validarHorario('', '17:00', [1])).toMatch(/hora de entrada/)
    expect(validarHorario('17:00', '17:00', [1])).toMatch(/después de la entrada/)
    expect(validarHorario('18:00', '08:00', [1])).toMatch(/después de la entrada/)
    expect(validarHorario('08:00', '17:00', [])).toMatch(/al menos un día/)
  })
})

describe('fechaLarga', () => {
  it('no corre la fecha un día por la zona horaria', () => {
    const t = fechaLarga('2026-11-02')
    expect(t).toMatch(/lunes/)
    expect(t).toMatch(/2 de noviembre de 2026/)
  })
  it('lee el día de la semana correcto', () => expect(fechaLarga('2026-10-17')).toMatch(/sábado/))
})

describe('feriados · rango', () => {
  it('cuenta el primer y el último día', () => {
    expect(diasDelFeriado('2026-11-02', '2026-11-02')).toBe(1)
    expect(diasDelFeriado('2026-10-31', '2026-11-03')).toBe(4)
    expect(diasDelFeriado('2026-02-27', '2026-03-02')).toBe(4)   // cruza fin de mes sin cambios de horario
  })
  it.each([
    ['', '', 'Elige la fecha'],
    ['2026-11-02', '2026-11-01', 'no puede ser anterior'],
    ['2026-11-02', '2026-12-03', 'máximo 31 días'],
  ])('rechaza %s → %s', (ini, fin, texto) => expect(validarRangoFeriado(ini, fin)).toContain(texto))
  it.each([
    ['2026-11-02', ''],            // un solo día: sin «hasta»
    ['2026-11-02', '2026-11-02'],
    ['2026-11-02', '2026-12-02'],  // 31 días exactos
  ])('acepta %s → %s', (ini, fin) => expect(validarRangoFeriado(ini, fin)).toBeNull())
})
