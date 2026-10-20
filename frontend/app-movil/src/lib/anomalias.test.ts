jest.mock('./supabase', () => ({ supabase: {} }))

import {
  explicacionDeEstado, fechaHoraLocal, nombreDeAnomalia, problemaDeTexto, TEXTO_MAX, TEXTO_MIN, tiempoRestante,
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

describe('explicacionDeEstado', () => {
  it('cambia según el estado y el plazo', () => {
    expect(explicacionDeEstado({ estado: 'pendiente', puede_justificar: true })).toMatch(/Cuéntanos qué pasó/)
    expect(explicacionDeEstado({ estado: 'pendiente', puede_justificar: false })).toMatch(/plazo/)
    expect(explicacionDeEstado({ estado: 'en_revision', puede_justificar: false })).toMatch(/en revisión/)
    expect(explicacionDeEstado({ estado: 'rechazada', puede_justificar: false })).toMatch(/no fue aceptada/)
  })
})
