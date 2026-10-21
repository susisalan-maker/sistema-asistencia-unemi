import { buscarLugares, interpretarRespuesta } from './buscarLugares'

const feature = (props: Record<string, string>, coords: [number, number] = [-79.5894, -2.1362]) => ({
  geometry: { coordinates: coords }, properties: props,
})

describe('interpretarRespuesta', () => {
  it('convierte [lon, lat] en lat/lon y arma el detalle sin repetidos', () => {
    const r = interpretarRespuesta({
      features: [feature({ name: 'Universidad Estatal de Milagro', city: 'Milagro', state: 'Guayas', country: 'Ecuador', countrycode: 'EC' })],
    })
    expect(r).toEqual([{ nombre: 'Universidad Estatal de Milagro', detalle: 'Milagro, Guayas', lat: -2.1362, lon: -79.5894 }])
    const repetido = interpretarRespuesta({ features: [feature({ name: 'X', city: 'Guayaquil', county: 'Guayaquil', state: 'Guayas' })] })
    expect(repetido[0].detalle).toBe('Guayaquil, Guayas')
  })

  it('descarta resultados de otros países, sin coordenadas o sin nombre', () => {
    const r = interpretarRespuesta({
      features: [
        feature({ name: 'Universidad de Lima', countrycode: 'PE' }),
        { properties: { name: 'Sin punto' } },
        feature({ name: 'Mal punto' }, [NaN, 1]),
        feature({ city: 'Solo ciudad' }),
        feature({ name: 'Universidad ECOTEC', countrycode: 'ec' }),
      ],
    })
    expect(r.map((l) => l.nombre)).toEqual(['Universidad ECOTEC'])
  })

  it('usa calle y número si el lugar no tiene nombre', () => {
    expect(interpretarRespuesta({ features: [feature({ street: 'Av. 9 de Octubre', housenumber: '100' })] })[0].nombre).toBe('Av. 9 de Octubre 100')
  })

  it('una respuesta vacía da lista vacía', () => {
    expect(interpretarRespuesta({})).toEqual([])
  })
})

describe('buscarLugares', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('consulta con el texto, límite y recuadro de Ecuador, y devuelve los lugares', async () => {
    const fetchFalso = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [feature({ name: 'Universidad de Guayaquil', countrycode: 'EC' })] }) })
    vi.stubGlobal('fetch', fetchFalso)
    const r = await buscarLugares('  universidad guayaquil ')
    const url = new URL(String(fetchFalso.mock.calls[0][0]))
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/')
    expect(url.searchParams.get('q')).toBe('universidad guayaquil')
    expect(url.searchParams.get('limit')).toBe('6')
    expect(url.searchParams.get('bbox')).toBe('-81.1,-5.1,-75.1,1.5')
    expect(r).toHaveLength(1)
  })

  it('si el servicio responde con error lanza una excepción', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }))
    await expect(buscarLugares('milagro')).rejects.toThrow('429')
  })
})
