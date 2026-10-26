import { desafioDeClave, mensajeDeMarcacion, VERSION_MENSAJE, type DatosAFirmar } from './mensaje'

jest.mock('expo-crypto', () => require('./ayudasDePrueba').expoCryptoFalso())

const BASE: DatosAFirmar = {
  usuario_id: '11111111-1111-1111-1111-111111111111', id: '22222222-2222-2222-2222-222222222222', tipo: 'ingreso',
  fecha_hora: '2026-10-15T08:00:00.123-05:00', latitud: -2.14, longitud: -79.6, dispositivo_id: 'android:abc123', selfie_b64: 'AAAA',
}

describe('mensaje que firma el celular', () => {
  it('es letra por letra el caso de referencia que también prueba el servidor', async () => {
    // Si este texto cambia, hay que cambiarlo igual en backend/ia-microservicio/tests/test_firma_dispositivo.py.
    expect(await mensajeDeMarcacion(BASE)).toBe(
      [
        'asistencia-unemi/marca/v1',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'ingreso',
        '1792069200123',
        '-2.140000',
        '-79.600000',
        'android:abc123',
        '63c1dd951ffedf6f7fd968ad4efa39b8ed584f162f46e715114ee184f8de9201',
      ].join('\n'),
    )
    expect(VERSION_MENSAJE).toBe('asistencia-unemi/marca/v1')
  })

  it('la misma hora escrita en otra zona horaria da el mismo mensaje', async () => {
    const a = await mensajeDeMarcacion({ ...BASE, fecha_hora: '2026-10-15T08:00:00.123-05:00' })
    const b = await mensajeDeMarcacion({ ...BASE, fecha_hora: '2026-10-15T13:00:00.123Z' })
    expect(a).toBe(b)
  })

  it('cualquier dato distinto da un mensaje distinto', async () => {
    const original = await mensajeDeMarcacion(BASE)
    const cambios: Partial<DatosAFirmar>[] = [
      { usuario_id: 'otro' }, { id: 'otro' }, { tipo: 'salida' }, { fecha_hora: '2026-10-15T08:00:00.124-05:00' },
      { latitud: -2.140001 }, { longitud: -79.600001 }, { dispositivo_id: 'otro' }, { selfie_b64: 'AAAB' },
    ]
    for (const c of cambios) expect(await mensajeDeMarcacion({ ...BASE, ...c })).not.toBe(original)
  })

  it('escribe la ubicación con 6 decimales, también cerca de cero', async () => {
    const m = await mensajeDeMarcacion({ ...BASE, latitud: 0, longitud: -0.0000001 })
    expect(m.split('\n').slice(5, 7)).toEqual(['0.000000', '-0.000000'])
    const n = await mensajeDeMarcacion({ ...BASE, latitud: -2.1400004, longitud: 79.5999996 })
    expect(n.split('\n').slice(5, 7)).toEqual(['-2.140000', '79.600000'])
  })

  it('una hora que no se puede leer no se firma', async () => {
    await expect(mensajeDeMarcacion({ ...BASE, fecha_hora: 'ayer' })).rejects.toThrow('hora')
  })

  it('el desafío de la clave es el mismo que calcula el servidor', async () => {
    // Referencia: backend `desafio_de_clave("u-1", "android:abc")`, en base64.
    expect(await desafioDeClave('u-1', 'android:abc')).toBe('e0lZYpzb2wO/nxGWPhfCnzPF2oeiL6AVf1SQohRGHzo=')
    expect(await desafioDeClave('u-1', 'android:abd')).not.toBe(await desafioDeClave('u-1', 'android:abc'))
  })
})
