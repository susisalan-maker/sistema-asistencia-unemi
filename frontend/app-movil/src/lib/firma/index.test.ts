import { Platform } from 'react-native'
import { ApiError, api } from '../api'
import { crearNativoFalso, modulo, type NativoFalso } from './ayudasDePrueba'
import { ErrorDeFirma, MENSAJE_CLAVE_DISTINTA, firmarMarcacion, olvidarRechazos, puedeFirmar, sincronizarClave } from './index'
import { desafioDeClave, mensajeDeMarcacion } from './mensaje'

jest.mock('expo-crypto', () => require('./ayudasDePrueba').expoCryptoFalso())
jest.mock('../supabase', () => ({ supabase: {} }))
jest.mock('../api', () => ({ ...jest.requireActual('../api'), api: jest.fn() }))
// El «módulo nativo» lo pone cada prueba (null = una compilación que no lo trae, como Expo Go).
jest.mock('../../../modules/firma-dispositivo', () => ({ __esModule: true, get default() { return require('./ayudasDePrueba').modulo.actual } }))

const ALIAS = 'asistencia.marca.u-1'
const DATOS = {
  id: 'm-1', tipo: 'ingreso', fecha_hora: '2026-10-15T08:00:00.000-05:00', latitud: -2.14, longitud: -79.6,
  dispositivo_id: 'android:cel-1', selfie_b64: 'FOTO',
}
let nativo: NativoFalso

beforeEach(() => {
  nativo = crearNativoFalso()
  modulo.actual = nativo
  olvidarRechazos()
  jest.mocked(api).mockReset()
  jest.mocked(api).mockResolvedValue({ clave: 'registrada' } as never)
})
afterEach(() => { jest.restoreAllMocks() })

describe('firmarMarcacion', () => {
  it('firma con la clave del celular y la firma se verifica con la clave pública', async () => {
    await nativo.crearClaveAsync(ALIAS, 'x')
    const firma = await firmarMarcacion('u-1', DATOS)
    expect(firma).toEqual(expect.any(String))
    const mensaje = await mensajeDeMarcacion({ ...DATOS, usuario_id: 'u-1' })
    expect(nativo.verificar(ALIAS, mensaje, firma!)).toBe(true)
  })

  it('cualquier cambio a lo firmado invalida la firma (lo que haría quien edita la base del celular)', async () => {
    await nativo.crearClaveAsync(ALIAS, 'x')
    const firma = (await firmarMarcacion('u-1', DATOS))!
    const cambios = [
      { fecha_hora: '2026-10-15T07:00:00.000-05:00' }, { latitud: -2.15 }, { longitud: -79.7 }, { tipo: 'salida' },
      { selfie_b64: 'OTRA FOTO' }, { dispositivo_id: 'android:otro' }, { id: 'm-2' },
    ]
    for (const c of cambios) {
      const alterado = await mensajeDeMarcacion({ ...DATOS, ...c, usuario_id: 'u-1' })
      expect(nativo.verificar(ALIAS, alterado, firma)).toBe(false)
    }
    // Y la firma tampoco sirve para otra persona.
    expect(nativo.verificar(ALIAS, await mensajeDeMarcacion({ ...DATOS, usuario_id: 'u-2' }), firma)).toBe(false)
  })

  it('cada persona firma con su propia clave', async () => {
    await nativo.crearClaveAsync('asistencia.marca.u-2', 'x')
    expect(await firmarMarcacion('u-1', DATOS)).toBeNull()      // u-1 no tiene clave aunque u-2 sí
    expect(await firmarMarcacion('u-2', DATOS)).toEqual(expect.any(String))
  })

  it('sin el módulo (Expo Go, web) no firma y no falla', async () => {
    modulo.actual = null
    expect(puedeFirmar()).toBe(false)
    expect(await firmarMarcacion('u-1', DATOS)).toBeNull()
  })

  it('en un celular sin chip de seguridad (simulador) no firma', async () => {
    modulo.actual = crearNativoFalso({ soportado: false })
    expect(await firmarMarcacion('u-1', DATOS)).toBeNull()
  })

  it('si aún no hay clave, no firma (se guarda sin firma y el servidor decide)', async () => {
    expect(await firmarMarcacion('u-1', DATOS)).toBeNull()
  })

  it('si hay clave y la firma falla, avisa para no guardar una marcación que el servidor rechazaría', async () => {
    await nativo.crearClaveAsync(ALIAS, 'x')
    nativo.firmarAsync.mockRejectedValueOnce(new Error('el chip no responde'))
    await expect(firmarMarcacion('u-1', DATOS)).rejects.toBeInstanceOf(ErrorDeFirma)
    nativo.firmarAsync.mockRejectedValueOnce(new Error('el chip no responde'))
    await expect(firmarMarcacion('u-1', DATOS)).rejects.toThrow('el chip no responde')
  })

  it('una hora ilegible tampoco se firma', async () => {
    await nativo.crearClaveAsync(ALIAS, 'x')
    await expect(firmarMarcacion('u-1', { ...DATOS, fecha_hora: 'ayer' })).rejects.toBeInstanceOf(ErrorDeFirma)
  })

  it('si el módulo falla al preguntar si es soportado, se trata como que no firma', async () => {
    nativo.soportado.mockImplementation(() => { throw new Error('boom') })
    expect(puedeFirmar()).toBe(false)
  })
})

describe('sincronizarClave', () => {
  const args = { usuarioId: 'u-1', dispositivoId: 'android:cel-1', clavePublicaServidor: null as string | null }

  it('sin el módulo no hace nada', async () => {
    modulo.actual = null
    expect(await sincronizarClave(args)).toEqual({ estado: 'no_disponible' })
    expect(api).not.toHaveBeenCalled()
  })

  it('la primera vez crea la clave en el chip y registra la pública en el servidor', async () => {
    jest.replaceProperty(Platform, 'OS', 'android')
    modulo.actual = nativo = crearNativoFalso({ cadena: ['CERT-HOJA', 'CERT-RAIZ'] })
    expect(await sincronizarClave(args)).toEqual({ estado: 'registrada' })
    // El desafío liga la prueba de hardware a esta cuenta y este celular (el servidor calcula el mismo).
    expect(nativo.crearClaveAsync).toHaveBeenCalledWith(ALIAS, await desafioDeClave('u-1', 'android:cel-1'))
    const publica = nativo.clavePublica(ALIAS)
    expect(api).toHaveBeenCalledWith('/dispositivo/clave', {
      method: 'POST',
      body: { dispositivo_id: 'android:cel-1', clave_publica: publica, plataforma: 'android', cadena: ['CERT-HOJA', 'CERT-RAIZ'] },
    })
  })

  it('en iPhone registra la clave sin cadena de certificados', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios')
    await sincronizarClave(args)
    const [, op] = jest.mocked(api).mock.calls[0] as unknown as [string, { body: Record<string, unknown> }]
    expect(op.body).toMatchObject({ plataforma: 'ios' })
    expect(op.body).not.toHaveProperty('cadena')
  })

  it('si el servidor ya tiene esta clave, no crea ni envía nada', async () => {
    await nativo.crearClaveAsync(ALIAS, 'x')
    nativo.crearClaveAsync.mockClear()
    expect(await sincronizarClave({ ...args, clavePublicaServidor: nativo.clavePublica(ALIAS) })).toEqual({ estado: 'registrada' })
    expect(nativo.crearClaveAsync).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()
  })

  it('si la clave quedó creada pero sin registrar (se cortó la red), registra esa misma sin crear otra', async () => {
    modulo.actual = nativo = crearNativoFalso({ cadena: ['CERT'] })
    await nativo.crearClaveAsync(ALIAS, 'x')
    nativo.crearClaveAsync.mockClear()
    expect(await sincronizarClave(args)).toEqual({ estado: 'registrada' })
    expect(nativo.crearClaveAsync).not.toHaveBeenCalled()
    const [, op] = jest.mocked(api).mock.calls[0] as unknown as [string, { body: Record<string, unknown> }]
    expect(op.body).toMatchObject({ clave_publica: nativo.clavePublica(ALIAS), cadena: ['CERT'] })
  })

  it('sin red lo deja para la próxima vez, sin molestar a la persona', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.mocked(api).mockRejectedValue(new ApiError(0, 'No hay conexión'))
    expect(await sincronizarClave(args)).toMatchObject({ estado: 'error' })
    expect(aviso).not.toHaveBeenCalled()
    // La clave ya existe: el siguiente intento solo la registra.
    jest.mocked(api).mockResolvedValue({} as never)
    nativo.crearClaveAsync.mockClear()
    expect(await sincronizarClave(args)).toEqual({ estado: 'registrada' })
    expect(nativo.crearClaveAsync).not.toHaveBeenCalled()
  })

  it('un fallo inesperado se anota pero no rompe la pantalla', async () => {
    const aviso = jest.spyOn(console, 'warn').mockImplementation(() => {})
    nativo.crearClaveAsync.mockRejectedValue(new Error('Keystore dañado'))
    expect(await sincronizarClave(args)).toMatchObject({ estado: 'error', mensaje: 'Keystore dañado' })
    expect(aviso).toHaveBeenCalled()
  })

  it('si la cuenta ya tiene otra clave y el servidor no permite cambiarla, avisa y no insiste', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(409, 'Tu cuenta ya tiene registrada la clave de otro celular'))
    const datos = { ...args, clavePublicaServidor: 'CLAVE-DE-OTRO' }
    expect(await sincronizarClave(datos)).toEqual({ estado: 'distinta', mensaje: MENSAJE_CLAVE_DISTINTA })
    expect(api).toHaveBeenCalledTimes(1)
    // En la misma ejecución no vuelve a pedirlo (cada pantalla que recarga llamaría de nuevo).
    expect(await sincronizarClave(datos)).toEqual({ estado: 'distinta', mensaje: MENSAJE_CLAVE_DISTINTA })
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('si el servidor sí acepta reemplazar la clave (app reinstalada en un celular sin modificar), queda registrada', async () => {
    expect(await sincronizarClave({ ...args, clavePublicaServidor: 'CLAVE-ANTERIOR' })).toEqual({ estado: 'registrada' })
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('un 409 sin clave previa en el servidor es un error pasajero, no «distinta»', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(409, 'Primero vincula este celular a tu cuenta'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await sincronizarClave(args)).toMatchObject({ estado: 'error' })
  })
})
