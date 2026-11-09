import { supabase } from '../../lib/supabase'
import { contarJustificadasDesde, contarJustificadasHoy, guardarVisita, leerVisita } from './novedadesBandeja'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

type Llamada = [string, unknown[]]
let registros: { tabla: string; llamadas: Llamada[] }[]

/** Responde `cuentas[tabla]` a cada consulta de conteo y anota los métodos que se le encadenaron. */
function simular(cuentas: Record<string, number>, error: unknown = null) {
  registros = []
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg = { tabla, llamadas: [] as Llamada[] }
    registros.push(reg)
    const cadena: object = new Proxy({}, {
      get: (_, nombre: string) => {
        if (nombre === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ count: cuentas[tabla] ?? 0, error }).then(ok, ko)
        return (...args: unknown[]) => { reg.llamadas.push([nombre, args]); return cadena }
      },
    })
    return cadena
  }) as never)
}
const args = (tabla: string, metodo: string) => registros.find((r) => r.tabla === tabla)!.llamadas.filter(([k]) => k === metodo).map(([, a]) => a)

beforeEach(() => window.localStorage.clear())

describe('novedadesBandeja', () => {
  it('cuenta las justificaciones desde un instante, solo las que la persona hizo (con lo que concluyó la IA)', async () => {
    simular({ justificaciones: 4 })
    expect(await contarJustificadasDesde('2026-10-20T10:00:00.000Z')).toBe(4)
    expect(args('justificaciones', 'gte')).toEqual([['created_at', '2026-10-20T10:00:00.000Z']])
    expect(args('justificaciones', 'in')).toEqual([['clasificacion_ia', ['aceptable', 'requiere_revision', 'sospechosa']]])
  })

  it('«hoy» empieza a medianoche de Ecuador y separa las que esperan tu decisión', async () => {
    simular({ justificaciones: 5, anomalias: 2 })
    expect(await contarJustificadasHoy(new Date('2026-10-20T03:00:00Z'))).toEqual({ total: 5, porResolver: 2 })   // 22:00 del 19 en Ecuador
    expect(args('justificaciones', 'gte')).toEqual([['created_at', '2026-10-19T05:00:00.000Z']])
    expect(args('anomalias', 'in')[0]).toEqual(['estado', ['en_revision', 'sin_justificar']])
    expect(args('anomalias', 'gte')).toEqual([['justificaciones.created_at', '2026-10-19T05:00:00.000Z']])
  })

  it('si la base falla, lanza el error (quien lo usa decide no estorbar)', async () => {
    simular({}, { message: 'x' })
    await expect(contarJustificadasDesde('2026-10-20T10:00:00.000Z')).rejects.toEqual({ message: 'x' })
  })

  it('guarda la última visita por persona', () => {
    expect(leerVisita('u1')).toBeNull()
    guardarVisita('u1', '2026-10-20T10:00:00.000Z')
    expect(leerVisita('u1')).toBe('2026-10-20T10:00:00.000Z')
    expect(leerVisita('u2')).toBeNull()
  })
})
