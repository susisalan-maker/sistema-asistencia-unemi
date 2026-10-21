import { distanciaMetros, formatoCoordenada, latitudValida, leerZona, longitudValida, parseCoordenada, RADIO_BLOQUE, RADIO_SEDE } from './geo'

describe('parseCoordenada', () => {
  it('acepta punto o coma decimal y signos', () => {
    expect(parseCoordenada('-2.14')).toBe(-2.14)
    expect(parseCoordenada('-2,14')).toBe(-2.14)
    expect(parseCoordenada('  79 ')).toBe(79)
  })
  it('rechaza texto, notación científica y vacío', () => {
    for (const malo of ['', ' ', 'abc', '1e3', '0x10', '2.', '.5', '1.2.3', '--1', '-']) {
      expect(parseCoordenada(malo), malo).toBeNull()
    }
  })
})

describe('rangos', () => {
  it('latitud y longitud con sus límites exactos', () => {
    expect(latitudValida(90)).toBe(true)
    expect(latitudValida(-90)).toBe(true)
    expect(latitudValida(90.0001)).toBe(false)
    expect(longitudValida(180)).toBe(true)
    expect(longitudValida(-180.5)).toBe(false)
    expect(latitudValida(null)).toBe(false)
  })
})

describe('formatoCoordenada', () => {
  it('limita a 6 decimales sin ceros sobrantes', () => {
    expect(formatoCoordenada(-2.123456789)).toBe('-2.123457')
    expect(formatoCoordenada(-2.5)).toBe('-2.5')
  })
})

describe('distanciaMetros', () => {
  it('es 0 entre el mismo punto', () => {
    expect(distanciaMetros({ lat: -2.14, lon: -79.6 }, { lat: -2.14, lon: -79.6 })).toBe(0)
  })
  it('un grado de latitud mide unos 111.2 km', () => {
    const d = distanciaMetros({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })
    expect(d).toBeGreaterThan(111_000)
    expect(d).toBeLessThan(111_400)
  })
  it('Guayaquil–Quito está a unos 270 km', () => {
    const d = distanciaMetros({ lat: -2.1894, lon: -79.8891 }, { lat: -0.1807, lon: -78.4678 })
    expect(d / 1000).toBeGreaterThan(260)
    expect(d / 1000).toBeLessThan(280)
  })
  it('es simétrica', () => {
    const a = { lat: -2.14, lon: -79.6 }
    const b = { lat: -2.15, lon: -79.61 }
    expect(distanciaMetros(a, b)).toBeCloseTo(distanciaMetros(b, a), 6)
  })
})

describe('leerZona', () => {
  const ok = { lat: '-2.14', lon: '-79.6', radio: 300 }
  it('devuelve números cuando todo es válido', () => {
    expect(leerZona(ok, RADIO_SEDE)).toEqual({ lat: -2.14, lon: -79.6, radio: 300 })
  })
  it('explica qué campo falla', () => {
    expect(leerZona({ ...ok, lat: '' }, RADIO_SEDE)).toMatch(/latitud/i)
    expect(leerZona({ ...ok, lat: '91' }, RADIO_SEDE)).toMatch(/latitud/i)
    expect(leerZona({ ...ok, lon: 'abc' }, RADIO_SEDE)).toMatch(/longitud/i)
    expect(leerZona({ ...ok, lon: '-181' }, RADIO_SEDE)).toMatch(/longitud/i)
  })
  it('valida el radio según sea sede o bloque', () => {
    expect(leerZona({ ...ok, radio: 49 }, RADIO_SEDE)).toMatch(/entre 50 y 1000/)
    expect(leerZona({ ...ok, radio: 1001 }, RADIO_SEDE)).toMatch(/entre 50 y 1000/)
    expect(leerZona({ ...ok, radio: 20 }, RADIO_BLOQUE)).toEqual({ lat: -2.14, lon: -79.6, radio: 20 })
    expect(leerZona({ ...ok, radio: 201 }, RADIO_BLOQUE)).toMatch(/entre 20 y 200/)
    expect(leerZona({ ...ok, radio: 60.5 }, RADIO_BLOQUE)).toMatch(/entre 20 y 200/)
  })
})
