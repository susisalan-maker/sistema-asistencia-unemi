import { formatoDistancia, htmlDelMapa } from './mapa'

describe('formatoDistancia', () => {
  it('metros por debajo de 1 km y kilómetros con coma decimal', () => {
    expect(formatoDistancia(42.4)).toBe('42 m')
    expect(formatoDistancia(999)).toBe('999 m')
    expect(formatoDistancia(1000)).toBe('1 km')
    expect(formatoDistancia(7543)).toBe('7,5 km')
    expect(formatoDistancia(111_000)).toBe('111 km')
  })
})

describe('htmlDelMapa', () => {
  const base = { centro: { latitud: -2.14, longitud: -79.6 }, radio_m: 150, usuario: { latitud: -2.141, longitud: -79.601 }, dentro: true }

  it('lleva el círculo y la posición como datos, con OpenStreetMap y Leaflet', () => {
    const html = htmlDelMapa(base)
    expect(html).toContain('"c":[-2.14,-79.6]')
    expect(html).toContain('"r":150')
    expect(html).toContain('"u":[-2.141,-79.601]')
    expect(html).toContain('tile.openstreetmap.org')
    expect(html).toContain('leaflet@1.9.4')
  })

  it('sin posición solo dibuja la zona', () => {
    expect(htmlDelMapa({ ...base, usuario: null })).toContain('"u":null')
  })

  it('un valor no numérico no rompe la página', () => {
    expect(htmlDelMapa({ ...base, radio_m: NaN })).toContain('"r":0')
  })
})
