import { AlmacenMemoria } from './almacenMemoria'
import { pendiente } from './ayudasDePrueba'

describe('AlmacenMemoria (el doble de pruebas del almacén)', () => {
  it('insertar dos veces el mismo id no duplica ni pisa', async () => {
    const a = new AlmacenMemoria()
    await a.insertar(pendiente('a', 'ingreso', '08:00'), 'foto-1')
    await a.insertar(pendiente('a', 'ingreso', '09:00'), 'foto-2')
    expect(a.filas.size).toBe(1)
    expect(await a.selfie('a')).toBe('foto-1')
  })

  it('lista por persona y por hora', async () => {
    const a = new AlmacenMemoria()
    await a.insertar(pendiente('b', 'salida_almuerzo', '12:00'), 'x')
    await a.insertar(pendiente('a', 'ingreso', '08:00'), 'x')
    await a.insertar(pendiente('z', 'ingreso', '07:00', { usuario_id: 'u-2' }), 'x')
    expect((await a.listar('u-1')).map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('descartar borra la selfie y conserva el motivo', async () => {
    const a = new AlmacenMemoria()
    await a.insertar(pendiente('a', 'ingreso', '08:00'), 'foto')
    await a.descartar('a', 'no')
    expect(await a.selfie('a')).toBeNull()
    expect((await a.listar('u-1'))[0]).toMatchObject({ estado: 'descartada', ultimo_error: 'no' })
  })
})
