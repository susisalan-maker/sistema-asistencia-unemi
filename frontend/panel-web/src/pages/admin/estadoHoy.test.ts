import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../../lib/supabase'
import {
  consultarAtencion, consultarEstadoHoy, diaEcuador, horaEcuador, leerAtencion, leerEstadoHoy, textoHace, textoRetraso, textoUltimaMarcacion,
} from './estadoHoy'

describe('leerEstadoHoy', () => {
  it('lee lo que manda la base', () => {
    const e = leerEstadoHoy({
      ahora: '2026-11-05T14:30:00+00:00', hoy: '2026-11-05', feriado: null, esperadas: 3,
      por_estado: { en_jornada: 1, en_almuerzo: 0, salio: 0, por_llegar: 0, sin_ingreso: 2 },
      por_sede: [{ sede_id: 'a', sede: 'Matriz', esperadas: 3, presentes: 1, salieron: 0, por_llegar: 0, sin_ingreso: 2 }],
      faltan: [{ usuario_id: 'u1', nombre: 'Ana Pérez', sede: 'Matriz', jornada_inicio: '08:00', minutos_retraso: 90, ultima: { tipo: 'salida', fecha_hora: '2026-11-04T22:00:00+00:00' } }],
    })
    expect(e.esperadas).toBe(3)
    expect(e.por_estado.sin_ingreso).toBe(2)
    expect(e.por_sede[0]).toMatchObject({ sede: 'Matriz', presentes: 1, sin_ingreso: 2 })
    expect(e.faltan[0]).toMatchObject({ nombre: 'Ana Pérez', minutos_retraso: 90, ultima: { tipo: 'salida', fecha_hora: '2026-11-04T22:00:00+00:00' } })
  })

  it('completa lo que falte y descarta lo que no sea del tipo esperado', () => {
    const e = leerEstadoHoy({ esperadas: 'x', por_estado: { en_jornada: 'no' }, faltan: [{ nombre: 5, ultima: { tipo: 'salida' } }, null], por_sede: 'basura' })
    expect(e.esperadas).toBe(0)
    expect(e.por_estado).toEqual({ en_jornada: 0, en_almuerzo: 0, salio: 0, por_llegar: 0, sin_ingreso: 0 })
    expect(e.por_sede).toEqual([])
    expect(e.faltan).toHaveLength(1)
    expect(e.faltan[0]).toMatchObject({ nombre: 'Persona sin nombre', ultima: null, minutos_retraso: 0 })
    expect(e.feriado).toBeNull()
    expect(leerEstadoHoy(null).esperadas).toBe(0)
  })
})

describe('leerAtencion', () => {
  it('lee los casos por atender, y sin datos deja todo en cero con el plazo por defecto', () => {
    const a = leerAtencion({
      plazo_revision_h: 72, revision: { total: 4, vencidos: 1, por_vencer: 2, por_vencer_casos: ['A-7', 'A-9', 5] }, sin_justificar: 3, sospechosas: 1,
      rostro: [{ usuario_id: 'u', nombre: 'Marcela Ortiz', intentos: 4 }], sin_celular: 2,
    })
    expect(a).toEqual({
      plazo_revision_h: 72, revision: { total: 4, vencidos: 1, por_vencer: 2, por_vencer_casos: ['A-7', 'A-9'] }, sin_justificar: 3, sospechosas: 1,
      rostro: [{ usuario_id: 'u', nombre: 'Marcela Ortiz', intentos: 4 }], sin_celular: 2,
    })
    expect(leerAtencion(undefined)).toEqual({ plazo_revision_h: 48, revision: { total: 0, vencidos: 0, por_vencer: 0, por_vencer_casos: [] }, sin_justificar: 0, sospechosas: 0, rostro: [], sin_celular: 0 })
  })
})

describe('consultar', () => {
  it('pide las funciones de la base sin mandar nada más (siempre es hoy y todas las sedes)', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { esperadas: 2 }, error: null } as never)
    expect((await consultarEstadoHoy()).esperadas).toBe(2)
    expect(supabase.rpc).toHaveBeenCalledWith('estado_hoy')
    await consultarAtencion()
    expect(supabase.rpc).toHaveBeenCalledWith('atencion_hoy')
  })

  it('si la base responde con un error, lo lanza', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('x') } as never)
    await expect(consultarEstadoHoy()).rejects.toThrow('x')
    await expect(consultarAtencion()).rejects.toThrow('x')
  })
})

describe('textos', () => {
  it('la hora y el día se ven en Ecuador', () => {
    expect(horaEcuador('2026-11-05T22:02:00Z')).toBe('17:02')
    expect(diaEcuador('2026-11-06T03:30:00Z')).toBe('2026-11-05')   // 22:30 del jueves en Ecuador
    expect(diaEcuador('2026-11-06T05:00:00Z')).toBe('2026-11-06')
  })

  it('la última marcación dice hoy, ayer o la fecha; y si nunca marcó, lo dice', () => {
    const hoy = '2026-11-05'
    expect(textoUltimaMarcacion({ tipo: 'ingreso', fecha_hora: '2026-11-05T13:00:00Z' }, hoy)).toBe('Hoy 08:00 · Ingreso')
    expect(textoUltimaMarcacion({ tipo: 'salida', fecha_hora: '2026-11-04T22:02:00Z' }, hoy)).toBe('Ayer 17:02 · Salida')
    expect(textoUltimaMarcacion({ tipo: 'salida_almuerzo', fecha_hora: '2026-10-29T17:00:00Z' }, hoy)).toBe('29 oct · 12:00 · Salida a almuerzo')
    expect(textoUltimaMarcacion({ tipo: 'raro', fecha_hora: '2026-11-04T15:00:00Z' }, hoy)).toBe('Ayer 10:00 · raro')
    expect(textoUltimaMarcacion(null, hoy)).toBe('Nunca ha marcado')
  })

  it('«ayer» cruza el cambio de mes', () => {
    expect(textoUltimaMarcacion({ tipo: 'salida', fecha_hora: '2026-10-31T22:00:00Z' }, '2026-11-01')).toBe('Ayer 17:00 · Salida')
  })

  it('el retraso se escribe en minutos y horas', () => {
    expect(textoRetraso(0)).toBe('0 min')
    expect(textoRetraso(45)).toBe('45 min')
    expect(textoRetraso(60)).toBe('1 h')
    expect(textoRetraso(90)).toBe('1 h 30 min')
    expect(textoRetraso(340)).toBe('5 h 40 min')
    expect(textoRetraso(-5)).toBe('0 min')
  })

  it('«hace X» pasa de segundos a minutos', () => {
    expect(textoHace(8_400)).toBe('hace 8 s')
    expect(textoHace(59_999)).toBe('hace 59 s')
    expect(textoHace(120_000)).toBe('hace 2 min')
    expect(textoHace(-500)).toBe('hace 0 s')
  })
})
