import {
  avisoDeAnomalia, cuandoFue, diaLargo, fechaConDia, guardadoDe, horaLocal, hoyLocal, nombreDeTipo, registradoDe, rotuloDeDia, simboloDeTipo, TIPOS, verboDeTipo,
} from './marcacion'

describe('marcacion', () => {
  it('las cuatro marcaciones van en el orden de la jornada', () => {
    expect(TIPOS.map((t) => t.tipo)).toEqual(['ingreso', 'salida_almuerzo', 'entrada_almuerzo', 'salida'])
  })

  it('nombres y verbos en español, con un valor de respaldo para tipos desconocidos', () => {
    expect(nombreDeTipo('entrada_almuerzo')).toBe('Regreso del almuerzo')
    expect(verboDeTipo('salida')).toBe('Marcar salida')
    expect(nombreDeTipo('otra')).toBe('otra')
    expect(verboDeTipo('otra')).toBe('Marcar')
  })

  it('la hora se muestra en hora de Ecuador (UTC-5), no la del celular', () => {
    expect(horaLocal('2026-10-15T13:05:00+00:00')).toBe('08:05')
    expect(horaLocal('2026-10-15T08:05:00-05:00')).toBe('08:05')
    expect(horaLocal('2026-10-16T03:30:00+00:00')).toBe('22:30')   // el día anterior en Ecuador
    expect(horaLocal('2026-10-15T05:00:00+00:00')).toBe('00:00')
  })

  it('el día se escribe sin correrse por la zona horaria', () => {
    expect(diaLargo('2026-10-15')).toBe('jueves, 15 de octubre')
    expect(diaLargo('2026-01-01')).toBe('jueves, 1 de enero')
    expect(diaLargo('2026-12-31')).toBe('jueves, 31 de diciembre')
  })

  it('cada anomalía conocida tiene su aviso y las nuevas no rompen la pantalla', () => {
    expect(avisoDeAnomalia('fuera_geocerca')).toMatch(/fuera de la zona/)
    expect(avisoDeAnomalia('dia_no_laborable')).toMatch(/no es un día laborable/)
    expect(avisoDeAnomalia('verificacion_fallida')).toMatch(/una persona revisará/)
    expect(avisoDeAnomalia('algo_nuevo')).toMatch(/observación/)
  })
})

describe('fechas del inicio y del historial', () => {
  it('hoyLocal usa el día de Ecuador', () => {
    expect(hoyLocal(new Date('2026-10-16T03:30:00Z'))).toBe('2026-10-15')
    expect(hoyLocal(new Date('2026-10-16T05:30:00Z'))).toBe('2026-10-16')
  })
  it('fechaConDia arma «Jueves, 15 de octubre»', () => {
    expect(fechaConDia('2026-10-15')).toBe('Jueves, 15 de octubre')
    expect(fechaConDia('2026-09-03')).toBe('Jueves, 3 de septiembre')
  })
  it('rotuloDeDia dice Hoy o el día de la semana', () => {
    expect(rotuloDeDia('2026-10-15', '2026-10-15')).toBe('Hoy · 15 oct')
    expect(rotuloDeDia('2026-10-12', '2026-10-15')).toBe('Lunes · 12 oct')
  })
  it('cuandoFue dice hoy, ayer o la fecha', () => {
    const ahora = new Date('2026-10-15T20:00:00Z')
    expect(cuandoFue('2026-10-15T13:11:00Z', ahora)).toBe('hoy 08:11')
    expect(cuandoFue('2026-10-14T22:04:00Z', ahora)).toBe('ayer 17:04')
    expect(cuandoFue('2026-10-10T22:04:00Z', ahora)).toBe('10 oct 17:04')
  })
  it('flechas y género del participio', () => {
    expect(simboloDeTipo('ingreso')).toBe('↓')
    expect(simboloDeTipo('entrada_almuerzo')).toBe('↓')
    expect(simboloDeTipo('salida')).toBe('↑')
    expect(simboloDeTipo('salida_almuerzo')).toBe('↑')
    expect(registradoDe('ingreso')).toBe('Ingreso registrado')
    expect(registradoDe('salida_almuerzo')).toBe('Salida a almorzar registrada')
    expect(registradoDe('entrada_almuerzo')).toBe('Regreso del almuerzo registrado')
    expect(guardadoDe('ingreso')).toBe('Ingreso guardado')
    expect(guardadoDe('salida')).toBe('Salida guardada')
    expect(guardadoDe('salida_almuerzo')).toBe('Salida a almorzar guardada')
    expect(guardadoDe('entrada_almuerzo')).toBe('Regreso del almuerzo guardado')
  })
})
