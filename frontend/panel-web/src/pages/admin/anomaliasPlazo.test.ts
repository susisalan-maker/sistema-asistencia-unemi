import { haceCuanto, plazoDe, tiempoCorto } from './anomaliasPlazo'

const AHORA = new Date('2026-10-20T15:00:00Z')
const en = (ms: number) => new Date(AHORA.getTime() + ms).toISOString()
const MIN = 60_000, H = 3_600_000, D = 24 * H

describe('anomaliasPlazo', () => {
  it('abrevia el tiempo a lo más grande que quepa', () => {
    expect(tiempoCorto(10_000)).toBe('1 min')
    expect(tiempoCorto(5 * MIN)).toBe('5 min')
    expect(tiempoCorto(59 * MIN)).toBe('59 min')
    expect(tiempoCorto(60 * MIN)).toBe('1 h')
    expect(tiempoCorto(23 * H + 59 * MIN)).toBe('23 h')
    expect(tiempoCorto(24 * H)).toBe('1 d')
    expect(tiempoCorto(-3 * D)).toBe('3 d')   // el signo no importa: el texto ya dice «hace» o «en»
  })

  it('dice hace cuánto se detectó el caso', () => {
    expect(haceCuanto(en(-3 * H), AHORA)).toBe('hace 3 h')
    expect(haceCuanto(en(-2 * D), AHORA)).toBe('hace 2 d')
  })

  it('mientras se espera a la persona muestra cuánto falta, en ámbar si queda poco', () => {
    expect(plazoDe({ estado: 'pendiente', fecha_vencimiento: en(20 * H) }, AHORA)).toEqual({ texto: 'Vence en 20 h', tono: 'neutro' })
    expect(plazoDe({ estado: 'pendiente', fecha_vencimiento: en(5 * H) }, AHORA)).toEqual({ texto: 'Vence en 5 h', tono: 'aviso' })
    expect(plazoDe({ estado: 'pendiente', fecha_vencimiento: en(-1 * MIN) }, AHORA)).toEqual({ texto: 'Plazo vencido', tono: 'error' })
  })

  it('en los que se pasaron sin justificar muestra hace cuánto venció, en rojo', () => {
    expect(plazoDe({ estado: 'sin_justificar', fecha_vencimiento: en(-2 * D) }, AHORA)).toEqual({ texto: 'Venció hace 2 d', tono: 'error' })
  })

  it('donde no corre ningún plazo no muestra nada', () => {
    for (const estado of ['en_revision', 'justificada', 'rechazada'] as const) {
      expect(plazoDe({ estado, fecha_vencimiento: en(-D) }, AHORA)).toBeNull()
    }
    expect(plazoDe({ estado: 'pendiente' }, AHORA)).toBeNull()
  })
})
