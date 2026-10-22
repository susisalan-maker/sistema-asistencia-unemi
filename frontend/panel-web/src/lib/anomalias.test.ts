vi.mock('./api', () => ({ api: vi.fn() }))

import {
  cierreDeConversacion, etiquetaDia, fechaCorta, fechaHoraLocal, iconoDeAnomalia, mensajeInicial, nombreDeAnomalia, problemaDeTexto, RESPUESTA_MIN, TEXTO_MAX, TEXTO_MIN, tiempoRestante,
} from './anomalias'

describe('nombreDeAnomalia', () => {
  it('traduce cada tipo y cae a un texto genérico con uno desconocido', () => {
    expect(nombreDeAnomalia('sin_ingreso')).toBe('No marcaste ese día')
    expect(nombreDeAnomalia('sin_regreso_almuerzo')).toBe('Falta el regreso del almuerzo')
    expect(nombreDeAnomalia('algo_nuevo')).toBe('Observación en tu asistencia')
  })
})

describe('problemaDeTexto', () => {
  it('exige entre 10 y 1000 caracteres sin contar espacios a los lados', () => {
    expect(problemaDeTexto('')).toMatch(/al menos 10.*llevas 0/)
    expect(problemaDeTexto('   corto   ')).toMatch(/llevas 5/)
    expect(problemaDeTexto('x'.repeat(TEXTO_MIN))).toBeNull()
    expect(problemaDeTexto(` ${'x'.repeat(TEXTO_MAX)} `)).toBeNull()
    expect(problemaDeTexto('x'.repeat(TEXTO_MAX + 1))).toMatch(/máximo 1000/)
  })
})

describe('problemaDeTexto · respuesta a la repregunta', () => {
  it('acepta respuestas cortas pero no vacías', () => {
    expect(problemaDeTexto('Sí', true)).toBeNull()
    expect(problemaDeTexto(' no ', true)).toBeNull()
    expect(problemaDeTexto('x', true)).toMatch(/al menos 2.*llevas 1/)
    expect(problemaDeTexto('   ', true)).toMatch(/llevas 0/)
    expect(problemaDeTexto('x'.repeat(TEXTO_MAX + 1), true)).toMatch(/máximo 1000/)
    expect(RESPUESTA_MIN).toBe(2)
  })
})

describe('fechaHoraLocal', () => {
  it('muestra día/mes y hora de Ecuador (UTC-5)', () => {
    expect(fechaHoraLocal('2026-10-15T13:05:00+00:00')).toBe('15/10 08:05')
    expect(fechaHoraLocal('2026-10-16T03:30:00+00:00')).toBe('15/10 22:30')      // aún es el 15 en Ecuador
    expect(fechaHoraLocal('2026-01-01T02:00:00+00:00')).toBe('31/12 21:00')
  })
})

describe('tiempoRestante', () => {
  const ahora = new Date('2026-10-15T12:00:00Z')
  const en = (min: number) => new Date(ahora.getTime() + min * 60_000).toISOString()
  it('formatea minutos, horas y días', () => {
    expect(tiempoRestante(en(40), ahora)).toBe('40 min')
    expect(tiempoRestante(en(135), ahora)).toBe('2 h 15 min')
    expect(tiempoRestante(en(180), ahora)).toBe('3 h')
    expect(tiempoRestante(en(48 * 60 - 1), ahora)).toBe('47 h')
  })
  it('es null cuando ya venció', () => {
    expect(tiempoRestante(en(0), ahora)).toBeNull()
    expect(tiempoRestante(en(-30), ahora)).toBeNull()
  })
})

describe('fechaCorta y etiquetaDia', () => {
  it('usan el día de Ecuador', () => {
    expect(fechaCorta('2026-08-26T15:00:00+00:00')).toBe('26 ago')
    expect(fechaCorta('2026-09-04T03:00:00+00:00')).toBe('3 sep')
  })
  it('dicen Hoy cuando es el mismo día local y la fecha en otro caso', () => {
    const ahora = new Date('2026-10-15T20:00:00Z')
    expect(etiquetaDia('2026-10-15T13:05:00+00:00', ahora)).toBe('Hoy · 08:05')
    expect(etiquetaDia('2026-10-14T13:05:00+00:00', ahora)).toBe('14 oct · 08:05')
  })
})

describe('mensajeInicial', () => {
  it('cita el detalle sin el punto final', () => {
    expect(mensajeInicial({ tipo: 'sin_ingreso', detalle: 'No registraste tu ingreso el 14 de octubre.' }))
      .toBe('Detectamos lo siguiente: No registraste tu ingreso el 14 de octubre. ¿Qué ocurrió?')
  })
  it('sin detalle usa el nombre del tipo', () => {
    expect(mensajeInicial({ tipo: 'sin_ingreso', detalle: null })).toMatch(/no marcaste ese día/)
  })
})

describe('cierreDeConversacion', () => {
  it('describe cómo terminó cada estado', () => {
    expect(cierreDeConversacion('en_revision')).toMatch(/en revisión/)
    expect(cierreDeConversacion('justificada')).toMatch(/aceptado/)
    expect(cierreDeConversacion('rechazada')).toMatch(/rechazado/)
    expect(cierreDeConversacion('sin_justificar')).toMatch(/plazo/)
  })
})

describe('iconoDeAnomalia', () => {
  it('devuelve un símbolo para cualquier tipo', () => {
    expect(iconoDeAnomalia('sin_ingreso')).toBeTruthy()
    expect(iconoDeAnomalia('desconocido')).toBeTruthy()
  })
})
