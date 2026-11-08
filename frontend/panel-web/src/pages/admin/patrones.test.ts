import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))

import { supabase } from '../../lib/supabase'
import { consultarPatrones, leerPatrones, sugerenciaPara } from './patrones'

describe('leerPatrones', () => {
  it('lee la lista y completa lo que falte', () => {
    expect(leerPatrones([{ usuario_id: 'u1', nombre: 'Ana', sede: 'Matriz', total: 5, justificadas: 2, tipo: 'sin_ingreso', tipo_total: 4 }, { tipo: 'x' }, null])).toEqual([
      { usuario_id: 'u1', nombre: 'Ana', sede: 'Matriz', total: 5, justificadas: 2, tipo: 'sin_ingreso', tipo_total: 4 },
      { usuario_id: '', nombre: 'Persona sin nombre', sede: null, total: 0, justificadas: 0, tipo: 'x', tipo_total: 0 },
    ])
    expect(leerPatrones(null)).toEqual([])
    expect(leerPatrones('basura')).toEqual([])
  })
})

describe('consultarPatrones', () => {
  it('pide a la base, con la sede solo si se eligió una', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    await consultarPatrones('')
    expect(supabase.rpc).toHaveBeenLastCalledWith('patrones_anomalias', {})
    await consultarPatrones('s1')
    expect(supabase.rpc).toHaveBeenLastCalledWith('patrones_anomalias', { p_sede: 's1' })
  })

  it('lanza el error de la base', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('x') } as never)
    await expect(consultarPatrones('')).rejects.toThrow('x')
  })
})

describe('sugerenciaPara', () => {
  it('sugiere conversar o revisar algo, nunca sancionar', () => {
    expect(sugerenciaPara('sin_ingreso')).toBe('Conversar con la persona')
    expect(sugerenciaPara('almuerzo_excedido')).toBe('Revisar el horario asignado')
    expect(sugerenciaPara('sin_regreso_almuerzo')).toBe('Revisar el horario asignado')
    expect(sugerenciaPara('verificacion_fallida')).toBe('Revisar el rostro registrado')
    expect(sugerenciaPara('fuera_geocerca')).toBe('Revisar la zona de su sede')
    expect(sugerenciaPara('lo_que_sea')).toBe('Conversar con la persona')
  })
})
