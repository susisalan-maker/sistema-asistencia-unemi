import { ApiError, api } from './api'
import { fotoConProblema, registrarRostro } from './rostro'

jest.mock('./supabase', () => ({ supabase: {} }))
jest.mock('./api', () => ({ ...jest.requireActual('./api'), api: jest.fn() }))

beforeEach(() => jest.mocked(api).mockReset())

describe('fotoConProblema', () => {
  it('saca el número de la foto del mensaje del servidor', () => {
    expect(fotoConProblema('Foto 2: La foto salió borrosa. Sostén firme el celular')).toBe(2)
    expect(fotoConProblema('Foto 10: algo')).toBe(10)
  })
  it('devuelve null si el error no es de una foto', () => {
    expect(fotoConProblema('Las fotos no parecen ser de la misma persona.')).toBeNull()
    expect(fotoConProblema('Hay una Foto 2: en medio')).toBeNull()
  })
})

describe('registrarRostro', () => {
  it('envía el consentimiento y las fotos con más tiempo de espera', async () => {
    jest.mocked(api).mockResolvedValue({ rostro_registrado: true })
    expect(await registrarRostro(['a', 'b', 'c'])).toEqual({ ok: true })
    expect(api).toHaveBeenCalledWith('/rostro/registro', {
      method: 'POST', body: { consentimiento: true, fotos: ['a', 'b', 'c'] }, esperaMaxMs: 45_000,
    })
  })
  it('devuelve el motivo y la foto con problema', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(422, 'Foto 3: Hay muy poca luz.'))
    expect(await registrarRostro(['a', 'b', 'c'])).toEqual({ ok: false, mensaje: 'Foto 3: Hay muy poca luz.', foto: 3 })
  })
  it('con un error que no es de la API da un mensaje genérico', async () => {
    jest.mocked(api).mockRejectedValue(new TypeError('x'))
    expect(await registrarRostro(['a'])).toEqual({ ok: false, mensaje: 'No se pudo registrar tu rostro. Inténtalo de nuevo.', foto: null })
  })
})
