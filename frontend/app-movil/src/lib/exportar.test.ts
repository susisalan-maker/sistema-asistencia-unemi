import { api, ApiError } from './api'
import {
  diasDelRango, errorDeRango, exportarMarcaciones, fechaCorta, mensajeDeErrorExportacion, rangoDePeriodo, sumarDias,
} from './exportar'

const mockCrear = jest.fn()
const mockEscribir = jest.fn()
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    uri: string
    constructor(base: string, nombre: string) { this.uri = `${base}${nombre}` }
    create(o: unknown) { mockCrear(this.uri, o) }
    write(c: string, o: unknown) { mockEscribir(this.uri, c, o); return Promise.resolve() }
  },
}))
const mockCompartir = jest.fn()
const mockDisponible = jest.fn()
jest.mock('expo-sharing', () => ({ isAvailableAsync: () => mockDisponible(), shareAsync: (...a: unknown[]) => mockCompartir(...a) }))
jest.mock('./supabase', () => ({ supabase: {} }))
jest.mock('./api', () => ({ ...jest.requireActual('./api'), api: jest.fn() }))

beforeEach(() => { jest.clearAllMocks(); mockDisponible.mockResolvedValue(true) })

describe('fechas de la exportación', () => {
  it('suma días sin correrse al cruzar mes y año', () => {
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28')
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01')
    expect(diasDelRango('2026-10-09', '2026-10-15')).toBe(7)
    expect(diasDelRango('2026-10-15', '2026-10-15')).toBe(1)
  })

  it('calcula los períodos fijos desde hoy', () => {
    expect(rangoDePeriodo('7', '2026-10-15')).toEqual({ desde: '2026-10-09', hasta: '2026-10-15' })
    expect(rangoDePeriodo('30', '2026-10-15')).toEqual({ desde: '2026-09-16', hasta: '2026-10-15' })
    expect(rangoDePeriodo('mes_anterior', '2026-10-15')).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' })
    expect(rangoDePeriodo('mes_anterior', '2026-01-05')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
    expect(rangoDePeriodo('mes_anterior', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' })
  })

  it('valida el rango personalizado: máximo 93 días y sin futuro', () => {
    const hoy = '2026-10-15'
    expect(errorDeRango(null, null, hoy)).toMatch(/Elige/)
    expect(errorDeRango('2026-10-10', '2026-10-01', hoy)).toMatch(/anterior/)
    expect(errorDeRango('2026-10-10', '2026-10-16', hoy)).toMatch(/futuras/)
  })

  it('el límite es de 93 días contando ambos extremos', () => {
    expect(diasDelRango('2026-07-15', '2026-10-15')).toBe(93)
    expect(errorDeRango('2026-07-15', '2026-10-15', '2026-10-15')).toBeNull()
    expect(errorDeRango('2026-07-14', '2026-10-15', '2026-10-15')).toMatch(/93 días/)
  })

  it('escribe la fecha corta', () => {
    expect(fechaCorta('2026-10-05')).toBe('5 oct 2026')
  })
})

describe('exportarMarcaciones', () => {
  const rango = { desde: '2026-10-01', hasta: '2026-10-15' }
  const respuesta = { nombre: 'Marcaciones_2026-10-01_a_2026-10-15.pdf', mime: 'application/pdf', contenido: 'QUJD', total: 12 }

  it('pide el archivo, lo guarda en la carpeta temporal y abre el menú de compartir', async () => {
    jest.mocked(api).mockResolvedValue(respuesta)
    const r = await exportarMarcaciones(rango, 'pdf')
    expect(api).toHaveBeenCalledWith('/marcaciones/exportar?desde=2026-10-01&hasta=2026-10-15&formato=pdf', { esperaMaxMs: 30_000 })
    expect(mockCrear).toHaveBeenCalledWith('file:///cache/Marcaciones_2026-10-01_a_2026-10-15.pdf', { overwrite: true })
    expect(mockEscribir).toHaveBeenCalledWith('file:///cache/Marcaciones_2026-10-01_a_2026-10-15.pdf', 'QUJD', { encoding: 'base64' })
    expect(mockCompartir).toHaveBeenCalledWith(
      'file:///cache/Marcaciones_2026-10-01_a_2026-10-15.pdf',
      expect.objectContaining({ mimeType: 'application/pdf', UTI: 'com.adobe.pdf' }),
    )
    expect(r).toEqual({ total: 12, compartido: true })
  })

  it('en Excel pide xlsx y comparte con su tipo', async () => {
    jest.mocked(api).mockResolvedValue({ ...respuesta, nombre: 'M.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    await exportarMarcaciones(rango, 'xlsx')
    expect(jest.mocked(api).mock.calls[0]![0]).toContain('formato=xlsx')
    expect(mockCompartir).toHaveBeenCalledWith('file:///cache/M.xlsx', expect.objectContaining({ UTI: 'org.openxmlformats.spreadsheetml.sheet' }))
  })

  it('si no hay marcaciones, no guarda ni comparte nada', async () => {
    jest.mocked(api).mockResolvedValue({ ...respuesta, total: 0 })
    expect(await exportarMarcaciones(rango, 'pdf')).toEqual({ total: 0, compartido: false })
    expect(mockEscribir).not.toHaveBeenCalled()
    expect(mockCompartir).not.toHaveBeenCalled()
  })

  it('si el celular no puede compartir, lo dice con claridad', async () => {
    jest.mocked(api).mockResolvedValue(respuesta)
    mockDisponible.mockResolvedValue(false)
    await expect(exportarMarcaciones(rango, 'pdf')).rejects.toThrow(/no permite compartir/)
    expect(mockCompartir).not.toHaveBeenCalled()
  })

  it('traduce los errores a mensajes para la persona', () => {
    expect(mensajeDeErrorExportacion(new ApiError(0, 'x'))).toMatch(/conexión a internet/)
    expect(mensajeDeErrorExportacion(new ApiError(422, 'No puedes exportar fechas futuras'))).toBe('No puedes exportar fechas futuras')
    expect(mensajeDeErrorExportacion(new Error('EACCES /data/...'))).toBe('No se pudo preparar el archivo. Inténtalo de nuevo.')
  })
})
