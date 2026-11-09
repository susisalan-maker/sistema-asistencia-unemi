import { hoyEcuador, limitesDeFecha, numeroDeCaso, ordenPorDefecto, ordenesDe } from './anomaliasConsulta'

describe('anomaliasConsulta', () => {
  it('«hoy» es el día de Ecuador aunque en UTC ya sea mañana', () => {
    expect(hoyEcuador(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19')   // 21:30 del 19 en Ecuador
    expect(hoyEcuador(new Date('2026-10-20T05:00:00Z'))).toBe('2026-10-20')
  })

  it('los atajos de fecha empiezan a medianoche de Ecuador', () => {
    const ahora = new Date('2026-10-20T15:00:00Z')
    expect(limitesDeFecha('todas', null, null, ahora)).toEqual({})
    expect(limitesDeFecha('hoy', null, null, ahora)).toEqual({ desde: '2026-10-20T05:00:00.000Z' })
    expect(limitesDeFecha('7d', null, null, ahora)).toEqual({ desde: '2026-10-14T05:00:00.000Z' })
    expect(limitesDeFecha('30d', null, null, ahora)).toEqual({ desde: '2026-09-21T05:00:00.000Z' })
  })

  it('un rango incluye el día final completo y acomoda fechas al revés', () => {
    expect(limitesDeFecha('rango', '2026-10-01', '2026-10-05')).toEqual({ desde: '2026-10-01T05:00:00.000Z', hasta: '2026-10-06T05:00:00.000Z' })
    expect(limitesDeFecha('rango', '2026-10-05', '2026-10-01')).toEqual({ desde: '2026-10-01T05:00:00.000Z', hasta: '2026-10-06T05:00:00.000Z' })
    expect(limitesDeFecha('rango', '2026-10-01', null)).toEqual({ desde: '2026-10-01T05:00:00.000Z', hasta: undefined })
    expect(limitesDeFecha('rango', 'no-es-fecha', '2026-12-31')).toEqual({ desde: undefined, hasta: '2027-01-01T05:00:00.000Z' })
  })

  it('reconoce el número de caso escrito de varias formas', () => {
    expect(numeroDeCaso('A-12')).toBe(12)
    expect(numeroDeCaso('a12')).toBe(12)
    expect(numeroDeCaso(' 7 ')).toBe(7)
    expect(numeroDeCaso('ana')).toBeNull()
    expect(numeroDeCaso('A-')).toBeNull()
  })

  it('cada pestaña ofrece los órdenes que le sirven, con el de siempre primero', () => {
    expect(ordenPorDefecto('por_resolver')).toBe('prioridad')
    expect(ordenPorDefecto('abiertas')).toBe('vencer')
    expect(ordenPorDefecto('resueltas')).toBe('recientes')
    expect(ordenesDe('todas').map((o) => o.valor)).toEqual(['recientes', 'justificadas', 'antiguas'])
    expect(ordenesDe('abiertas').map((o) => o.valor)).not.toContain('justificadas')   // aún no justificaron
    expect(ordenesDe('por_resolver').map((o) => o.valor)).not.toContain('vencer')
  })
})
