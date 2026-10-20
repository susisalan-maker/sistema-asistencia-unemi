import { errorDeDecision, fechaHora, justificacionDe, nombreDe, nombreDeTipo, puedeDecidir } from './anomaliasTipos'

describe('anomaliasTipos', () => {
  it('fechaHora muestra día, mes y hora de Ecuador (UTC-5)', () => {
    expect(fechaHora('2026-09-03T13:14:00Z')).toBe('3 sep · 08:14')
    expect(fechaHora('2026-10-20T02:05:00Z')).toBe('19 oct · 21:05')   // cruza de día por la zona horaria
  })

  it('nombra los tipos y deja pasar los desconocidos tal cual', () => {
    expect(nombreDeTipo('fuera_geocerca')).toBe('Marcación fuera de la zona')
    expect(nombreDeTipo('tipo_nuevo')).toBe('tipo_nuevo')
  })

  it('solo se deciden los casos en revisión o sin justificar', () => {
    expect(puedeDecidir('en_revision')).toBe(true)
    expect(puedeDecidir('sin_justificar')).toBe(true)
    for (const e of ['pendiente', 'justificada', 'rechazada'] as const) expect(puedeDecidir(e)).toBe(false)
  })

  it('justificacionDe acepta objeto, lista o nada', () => {
    const j = { decision_final: null } as never
    expect(justificacionDe({ justificaciones: j })).toBe(j)
    expect(justificacionDe({ justificaciones: [j] })).toBe(j)
    expect(justificacionDe({ justificaciones: [] })).toBeNull()
    expect(justificacionDe({ justificaciones: null })).toBeNull()
  })

  it('nombreDe tolera una persona ausente', () => {
    expect(nombreDe({ nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.ec' })).toBe('Ana Pérez')
    expect(nombreDe(null)).toBe('Persona desconocida')
  })

  it('traduce los errores de la base de datos', () => {
    expect(errorDeDecision('Solo un administrador puede decidir un caso')).toMatch(/Solo un administrador/)
    expect(errorDeDecision('El caso ya está resuelto o aún espera la justificación del usuario')).toMatch(/Actualiza la página/)
    expect(errorDeDecision('new row violates check constraint "rechazo_con_comentario"')).toMatch(/escribir un comentario/)
    expect(errorDeDecision('connection reset')).toMatch(/No se pudo guardar/)
  })
})
