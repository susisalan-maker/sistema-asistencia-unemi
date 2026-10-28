import {
  PARAMETROS, PARAMETROS_ROSTRO, aEntero, aNumero, cambiosDe, erroresDe, errorDeValor, horasATexto, porClave, valorATexto, valoresDeFabrica,
} from './configuracionTipos'

describe('configuracionTipos', () => {
  it('los valores de fábrica son los de la base', () => {
    expect(valoresDeFabrica()).toEqual({
      tolerancia_min: 10, almuerzo_max_min: 60, plazo_justificacion_h: 48, plazo_revision_h: 48, velocidad_max_kmh: 120, max_marcaciones_web_30d: 3, max_horas_sin_conexion: 48, precision_max_app_m: 50, precision_max_web_m: 200,
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

  describe('reconocimiento facial', () => {
    it('los valores de fábrica son los de la migración 0009', () => {
      expect(valoresDeFabrica(PARAMETROS_ROSTRO)).toEqual({
        rostro_umbral: 0.4, rostro_umbral_registro: 0.35, vida_umbral: 0.5, giro_max_registro_frente: 0.3, giro_max_registro_leve: 0.6,
        giro_max_marcacion: 0.4, brillo_min: 50, brillo_max: 215, nitidez_min: 40, rostro_min_px: 90, foto_min_px: 200,
      })
    })

    it('cada valor de fábrica cae dentro de su rango y los de Parámetros no se mezclan', () => {
      for (const p of PARAMETROS_ROSTRO) expect(errorDeValor(p, valorATexto(p, p.defecto))).toBeNull()
      expect(PARAMETROS_ROSTRO.some((p) => PARAMETROS.includes(p))).toBe(false)
    })

    it('aNumero acepta punto o coma y respeta los decimales permitidos', () => {
      expect(aNumero('0.4', 2)).toBe(0.4)
      expect(aNumero(' 0,55 ', 2)).toBe(0.55)
      expect(aNumero('1', 2)).toBe(1)
      expect(aNumero('0.123', 2)).toBeNull()
      expect(aNumero('.5', 2)).toBeNull()
      expect(aNumero('-0.5', 2)).toBeNull()
      expect(aNumero('abc', 2)).toBeNull()
      expect(aNumero('45,5', 0)).toBeNull()      // sin decimales, solo enteros
      expect(aNumero('45', 0)).toBe(45)
    })

    it('valorATexto muestra los decimales que corresponden', () => {
      expect(valorATexto(porClave('rostro_umbral'), 0.4)).toBe('0.40')
      expect(valorATexto(porClave('rostro_umbral'), 0.5)).toBe('0.50')
      expect(valorATexto(porClave('brillo_min'), 50)).toBe('50')
    })

    it('el rango de un decimal se explica con sus decimales', () => {
      const p = porClave('rostro_umbral')
      expect(errorDeValor(p, '0.09')).toBe('Escribe un número entre 0.10 y 0.95 (hasta 2 decimales)')
      expect(errorDeValor(p, '0.96')).not.toBeNull()
      expect(errorDeValor(p, '0.10')).toBeNull()
      expect(errorDeValor(p, '0.95')).toBeNull()
    })

    it('la luz mínima debe ser menor que la máxima', () => {
      const textos = { ...Object.fromEntries(Object.entries(valoresDeFabrica(PARAMETROS_ROSTRO)).map(([k, v]) => [k, String(v)])), brillo_min: '215' }
      expect(erroresDe(textos, PARAMETROS_ROSTRO)).toEqual({ brillo_max: 'Debe ser mayor que la luz mínima' })
      expect(erroresDe({ ...textos, brillo_min: '214' }, PARAMETROS_ROSTRO)).toEqual({})
    })

    it('cambiosDe compara números aunque lleguen distintos de como se escriben', () => {
      const base = valoresDeFabrica(PARAMETROS_ROSTRO)
      const textos = { ...Object.fromEntries(Object.entries(base).map(([k, v]) => [k, String(v)])), rostro_umbral: '0,40', vida_umbral: '0.6' }
      const c = cambiosDe(base, textos, PARAMETROS_ROSTRO)
      expect(c.map((x) => [x.clave, x.antesTexto, x.despuesTexto])).toEqual([['vida_umbral', '0.50', '0.60']])
    })
  })
})
