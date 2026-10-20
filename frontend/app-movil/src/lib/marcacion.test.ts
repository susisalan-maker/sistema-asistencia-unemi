import { avisoDeAnomalia, diaLargo, horaLocal, nombreDeTipo, TIPOS, verboDeTipo } from './marcacion'

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
    expect(avisoDeAnomalia('algo_nuevo')).toMatch(/observación/)
  })
})
