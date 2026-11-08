import { describe, expect, it } from 'vitest'
import { calcularIndicadores, leerAgregado } from './reportesDatos'
import { tarjetaDe } from './tarjetasIndicadores'

const agregado = (extra: object = {}) => leerAgregado({
  total: 46, marcaciones: 24, por_estado: { pendiente: 29, justificada: 17 }, por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }],
  evaluadas: 45, a_tiempo: 17, ...extra,
})
const ind = (extra: object = {}, antes: object | null = {}) => calcularIndicadores(agregado(extra), antes ? agregado({ total: 50, ...antes }) : null)

describe('tarjetaDe', () => {
  it('anomalías: el total y cuánto cambió', () => {
    const t = tarjetaDe('anomalias', ind())
    expect(t).toMatchObject({ titulo: 'Anomalías', valor: '46', detalle: '−8 % · antes 50' })
    expect(t.ayuda).toContain('Anomalías del periodo')
  })

  it('justificadas a tiempo: porcentaje con barra y meta de 90 %', () => {
    const t = tarjetaDe('aTiempo', ind())
    expect(t.valor).toBe('37,8 %')
    expect(t.detalle).toBe('17 de 45 casos')
    expect(t.barra).toEqual({ pct: 37.8, meta: 90 })
  })

  it('sin plazos vencidos no inventa un porcentaje', () => {
    const t = tarjetaDe('aTiempo', ind({ evaluadas: 0, a_tiempo: 0 }))
    expect(t.valor).toBe('—')
    expect(t.detalle).toBe('Sin plazos vencidos')
  })

  it('puntualidad sin marcaciones lo dice', () => {
    const t = tarjetaDe('puntualidad', ind())
    expect(t.valor).toBe('—')
    expect(t.detalle).toBe('Sin ingresos ni salidas')
    expect(t.barra?.meta).toBe(95)
  })

  it('resolución sin casos decididos muestra una raya', () => {
    const t = tarjetaDe('resolucion', ind())
    expect(t.valor).toBe('—')
    expect(t.detalle).toBe('Sin casos decididos')
  })

  it('rechazo facial sin intentos', () => {
    const t = tarjetaDe('rechazo', ind())
    expect(t.valor).toBeDefined()
    expect(typeof t.detalle).toBe('string')
  })

  it('por resolver: cuántos esperan al administrador', () => {
    const t = tarjetaDe('porResolver', ind())
    expect(t.titulo).toBe('Por resolver')
    expect(t.valor).toBe(String(ind().porResolver))
  })
})
