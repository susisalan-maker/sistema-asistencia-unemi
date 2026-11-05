import { describe, expect, it } from 'vitest'
import {
  MAXIMO_DIAS, diasDelRango, diasEntre, esDia, etiquetaDelRango, limitesDelRango, lunesDe, moverReferencia, nombreDelPeriodo,
  periodoAnterior, rangoDe,
} from './reportesPeriodo'

const HOY = '2026-11-05'   // jueves

describe('rangoDe', () => {
  it('el mes es el calendario completo del mes de la referencia', () => {
    expect(rangoDe('mes', '2026-10-17', null, null, HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' })
    expect(rangoDe('mes', '2028-02-10', null, null, HOY)).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' })   // bisiesto
    expect(rangoDe('mes', null, null, null, HOY)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
  })

  it('la semana va de lunes a domingo', () => {
    expect(rangoDe('semana', '2026-11-05', null, null, HOY)).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
    expect(rangoDe('semana', '2026-11-08', null, null, HOY)).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })   // domingo
    expect(rangoDe('semana', '2026-11-09', null, null, HOY)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })   // lunes
    expect(rangoDe('semana', null, null, null, HOY)).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
  })

  it('la semana puede cruzar de mes y de año', () => {
    expect(rangoDe('semana', '2026-12-31', null, null, HOY)).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' })
  })

  it('el rango personalizado se usa tal cual y, si viene al revés, se acomoda', () => {
    expect(rangoDe('rango', null, '2026-10-05', '2026-10-20', HOY)).toEqual({ desde: '2026-10-05', hasta: '2026-10-20' })
    expect(rangoDe('rango', null, '2026-10-20', '2026-10-05', HOY)).toEqual({ desde: '2026-10-05', hasta: '2026-10-20' })
  })

  it('un rango incompleto o con fechas inventadas cae al mes de la referencia', () => {
    expect(rangoDe('rango', null, '2026-10-05', null, HOY)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(rangoDe('rango', null, 'ayer', '2026-10-20', HOY)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
    expect(rangoDe('mes', '2026-02-31', null, null, HOY)).toEqual({ desde: '2026-11-01', hasta: '2026-11-30' })
  })
})

describe('periodoAnterior', () => {
  it('es el mismo número de días justo antes', () => {
    expect(periodoAnterior({ desde: '2026-10-01', hasta: '2026-10-31' })).toEqual({ desde: '2026-08-31', hasta: '2026-09-30' })
    expect(periodoAnterior({ desde: '2026-11-02', hasta: '2026-11-08' })).toEqual({ desde: '2026-10-26', hasta: '2026-11-01' })
    expect(periodoAnterior({ desde: '2026-11-05', hasta: '2026-11-05' })).toEqual({ desde: '2026-11-04', hasta: '2026-11-04' })
  })
})

describe('moverReferencia', () => {
  it('la semana salta de siete en siete días', () => {
    expect(moverReferencia('semana', '2026-11-05', -1)).toBe('2026-10-29')
    expect(moverReferencia('semana', '2026-12-30', 1)).toBe('2027-01-06')
  })

  it('el mes salta de mes en mes, también entre años y sin quedarse en un día que no existe', () => {
    expect(moverReferencia('mes', '2026-11-05', -1)).toBe('2026-10-01')
    expect(moverReferencia('mes', '2026-01-31', -1)).toBe('2025-12-01')
    expect(moverReferencia('mes', '2026-12-15', 1)).toBe('2027-01-01')
    expect(moverReferencia('mes', '2026-03-31', -1)).toBe('2026-02-01')
  })
})

describe('limitesDelRango', () => {
  it('empieza a las 00:00 de Ecuador del primer día y termina (sin incluir) al comenzar el día siguiente al último', () => {
    expect(limitesDelRango({ desde: '2026-10-01', hasta: '2026-10-31' })).toEqual({
      desde: '2026-10-01T05:00:00.000Z',
      hasta: '2026-11-01T05:00:00.000Z',
    })
  })
})

describe('etiquetas', () => {
  it('abrevia sin repetir lo que no hace falta', () => {
    expect(etiquetaDelRango({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe('1 – 31 oct 2026')
    expect(etiquetaDelRango({ desde: '2026-09-28', hasta: '2026-10-04' })).toBe('28 sep – 4 oct 2026')
    expect(etiquetaDelRango({ desde: '2025-12-30', hasta: '2026-01-05' })).toBe('30 dic 2025 – 5 ene 2026')
    expect(etiquetaDelRango({ desde: '2026-11-05', hasta: '2026-11-05' })).toBe('5 nov 2026')
  })

  it('un mes completo se nombra «octubre de 2026»; una semana o un rango, con sus fechas', () => {
    expect(nombreDelPeriodo('mes', { desde: '2026-10-01', hasta: '2026-10-31' })).toBe('octubre de 2026')
    expect(nombreDelPeriodo('rango', { desde: '2026-10-01', hasta: '2026-10-31' })).toBe('octubre de 2026')
    expect(nombreDelPeriodo('rango', { desde: '2026-10-05', hasta: '2026-10-20' })).toBe('5 – 20 oct 2026')
    expect(nombreDelPeriodo('semana', { desde: '2026-11-02', hasta: '2026-11-08' })).toBe('2 – 8 nov 2026')
  })
})

describe('auxiliares', () => {
  it('cuenta los días con los dos extremos', () => {
    expect(diasDelRango({ desde: '2026-10-01', hasta: '2026-10-31' })).toBe(31)
    expect(diasDelRango({ desde: '2026-11-05', hasta: '2026-11-05' })).toBe(1)
  })

  it('lunesDe devuelve el lunes de esa semana', () => {
    expect(lunesDe('2026-11-05')).toBe('2026-11-02')
    expect(lunesDe('2026-11-02')).toBe('2026-11-02')
    expect(lunesDe('2026-11-01')).toBe('2026-10-26')
  })

  it('esDia acepta solo días reales', () => {
    expect(esDia('2026-02-28')).toBe(true)
    expect(esDia('2026-02-30')).toBe(false)
    expect(esDia('26-02-01')).toBe(false)
    expect(esDia(null)).toBe(false)
  })

  it('diasEntre lista cada día y nunca se pasa de un año', () => {
    expect(diasEntre({ desde: '2026-10-30', hasta: '2026-11-02' })).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(diasEntre({ desde: '2020-01-01', hasta: '2026-01-01' }).length).toBeLessThanOrEqual(MAXIMO_DIAS + 1)
  })
})
