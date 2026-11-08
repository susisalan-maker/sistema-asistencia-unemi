import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../lib/supabase'
import { DIAS_FICHA, buscarPersonas, casosDePersona, resumenDeFicha, sinTildes, type CasoFicha } from './fichaDatos'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

let llamadas: [string, unknown[]][]
function simular(resultado: { data: unknown; error: unknown }) {
  llamadas = []
  vi.mocked(supabase.from).mockImplementation((() => {
    const cadena: object = new Proxy({}, {
      get: (_, nombre: string) => {
        if (nombre === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
        return (...args: unknown[]) => { llamadas.push([nombre, args]); return cadena }
      },
    })
    return cadena
  }) as never)
}
const caso = (estado: string, n = 1): CasoFicha => ({ id: `a${n}`, numero: n, caso: `A-${n}`, tipo: 'fuera_geocerca', estado: estado as never, created_at: '2026-11-01T10:00:00Z' })

beforeEach(() => vi.mocked(supabase.from).mockReset())

describe('sinTildes', () => {
  it('quita tildes y mayúsculas', () => { expect(sinTildes('  María PÉREZ ')).toBe('maria perez') })
})

describe('buscarPersonas', () => {
  const USUARIOS = [
    { id: 'u1', nombres: 'María José', apellidos: 'Ortiz Vera', sede_id: 's1' },
    { id: 'u2', nombres: 'Marcela', apellidos: 'Ortiz', sede_id: null },
    { id: 'u3', nombres: 'Mario', apellidos: 'Loor', sede_id: 's2' },
  ]

  it('un texto vacío no consulta nada', async () => {
    simular({ data: USUARIOS, error: null })
    expect(await buscarPersonas('   ')).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('filtra en la base por la primera palabra y exige todas las demás, sin importar tildes ni orden', async () => {
    simular({ data: USUARIOS, error: null })
    expect((await buscarPersonas('ortiz maría')).map((p) => p.id)).toEqual(['u1'])
    expect(llamadas).toContainEqual(['eq', ['rol', 'usuario']])
    expect(llamadas.find(([k]) => k === 'or')![1][0]).toBe('nombres.ilike.%ortiz%,apellidos.ilike.%ortiz%')
  })

  it('no deja pasar caracteres que romperían el filtro de la base', async () => {
    simular({ data: [], error: null })
    await buscarPersonas('a,b(c)*%')
    expect(llamadas.find(([k]) => k === 'or')![1][0]).toBe('nombres.ilike.%abc%,apellidos.ilike.%abc%')
  })

  it('devuelve como mucho seis y lanza si la consulta falla', async () => {
    simular({ data: Array.from({ length: 12 }, (_, i) => ({ id: `u${i}`, nombres: 'Ana', apellidos: `Loor ${i}`, sede_id: null })), error: null })
    expect(await buscarPersonas('ana')).toHaveLength(6)
    simular({ data: null, error: new Error('x') })
    await expect(buscarPersonas('ana')).rejects.toThrow()
  })
})

describe('casosDePersona', () => {
  it('pide los últimos 90 días de esa persona, del más reciente al más antiguo', async () => {
    simular({ data: [caso('pendiente')], error: null })
    const ahora = Date.parse('2026-11-05T15:00:00Z')
    expect(await casosDePersona('u1', ahora)).toHaveLength(1)
    expect(llamadas).toContainEqual(['eq', ['usuario_id', 'u1']])
    expect(llamadas).toContainEqual(['gte', ['created_at', new Date(ahora - DIAS_FICHA * 86400000).toISOString()]])
    expect(llamadas).toContainEqual(['order', ['created_at', { ascending: false }]])
  })

  it('lanza si la consulta falla', async () => {
    simular({ data: null, error: new Error('x') })
    await expect(casosDePersona('u1')).rejects.toThrow()
  })
})

describe('resumenDeFicha', () => {
  it('cuenta justificados, rechazados y los que esperan una decisión', () => {
    const r = resumenDeFicha([caso('justificada', 1), caso('rechazada', 2), caso('pendiente', 3), caso('en_revision', 4), caso('justificada', 5)])
    expect(r).toEqual({ total: 5, justificados: 2, rechazados: 1, sinDecidir: 2 })
  })
})
