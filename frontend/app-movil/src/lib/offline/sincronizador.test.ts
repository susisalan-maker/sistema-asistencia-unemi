jest.mock('../supabase', () => ({ supabase: {} }))
import { ApiError } from '../api'
import { AlmacenMemoria } from './almacenMemoria'
import { clasificar, sincronizar, type Enviar } from './sincronizador'
import { pendiente, respuestaOk } from './ayudasDePrueba'

async function conCola(...items: ReturnType<typeof pendiente>[]) {
  const a = new AlmacenMemoria()
  for (const p of items) await a.insertar(p, `foto-${p.id}`)
  return a
}
const okSiempre = (): Enviar => jest.fn(async (p) => respuestaOk(p.id, p.tipo))

describe('clasificar', () => {
  it.each([
    [new ApiError(0, 'sin red'), 'reintentar', 'sin_red'],
    [new ApiError(500, 'caído'), 'reintentar', 'servidor'],
    [new ApiError(502, 'Supabase caído'), 'reintentar', 'servidor'],
    [new ApiError(503, 'no disponible'), 'reintentar', 'servidor'],
    [new ApiError(429, 'muchas'), 'reintentar', 'servidor'],
    [new ApiError(408, 'tarde'), 'reintentar', 'servidor'],
    [new ApiError(401, 'sesión'), 'reintentar', 'sesion'],
    [new ApiError(403, 'cuenta', { codigo: 'cuenta_inhabilitada' }), 'reintentar', 'sesion'],
    [new Error('bug raro'), 'reintentar', 'servidor'],
  ])('%s → %s', (error, accion, motivo) => {
    expect(clasificar(error)).toMatchObject({ accion, motivo })
  })

  it.each([400, 403, 404, 409, 422])('un %i del servidor es un rechazo definitivo', (estado) => {
    expect(clasificar(new ApiError(estado, 'no'))).toEqual({ accion: 'descartar', mensaje: 'no' })
  })
})

describe('sincronizar', () => {
  it('envía todo en orden cronológico, aunque se hayan guardado al revés, y borra lo enviado (con su selfie)', async () => {
    const almacen = await conCola(pendiente('tarde', 'salida_almuerzo', '12:00'), pendiente('temprano', 'ingreso', '08:00'))
    const enviar = okSiempre()
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(jest.mocked(enviar).mock.calls.map((c) => c[0].id)).toEqual(['temprano', 'tarde'])
    expect(r.enviadas.map((e) => e.id)).toEqual(['temprano', 'tarde'])
    expect(r.detenida).toBeNull()
    expect(almacen.filas.size).toBe(0)
  })

  it('manda la selfie guardada de cada marcación', async () => {
    const enviar = okSiempre()
    await sincronizar(await conCola(pendiente('a', 'ingreso', '08:00')), 'u-1', enviar)
    expect(enviar).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'foto-a')
  })

  it('solo envía lo de la persona que tiene la sesión (celular compartido)', async () => {
    const almacen = await conCola(pendiente('mia', 'ingreso', '08:00'), pendiente('ajena', 'ingreso', '08:01', { usuario_id: 'u-2' }))
    const enviar = okSiempre()
    await sincronizar(almacen, 'u-1', enviar)
    expect(jest.mocked(enviar).mock.calls.map((c) => c[0].id)).toEqual(['mia'])
    expect(almacen.filas.has('ajena')).toBe(true)
  })

  it('sin red se detiene en la primera: no salta a la siguiente y deja el intento anotado', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'), pendiente('b', 'salida_almuerzo', '12:00'))
    const enviar: Enviar = jest.fn(async () => { throw new ApiError(0, 'No hay conexión con el servidor') })
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(enviar).toHaveBeenCalledTimes(1)
    expect(r.detenida).toBe('sin_red')
    expect(r.enviadas).toEqual([])
    expect(almacen.filas.get('a')?.pendiente).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_error: 'No hay conexión con el servidor' })
    expect(almacen.filas.get('a')?.selfie).toBe('foto-a')   // la foto sigue, hay que reintentar
    expect(almacen.filas.get('b')?.pendiente.intentos).toBe(0)
  })

  it('si falla a mitad, lo ya enviado se borra y lo demás queda para la próxima', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'), pendiente('b', 'salida_almuerzo', '12:00'), pendiente('c', 'entrada_almuerzo', '13:00'))
    let n = 0
    const enviar: Enviar = jest.fn(async (p) => { if (++n === 2) throw new ApiError(503, 'ocupado'); return respuestaOk(p.id) })
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(r.enviadas.map((e) => e.id)).toEqual(['a'])
    expect(r.detenida).toBe('servidor')
    expect([...almacen.filas.keys()]).toEqual(['b', 'c'])
  })

  it('la siguiente pasada retoma donde quedó, con la MISMA marcación (mismo id)', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
    await sincronizar(almacen, 'u-1', async () => { throw new ApiError(0, 'sin red') })
    const enviar = okSiempre()
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(jest.mocked(enviar).mock.calls[0]![0].id).toBe('a')
    expect(r.enviadas).toHaveLength(1)
  })

  it('un rechazo del servidor descarta esa marcación (se borra la selfie) y sigue con las demás', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'), pendiente('b', 'salida_almuerzo', '12:00'))
    const enviar: Enviar = jest.fn(async (p) => {
      if (p.id === 'a') throw new ApiError(422, 'Pasaron más de 48 horas desde que marcaste', { codigo: 'marcacion_expirada' })
      return respuestaOk(p.id)
    })
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(r.descartadas).toEqual([{ id: 'a', motivo: 'Pasaron más de 48 horas desde que marcaste' }])
    expect(r.enviadas.map((e) => e.id)).toEqual(['b'])
    expect(r.detenida).toBeNull()
    expect(almacen.filas.get('a')).toMatchObject({ selfie: null, pendiente: { estado: 'descartada', ultimo_error: 'Pasaron más de 48 horas desde que marcaste' } })
    expect(almacen.filas.has('b')).toBe(false)
  })

  it('las descartadas no se vuelven a enviar', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00', { estado: 'descartada', ultimo_error: 'no' }))
    const enviar = okSiempre()
    await sincronizar(almacen, 'u-1', enviar)
    expect(enviar).not.toHaveBeenCalled()
  })

  it('si la selfie ya no está en el celular la descarta en vez de intentar enviar sin foto', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
    almacen.filas.get('a')!.selfie = null
    const enviar = okSiempre()
    const r = await sincronizar(almacen, 'u-1', enviar)
    expect(enviar).not.toHaveBeenCalled()
    expect(r.descartadas[0]?.id).toBe('a')
  })

  it('con la sesión vencida se detiene y no pierde nada', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
    const r = await sincronizar(almacen, 'u-1', async () => { throw new ApiError(401, 'sesión vencida') })
    expect(r.detenida).toBe('sesion')
    expect(almacen.filas.get('a')?.pendiente.estado).toBe('pendiente')
  })

  it('un reintento que el servidor ya tenía cuenta como enviado', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
    const r = await sincronizar(almacen, 'u-1', async (p) => ({ ...respuestaOk(p.id), reintento: true }))
    expect(r.enviadas[0]?.respuesta.reintento).toBe(true)
    expect(almacen.filas.size).toBe(0)
  })

  it('un error inesperado no cuesta la marcación', async () => {
    const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
    const r = await sincronizar(almacen, 'u-1', async () => { throw new TypeError('algo raro') })
    expect(r.detenida).toBe('servidor')
    expect(almacen.filas.get('a')?.pendiente).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_error: 'algo raro' })
  })

  it('con la cola vacía no hace ninguna petición', async () => {
    const enviar = okSiempre()
    expect(await sincronizar(new AlmacenMemoria(), 'u-1', enviar)).toEqual({ enviadas: [], descartadas: [], detenida: null })
    expect(enviar).not.toHaveBeenCalled()
  })

  describe('una sola pasada a la vez', () => {
    it('varios avisos seguidos se juntan en una pasada más, no en una por aviso', async () => {
      const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
      let liberar: () => void = () => {}
      const enviar: Enviar = jest.fn(async (p) => {
        await new Promise<void>((r) => { liberar = r })
        return respuestaOk(p.id)
      })
      const primera = sincronizar(almacen, 'u-1', enviar)
      await Promise.resolve(); await Promise.resolve()
      // Mientras la primera espera la respuesta, llegan tres avisos más (red, app al frente, botón).
      const extra = [sincronizar(almacen, 'u-1', enviar), sincronizar(almacen, 'u-1', enviar), sincronizar(almacen, 'u-1', enviar)]
      expect(extra[0]).toBe(extra[1])
      expect(extra[1]).toBe(extra[2])
      // Se guarda otra mientras tanto: la pasada siguiente también la envía.
      await almacen.insertar(pendiente('b', 'salida_almuerzo', '12:00'), 'foto-b')
      liberar()
      await primera
      await new Promise((r) => setTimeout(r, 0))
      liberar()
      const r = await extra[0]!
      expect(r.enviadas.map((e) => e.id)).toEqual(['b'])
      expect(enviar).toHaveBeenCalledTimes(2)
    })

    it('después de terminar una pasada, la siguiente arranca limpia', async () => {
      const almacen = await conCola(pendiente('a', 'ingreso', '08:00'))
      const enviar = okSiempre()
      await sincronizar(almacen, 'u-1', enviar)
      await almacen.insertar(pendiente('b', 'salida_almuerzo', '12:00'), 'foto-b')
      const r = await sincronizar(almacen, 'u-1', enviar)
      expect(r.enviadas.map((e) => e.id)).toEqual(['b'])
    })

    it('si la pasada falla de golpe (almacén roto), la siguiente igual se puede pedir', async () => {
      const roto = new AlmacenMemoria()
      roto.listar = async () => { throw new Error('disco lleno') }
      await expect(sincronizar(roto, 'u-1', okSiempre())).rejects.toThrow('disco lleno')
      expect((await sincronizar(new AlmacenMemoria(), 'u-1', okSiempre())).enviadas).toEqual([])
    })
  })
})
