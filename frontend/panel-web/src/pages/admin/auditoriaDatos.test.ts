import { describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import { consultarAcciones, nombresDeRegistros, registrarExportacionAuditoria, type AccionAuditoria } from './auditoriaDatos'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const rango = { periodo: 'mes', desde: '2026-11-01', hasta: '2026-11-30' } as never
const accion = (id: string, entidad: string, extra: Partial<AccionAuditoria> = {}): AccionAuditoria => ({
  id, created_at: '2026-11-04T15:03:00Z', usuario_id: null, autor: null, entidad, entidad_id: id, evento: 'actualizar', grupo: 'sistema', motivo: null, datos: 0, cambios: [], ...extra,
})

describe('nombresDeRegistros', () => {
  it('pide los ids de a 100, para no pasarse del largo de la dirección', async () => {
    const pedidos: number[] = []
    vi.mocked(supabase.from).mockImplementation((() => ({
      select: () => ({ in: (_: string, ids: string[]) => { pedidos.push(ids.length); return Promise.resolve({ data: ids.map((id) => ({ id, nombre: `Sede ${id}` })), error: null }) } }),
    })) as never)
    const acciones = Array.from({ length: 250 }, (_, i) => accion(`s${i}`, 'sedes'))
    const nombres = await nombresDeRegistros(acciones)
    expect(pedidos.sort((a, b) => b - a)).toEqual([100, 100, 50])
    expect(nombres.get('sedes:s249')).toBe('Sede s249')
    expect(nombres.size).toBe(250)
  })

  it('de un caso guarda el número y la persona por separado, y de un cambio de sede, los nombres de las dos sedes', async () => {
    vi.mocked(supabase.from).mockImplementation(((tabla: string) => ({
      select: () => ({ in: () => Promise.resolve({
        data: tabla === 'v_anomalias_detalle' ? [{ id: 'c1', numero: 7, colaborador: 'Carlos Ruiz' }] : [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Norte' }], error: null }) }),
    })) as never)
    const nombres = await nombresDeRegistros([
      accion('c1', 'anomalias'),
      accion('u1', 'usuarios', { cambios: [{ id: 'x', evento: 'actualizar', campo: 'sede_id', valor_anterior: 's1', valor_nuevo: 's2', motivo: null }] }),
    ])
    expect(nombres.get('anomalias:c1')).toBe('Caso A-7 de Carlos Ruiz')
    expect(nombres.get('anomalias_caso:c1')).toBe('A-7')
    expect(nombres.get('anomalias_persona:c1')).toBe('Carlos Ruiz')
    expect(nombres.get('sedes:s1')).toBe('Matriz')
    expect(nombres.get('sedes:s2')).toBe('Norte')
  })

  it('si una búsqueda falla, las demás siguen y nunca lanza', async () => {
    vi.mocked(supabase.from).mockImplementation(((tabla: string) => ({
      select: () => ({ in: () => (tabla === 'sedes' ? Promise.resolve({ data: null, error: new Error('x') }) : Promise.resolve({ data: [{ id: 'u1', nombres: 'Luis', apellidos: 'Mora' }], error: null })) }),
    })) as never)
    const nombres = await nombresDeRegistros([accion('s1', 'sedes'), accion('u1', 'usuarios')])
    expect(nombres.has('sedes:s1')).toBe(false)
    expect(nombres.get('usuarios:u1')).toBe('Luis Mora')
  })
})

describe('consultarAcciones y registrarExportacionAuditoria', () => {
  it('completa los conteos que falten y rechaza una respuesta rara', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { total: 1, datos: 1, filas: 1, conteos: { todo: 1 }, acciones: [] }, error: null } as never)
    const r = await consultarAcciones({ rango, evento: '', por: '', grupo: '', buscar: '' }, 1)
    expect(r.conteos).toEqual({ todo: 1, configuracion: 0, personas_sedes: 0, rostros_celulares: 0, decisiones: 0, exportaciones: 0, sistema: 0 })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { total: 1 }, error: null } as never)
    await expect(consultarAcciones({ rango, evento: '', por: '', grupo: '', buscar: '' }, 1)).rejects.toThrow()
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('x') } as never)
    await expect(consultarAcciones({ rango, evento: '', por: '', grupo: '', buscar: '' }, 1)).rejects.toThrow('x')
  })

  it('anota la descarga y lanza si la base lo rechaza', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: null } as never)
    await expect(registrarExportacionAuditoria(rango, 5, 'detalle')).resolves.toBeUndefined()
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('no') } as never)
    await expect(registrarExportacionAuditoria(rango, 5, 'detalle')).rejects.toThrow('no')
  })
})
