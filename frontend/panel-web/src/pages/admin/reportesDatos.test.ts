import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  llamadas: [] as { metodo: string; args: unknown[] }[],
  paginas: [] as { data: unknown[]; count: number; error?: unknown }[],
}))

vi.mock('../../lib/supabase', () => {
  const cadena = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'gte', 'lt', 'eq', 'in', 'order']) c[m] = (...args: unknown[]) => { mock.llamadas.push({ metodo: m, args }); return c }
    c.range = (...args: unknown[]) => {
      mock.llamadas.push({ metodo: 'range', args })
      const p = mock.paginas.shift() ?? { data: [], count: 0 }
      return Promise.resolve(p)
    }
    return c
  }
  return { supabase: { rpc: mock.rpc, from: (t: string) => { mock.llamadas.push({ metodo: 'from', args: [t] }); return cadena() } } }
})

import {
  POR_PAGINA_REPORTE, calcularIndicadores, consultarAgregado, consultarHistorico, consultarPendientes, datosParaIA, franjaDe, leerAgregado, porCada100,
  puntualidadDe, resolucionDe, traerTodoElHistorico, variacion, type AgregadoReporte, type FiltrosHistorico,
} from './reportesDatos'

const RANGO = { desde: '2026-10-01', hasta: '2026-10-31' }
const FILTROS: FiltrosHistorico = { rango: RANGO, sedeId: '', estado: '', tipo: '' }

const AGREGADO: AgregadoReporte = {
  total: 46, marcaciones: 24,
  por_estado: { pendiente: 29, rechazada: 3, en_revision: 10, justificada: 4 },
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 18 }, { sede_id: 's2', sede: 'Norte', total: 28 }, { sede_id: null, sede: null, total: 99 }],
  por_dia: [{ dia: '2026-10-20', total: 11, justificadas: 4 }, { dia: '2026-10-28', total: 15, justificadas: 0 }],
  por_hora: [{ hora: 9, total: 6 }, { hora: 11, total: 9 }],
  por_clasificacion: { requiere_revision: 3 },
  jornada: { marcaciones: 40, con_falta: 4 },
  evaluadas: 45, a_tiempo: 17,
}

beforeEach(() => { mock.rpc.mockReset(); mock.llamadas.length = 0; mock.paginas.length = 0 })

describe('leerAgregado', () => {
  it('completa lo que falte y descarta lo que no sea número', () => {
    const a = leerAgregado({ total: 5, marcaciones: 'x', por_tipo: [{ tipo: 'duplicada', total: 2 }, null], por_estado: { pendiente: 3, rechazada: 'no' } })
    expect(a.total).toBe(5)
    expect(a.marcaciones).toBe(0)
    expect(a.por_tipo).toEqual([{ tipo: 'duplicada', total: 2 }])
    expect(a.por_estado).toEqual({ pendiente: 3, rechazada: 0 })
    expect(a.por_sede).toEqual([])
    expect(a.jornada).toEqual({ marcaciones: 0, con_falta: 0 })
    expect(leerAgregado(null).total).toBe(0)
    expect(leerAgregado('basura').por_hora).toEqual([])
  })
})

describe('leerAgregado · lo que usa el Dashboard', () => {
  it('lee las justificadas de cada día y la jornada', () => {
    const a = leerAgregado({ por_dia: [{ dia: '2026-10-02', total: 3, justificadas: 2 }, { dia: '2026-10-03', total: 1 }], jornada: { marcaciones: 40, con_falta: 4 } })
    expect(a.por_dia).toEqual([{ dia: '2026-10-02', total: 3, justificadas: 2 }, { dia: '2026-10-03', total: 1, justificadas: 0 }])
    expect(a.jornada).toEqual({ marcaciones: 40, con_falta: 4 })
  })
})

describe('puntualidad', () => {
  it('son las marcaciones de ingreso y salida sin falta de horario', () => {
    expect(puntualidadDe(AGREGADO)).toBe(90)
    expect(puntualidadDe({ ...AGREGADO, jornada: { marcaciones: 13, con_falta: 9 } })).toBe(30.8)
  })
  it('sin marcaciones no hay puntualidad', () => { expect(puntualidadDe(leerAgregado({}))).toBeNull() })
  it('la variación se da en puntos frente al periodo anterior', () => {
    const antes = { ...AGREGADO, jornada: { marcaciones: 50, con_falta: 7 } }   // 86 %
    const ind = calcularIndicadores(AGREGADO, antes)
    expect(ind).toMatchObject({ puntualidadPct: 90, puntualidadPts: 4, jornadaMarcaciones: 40, jornadaConFalta: 4 })
    expect(calcularIndicadores(AGREGADO, null).puntualidadPts).toBeNull()
    expect(calcularIndicadores(AGREGADO, leerAgregado({})).puntualidadPts).toBeNull()
  })
})

describe('consultarPendientes', () => {
  it('trae los casos en revisión o sin justificar del periodo y la sede, los más recientes primero', async () => {
    mock.paginas.push({ data: [{ id: 'a', numero: 9 }], count: 31 })
    const r = await consultarPendientes(RANGO, 's1')
    expect(r).toEqual({ filas: [{ id: 'a', numero: 9 }], total: 31 })
    const m = mock.llamadas
    expect(m.find((x) => x.metodo === 'from')?.args).toEqual(['v_anomalias_detalle'])
    expect(m.find((x) => x.metodo === 'in')?.args).toEqual(['estado', ['en_revision', 'sin_justificar']])
    expect(m.find((x) => x.metodo === 'gte')?.args).toEqual(['created_at', '2026-10-01T05:00:00.000Z'])
    expect(m.filter((x) => x.metodo === 'eq').map((x) => x.args)).toEqual([['sede_id', 's1']])
    expect(m.filter((x) => x.metodo === 'order').map((x) => x.args)).toEqual([['created_at', { ascending: false }], ['numero', { ascending: false }]])
    expect(m.find((x) => x.metodo === 'range')?.args).toEqual([0, 5])
  })
  it('sin sede no filtra por sede, y si la base falla lanza el error', async () => {
    mock.paginas.push({ data: [], count: 0 })
    await consultarPendientes(RANGO, '')
    expect(mock.llamadas.filter((x) => x.metodo === 'eq')).toEqual([])
    mock.paginas.push({ data: [], count: 0, error: new Error('caída') })
    await expect(consultarPendientes(RANGO, '')).rejects.toThrow('caída')
  })
})

describe('consultarAgregado', () => {
  it('pide a la base el periodo en hora de Ecuador y, sin sede, todas las sedes', async () => {
    mock.rpc.mockResolvedValue({ data: { total: 3 }, error: null })
    const a = await consultarAgregado(RANGO, '')
    expect(mock.rpc).toHaveBeenCalledWith('reporte_anomalias', { p_desde: '2026-10-01T05:00:00.000Z', p_hasta: '2026-11-01T05:00:00.000Z', p_sede: null })
    expect(a.total).toBe(3)
  })

  it('con sede, la manda; y si la base falla, lanza el error', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('no') })
    await expect(consultarAgregado(RANGO, 'sede-1')).rejects.toThrow('no')
    expect(mock.rpc.mock.calls[0][1].p_sede).toBe('sede-1')
  })
})

describe('indicadores', () => {
  it('variacion: contra un periodo anterior sin casos no se puede decir', () => {
    expect(variacion(46, 50)).toBe(-8)
    expect(variacion(60, 50)).toBe(20)
    expect(variacion(5, 0)).toBeNull()
    expect(variacion(5, null)).toBeNull()
  })

  it('porCada100 redondea a un decimal y no divide por cero', () => {
    expect(porCada100(17, 45)).toBe(37.8)
    expect(porCada100(46, 24)).toBe(191.7)
    expect(porCada100(3, 0)).toBeNull()
  })

  it('calcula lo principal del periodo', () => {
    const ind = calcularIndicadores(AGREGADO, { ...AGREGADO, total: 50 })
    expect(ind).toMatchObject({
      total: 46, anterior: 50, variacionPct: -8, marcaciones: 24, porCada100Marcaciones: 191.7, aTiempoPct: 37.8, evaluadas: 45, aTiempo: 17, porResolver: 10,
    })
    expect(ind.tipoTop).toEqual({ tipo: 'verificacion_fallida', total: 21 })
    expect(ind.sedeTop).toEqual({ sede: 'Norte', total: 28 })   // ignora los casos sin sede
    expect(ind.horaPico).toEqual({ hora: 11, total: 9 })
    expect(ind.diaPico).toMatchObject({ dia: '2026-10-28', total: 15 })
  })

  it('sin periodo anterior no hay variación; sin casos no hay picos', () => {
    const vacio = leerAgregado({})
    const ind = calcularIndicadores(vacio, null)
    expect(ind.anterior).toBeNull()
    expect(ind.variacionPct).toBeNull()
    expect(ind.tipoTop).toBeNull()
    expect(ind.sedeTop).toBeNull()
    expect(ind.horaPico).toBeNull()
    expect(ind.aTiempoPct).toBeNull()
  })

  it('franjaDe', () => { expect(franjaDe(9)).toBe('09:00 a 09:59') })
})

describe('resolucionDe', () => {
  it('dice cómo terminó cada caso', () => {
    expect(resolucionDe({ estado: 'justificada', decision_final: 'aprobada', revisado_por_nombre: 'Ana Pérez' })).toBe('Aprobada · Ana Pérez')
    expect(resolucionDe({ estado: 'justificada', decision_final: 'aprobada', revisado_por_nombre: null })).toBe('Aprobada automáticamente')
    expect(resolucionDe({ estado: 'rechazada', decision_final: 'rechazada', revisado_por_nombre: 'Luis Vera' })).toBe('Rechazada · Luis Vera')
    expect(resolucionDe({ estado: 'pendiente', decision_final: null, revisado_por_nombre: null })).toBe('Esperando a la persona')
    expect(resolucionDe({ estado: 'sin_justificar', decision_final: null, revisado_por_nombre: null })).toBe('Plazo vencido sin justificar')
    expect(resolucionDe({ estado: 'en_revision', decision_final: null, revisado_por_nombre: null })).toBe('Pendiente de revisión')
    expect(resolucionDe({ estado: 'en_revision', decision_final: 'escalada', revisado_por_nombre: 'X' })).toBe('Pendiente de revisión')
  })
})

describe('datosParaIA', () => {
  it('solo manda números, nombres de tipo y de sede; nada de personas', () => {
    const ind = calcularIndicadores(AGREGADO, { ...AGREGADO, total: 50 })
    const d = datosParaIA('octubre de 2026', null, AGREGADO, ind)
    expect(d).toMatchObject({ periodo: 'octubre de 2026', sede: null, total: 46, total_anterior: 50, variacion_pct: -8, marcaciones: 24, a_tiempo_pct: 37.8 })
    expect(d.por_tipo[0]).toEqual({ nombre: 'Verificación facial fallida', total: 21 })
    expect(d.por_estado.map((e) => e.nombre)).toEqual(['Esperando a la persona', 'En revisión', 'Justificada', 'Rechazada'])
    expect(d.por_sede.map((s) => s.nombre)).toEqual(['Matriz', 'Norte'])
    expect(d.clasificacion_ia).toEqual([{ nombre: 'requiere revisión', total: 3 }])
    expect(d.hora_pico).toEqual({ nombre: '11:00 a 11:59', total: 9 })
    expect(JSON.stringify(d)).not.toMatch(/colaborador|correo|email|@/i)
  })
})

describe('historial', () => {
  it('una página pide solo sus 15 filas, con los filtros, y ordena de más reciente a más antigua', async () => {
    mock.paginas.push({ data: [{ id: 'a', numero: 7 }], count: 31 })
    const r = await consultarHistorico({ ...FILTROS, sedeId: 's1', estado: 'rechazada', tipo: 'duplicada' }, 3)
    expect(r).toEqual({ filas: [{ id: 'a', numero: 7 }], total: 31 })
    const m = mock.llamadas
    expect(m.find((x) => x.metodo === 'from')?.args).toEqual(['v_anomalias_detalle'])
    expect(m.find((x) => x.metodo === 'gte')?.args).toEqual(['created_at', '2026-10-01T05:00:00.000Z'])
    expect(m.find((x) => x.metodo === 'lt')?.args).toEqual(['created_at', '2026-11-01T05:00:00.000Z'])
    expect(m.filter((x) => x.metodo === 'eq').map((x) => x.args)).toEqual([['sede_id', 's1'], ['estado', 'rechazada'], ['tipo', 'duplicada']])
    expect(m.filter((x) => x.metodo === 'order').map((x) => x.args)).toEqual([['created_at', { ascending: false }], ['numero', { ascending: false }]])
    expect(m.find((x) => x.metodo === 'range')?.args).toEqual([2 * POR_PAGINA_REPORTE, 3 * POR_PAGINA_REPORTE - 1])
  })

  it('sin filtros no se agrega ninguno', async () => {
    mock.paginas.push({ data: [], count: 0 })
    await consultarHistorico(FILTROS, 1)
    expect(mock.llamadas.filter((x) => x.metodo === 'eq')).toEqual([])
  })

  it('si la base falla, lanza el error', async () => {
    mock.paginas.push({ data: [], count: 0, error: new Error('caída') })
    await expect(consultarHistorico(FILTROS, 1)).rejects.toThrow('caída')
  })

  it('para exportar trae todo de a mil y se detiene al llegar al total', async () => {
    const lote = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), numero: i }))
    mock.paginas.push({ data: lote(1000), count: 2300 }, { data: lote(1000), count: 2300 }, { data: lote(300), count: 2300 })
    const r = await traerTodoElHistorico(FILTROS)
    expect(r.filas).toHaveLength(2300)
    expect(r.total).toBe(2300)
    expect(r.recortado).toBe(false)
    expect(mock.llamadas.filter((x) => x.metodo === 'range').map((x) => x.args)).toEqual([[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('si hay más casos que el tope, trae hasta el tope y avisa que quedó recortado', async () => {
    const lote = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), numero: i }))
    mock.paginas.push({ data: lote(1000), count: 5000 }, { data: lote(500), count: 5000 })
    const r = await traerTodoElHistorico(FILTROS, 1500)
    expect(r.filas).toHaveLength(1500)
    expect(r.total).toBe(5000)
    expect(r.recortado).toBe(true)
  })

  it('un periodo sin casos devuelve una lista vacía', async () => {
    mock.paginas.push({ data: [], count: 0 })
    const r = await traerTodoElHistorico(FILTROS)
    expect(r).toEqual({ filas: [], total: 0, recortado: false })
  })
})
