import { PARAMETROS, aEntero, cambiosDe, erroresDe, errorDeValor, horasATexto, porClave, valoresDeFabrica } from './configuracionTipos'

describe('configuracionTipos', () => {
  it('los valores de fábrica son los de la base', () => {
    expect(valoresDeFabrica()).toEqual({
      tolerancia_min: 10, almuerzo_max_min: 60, plazo_justificacion_h: 48, plazo_revision_h: 48, velocidad_max_kmh: 120, max_marcaciones_web_30d: 3,
    })
  })

  it('cada valor de fábrica cae dentro de su propio rango', () => {
    for (const p of PARAMETROS) expect(errorDeValor(p, String(p.defecto))).toBeNull()
  })

  it('solo acepta enteros dentro del rango', () => {
    const almuerzo = porClave('almuerzo_max_min')
    expect(errorDeValor(almuerzo, '14')).toMatch(/entre 15 y 180/)
    expect(errorDeValor(almuerzo, '181')).not.toBeNull()
    expect(errorDeValor(almuerzo, '15')).toBeNull()
    expect(errorDeValor(almuerzo, '45,5')).not.toBeNull()
    expect(errorDeValor(almuerzo, '-5')).not.toBeNull()
    expect(errorDeValor(almuerzo, '')).not.toBeNull()
    expect(errorDeValor(almuerzo, 'abc')).not.toBeNull()
    expect(aEntero(' 60 ')).toBe(60)
    expect(aEntero('1e3')).toBeNull()
  })

  it('la tolerancia puede ser cero', () => {
    expect(errorDeValor(porClave('tolerancia_min'), '0')).toBeNull()
  })

  it('las horas se leen también en días', () => {
    expect(horasATexto(5)).toBe('5 h')
    expect(horasATexto(24)).toBe('1 día')
    expect(horasATexto(48)).toBe('2 días')
    expect(horasATexto(36)).toBe('1 día 12 h')
  })

  it('erroresDe y cambiosDe cuentan solo lo que corresponde', () => {
    const base = valoresDeFabrica()
    const textos = { ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)])), tolerancia_min: '15', velocidad_max_kmh: 'x' } as never
    expect(Object.keys(erroresDe(textos))).toEqual(['velocidad_max_kmh'])
    expect(cambiosDe(base, textos).map((c) => [c.clave, c.antes, c.despues])).toEqual([['tolerancia_min', 10, 15]])
  })
})
