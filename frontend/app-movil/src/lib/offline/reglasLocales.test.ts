import type { EstadoHoy } from '../marcacion'
import { aplicarPendientes, comoMarcacion } from './reglasLocales'
import { pendiente } from './ayudasDePrueba'

const HOY = '2026-10-15'
const marca = (id: string, tipo: EstadoHoy['marcaciones'][number]['tipo'], hora: string) => ({
  id, tipo, fecha_hora: `${HOY}T${hora}:00-05:00`, sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada',
})
const estado = (extra: Partial<EstadoHoy> = {}): EstadoHoy => ({
  fecha: HOY, marcaciones: [], siguiente: 'ingreso', ultima: null, jornada: { inicio: '08:00', fin: '17:00' },
  dispositivo: 'este', rostro_registrado: true, rostro_requerido: true, ...extra,
})

describe('aplicarPendientes', () => {
  it('sin nada guardado devuelve lo mismo (misma referencia)', () => {
    const base = estado()
    expect(aplicarPendientes(base, [], HOY)).toBe(base)
  })

  it('una marcación guardada cuenta: toca la siguiente', () => {
    const r = aplicarPendientes(estado(), [pendiente('p1', 'ingreso', '08:02')], HOY)
    expect(r.marcaciones.map((m) => m.id)).toEqual(['p1'])
    expect(r.marcaciones[0]).toMatchObject({ en_cola: true, sin_conexion: true, origen: 'app' })
    expect(r.siguiente).toBe('salida_almuerzo')
    expect(r.ultima?.id).toBe('p1')
  })

  it('se suma a las que ya conoce el servidor y queda ordenada por hora', () => {
    const base = estado({ marcaciones: [marca('m1', 'ingreso', '08:00')], siguiente: 'salida_almuerzo', ultima: marca('m1', 'ingreso', '08:00') })
    const r = aplicarPendientes(base, [pendiente('p2', 'salida_almuerzo', '12:00'), pendiente('p3', 'entrada_almuerzo', '13:00')], HOY)
    expect(r.marcaciones.map((m) => m.id)).toEqual(['m1', 'p2', 'p3'])
    expect(r.siguiente).toBe('salida')
    expect(r.ultima?.id).toBe('p3')
  })

  it('con las cuatro hechas no toca ninguna', () => {
    const r = aplicarPendientes(estado(), [
      pendiente('a', 'ingreso', '08:00'), pendiente('b', 'salida_almuerzo', '12:00'),
      pendiente('c', 'entrada_almuerzo', '13:00'), pendiente('d', 'salida', '17:00'),
    ], HOY)
    expect(r.siguiente).toBeNull()
  })

  it('las rechazadas no cuentan', () => {
    const base = estado()
    expect(aplicarPendientes(base, [pendiente('p1', 'ingreso', '08:00', { estado: 'descartada' })], HOY)).toBe(base)
  })

  it('las de otro día no cuentan para hoy', () => {
    const ayer = pendiente('p1', 'ingreso', '08:00', { fecha_hora: '2026-10-14T08:00:00-05:00' })
    const base = estado()
    expect(aplicarPendientes(base, [ayer], HOY)).toBe(base)
  })

  it('una marcación de la noche (hora de Ecuador) cuenta en su día, no en el de UTC', () => {
    // 22:30 del 15 en Ecuador = 03:30 del 16 en UTC.
    const noche = pendiente('p1', 'salida', '22:30')
    expect(aplicarPendientes(estado(), [noche], HOY).marcaciones).toHaveLength(1)
    expect(aplicarPendientes(estado({ fecha: '2026-10-16' }), [noche], '2026-10-16').marcaciones).toHaveLength(0)
  })

  it('si la copia es de ayer, hoy no se conoce ninguna marcación del servidor', () => {
    const ayer = estado({ fecha: '2026-10-14', marcaciones: [marca('viejo', 'ingreso', '08:00')], siguiente: 'salida_almuerzo', ultima: marca('viejo', 'ingreso', '08:00') })
    const r = aplicarPendientes(ayer, [], HOY)
    expect(r.fecha).toBe(HOY)
    expect(r.marcaciones).toEqual([])
    expect(r.siguiente).toBe('ingreso')
    expect(r.ultima?.id).toBe('viejo')   // la última de todas sigue siendo la de ayer
  })

  it('no cambia los datos que no son de la jornada (celular vinculado, jornada, rostro)', () => {
    const r = aplicarPendientes(estado({ dispositivo: 'otro', rostro_registrado: false }), [pendiente('p1', 'ingreso', '08:00')], HOY)
    expect(r).toMatchObject({ dispositivo: 'otro', rostro_registrado: false, jornada: { inicio: '08:00', fin: '17:00' } })
  })
})

describe('comoMarcacion', () => {
  it('marca la verificación como pendiente y que está en cola', () => {
    expect(comoMarcacion(pendiente('p1', 'ingreso', '08:00'))).toMatchObject({ id: 'p1', verificacion: 'pendiente', en_cola: true, sede_id: null })
  })
})
