import { describe, expect, it } from 'vitest'
import { calcularIndicadores, leerAgregado, type FilaHistorico } from './reportesDatos'
import { hojasDelReporte, excelDelReporte, type DatosExcel } from './reportesExcel'
import type { SeccionExport } from './exportarSecciones'
import type { PatronPersona } from './patrones'
import type { FilaSede } from './sedesComparar'

const agregado = (extra: object = {}) => leerAgregado({
  total: 46, marcaciones: 24, por_estado: { pendiente: 29, rechazada: 3, justificada: 14 },
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 25 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 28 }, { sede_id: null, sede: null, total: 18 }],
  por_dia: [{ dia: '2026-11-03', total: 5, justificadas: 2 }], evaluadas: 45, a_tiempo: 17, ...extra,
})
const fila = (n: number, extra: object = {}): FilaHistorico => ({
  id: `a${n}`, numero: n, caso: `A-${n}`, tipo: 'fuera_geocerca', estado: 'justificada', created_at: '2026-11-03T14:00:00Z', colaborador: `Persona ${n}`,
  sede: 'Matriz', clasificacion_ia: 'aceptable', decision_final: 'aprobada', revisado_por_nombre: 'Luis Vera', fecha_decision: '2026-11-04T14:00:00Z', ...extra,
}) as FilaHistorico

const TODAS: SeccionExport[] = ['resumen', 'indicadores', 'estado', 'graficas', 'comparativo', 'hora', 'patrones', 'tabla']
const PATRON: PatronPersona = { usuario_id: 'u1', nombre: 'Ana Pérez', sede: 'Matriz', total: 4, justificadas: 1, tipo: 'verificacion_fallida', tipo_total: 3 }
const datos = (extra: Partial<DatosExcel> = {}): DatosExcel => ({
  periodo: 'noviembre de 2026', sede: 'Todas las sedes', filtros: '', agregado: agregado(), indicadores: calcularIndicadores(agregado(), agregado({ total: 50 })),
  comparativo: null, resumen: null, patrones: null, secciones: new Set(TODAS), filas: [fila(1), fila(2)], total: 2, recortado: false, generado: new Date('2026-11-05T15:00:00Z'), ...extra,
})
const celdas = (h: { filas: unknown[][] }) => h.filas.flat().filter((c) => typeof c === 'string') as string[]

describe('hojasDelReporte', () => {
  it('con todo marcado y sin comparativo ni patrones trae siete hojas, en este orden', () => {
    expect(hojasDelReporte(datos()).map((h) => h.nombre)).toEqual(['Resumen', 'Por estado', 'Por tipo', 'Por sede', 'Por día', 'Por hora', 'Casos'])
  })

  it('con comparativo y patrones agrega sus hojas antes de los casos', () => {
    const comparativo: FilaSede[] = [{ sede_id: 's1', sede: 'Matriz', ind: datos().indicadores }]
    const hojas = hojasDelReporte(datos({ comparativo, patrones: [PATRON] }))
    expect(hojas.map((h) => h.nombre)).toEqual(['Resumen', 'Por estado', 'Por tipo', 'Por sede', 'Por día', 'Por hora', 'Sede contra sede', 'Patrones a revisar', 'Casos'])
    expect(hojas[6]!.filas[1]![0]).toBe('Matriz')
    expect(hojas[7]!.filas[1]).toEqual(['Ana Pérez', 'Matriz', 4, 1, 'Verificación facial fallida', 3])
  })

  it('cada parte desmarcada quita su hoja', () => {
    const solo = (...ids: SeccionExport[]) => hojasDelReporte(datos({ secciones: new Set(ids) })).map((h) => h.nombre)
    expect(solo('tabla')).toEqual(['Resumen', 'Casos'])
    expect(solo('estado')).toEqual(['Resumen', 'Por estado'])
    expect(solo('graficas')).toEqual(['Resumen', 'Por tipo', 'Por sede', 'Por día'])
    expect(solo('hora')).toEqual(['Resumen', 'Por hora'])
    expect(solo()).toEqual(['Resumen'])
  })

  it('sin la parte «comparativo» o «patrones» marcada no salen aunque haya datos', () => {
    const comparativo: FilaSede[] = [{ sede_id: 's1', sede: 'Matriz', ind: datos().indicadores }]
    const nombres = hojasDelReporte(datos({ comparativo, patrones: [PATRON], secciones: new Set<SeccionExport>(['tabla']) })).map((h) => h.nombre)
    expect(nombres).toEqual(['Resumen', 'Casos'])
  })

  it('la hoja «Resumen» lleva las cifras solo si se marcaron los indicadores', () => {
    expect(celdas(hojasDelReporte(datos())[0]!)).toContain('Justificadas a tiempo')
    expect(celdas(hojasDelReporte(datos({ secciones: new Set<SeccionExport>(['tabla']) }))[0]!)).not.toContain('Justificadas a tiempo')
  })

  it('sin resumen de IA lo dice, y siempre recuerda que decide una persona', () => {
    const t = celdas(hojasDelReporte(datos())[0]!)
    expect(t).toContain('Sin resumen con IA')
    expect(t).toContain('La IA solo sugiere: la decisión de cada caso es de una persona.')
  })

  it('un resumen incluido sale como redactado por IA, sin hablar de borrador ni de revisión', () => {
    const t = celdas(hojasDelReporte(datos({ resumen: 'Subieron los casos.' }))[0]!)
    expect(t).toContain('Resumen redactado por IA a partir de las cifras')
    expect(t).toContain('Subieron los casos.')
    expect(t.join(' ')).not.toMatch(/BORRADOR|revisado/i)
  })

  it('un resumen que no se marcó no entra aunque exista', () => {
    const t = celdas(hojasDelReporte(datos({ resumen: 'Subieron los casos.', secciones: new Set<SeccionExport>(['tabla']) }))[0]!)
    expect(t).toContain('Sin resumen con IA')
    expect(t).not.toContain('Subieron los casos.')
  })

  it('los filtros de la tabla aparecen solo si hay', () => {
    expect(celdas(hojasDelReporte(datos())[0]!)).not.toContain('Filtros de la tabla')
    expect(celdas(hojasDelReporte(datos({ filtros: 'Tipo: Marcación fuera de la zona' }))[0]!)).toContain('Filtros de la tabla')
  })

  it('por estado cuenta solo los que tienen casos, con su porcentaje', () => {
    const h = hojasDelReporte(datos())[1]!
    expect(h.filas.slice(1).every((f) => (f[1] as number) > 0)).toBe(true)
    expect(h.filas.slice(1).reduce((s, f) => s + (f[2] as number), 0)).toBeGreaterThan(99)
  })

  it('una sede sin nombre se llama «Sin sede asignada»', () => {
    expect(celdas(hojasDelReporte(datos())[3]!)).toContain('Sin sede asignada')
  })

  it('la hoja de horas pone cada hora como «HH:00»', () => {
    const h = hojasDelReporte(datos({ agregado: agregado({ por_hora: [{ hora: 9, total: 4 }, { hora: 14, total: 2 }] }) }))[5]!
    expect(h.filas.slice(1)).toEqual([['09:00', 4], ['14:00', 2]])
  })

  it('la hoja de casos trae una fila por caso y avisa si se recortó', () => {
    const casos = hojasDelReporte(datos())[6]!
    expect(casos.filas).toHaveLength(3)
    expect(casos.filas[1]![0]).toBe('A-1')
    const recortada = hojasDelReporte(datos({ recortado: true, total: 9000 }))[6]!
    expect(celdas(recortada).some((c) => c.includes('primeros 2 de 9000 casos'))).toBe(true)
  })
})

describe('excelDelReporte', () => {
  it('devuelve un archivo ZIP (los dos primeros bytes son «PK»)', () => {
    const b = excelDelReporte(datos())
    expect([b[0], b[1]]).toEqual([0x50, 0x4b])
  })
})
