import { describe, expect, it } from 'vitest'
import type { AccionAuditoria } from './auditoriaDatos'
import { excelDeAuditoria } from './auditoriaExcel'

const TEXTO = (d: Uint8Array) => new TextDecoder('utf-8').decode(d)
const ACCIONES: AccionAuditoria[] = [
  { id: 'b1', created_at: '2026-11-04T15:03:00Z', usuario_id: 'a1', autor: { nombres: 'Laura', apellidos: 'Mendoza' }, entidad: 'usuarios', entidad_id: 'u1', evento: 'actualizar', grupo: 'personas_sedes', motivo: 'Cambio de turno', datos: 2,
    cambios: [
      { id: 'c1', evento: 'actualizar', campo: 'jornada_inicio', valor_anterior: '08:00:00', valor_nuevo: '07:30:00', motivo: 'Cambio de turno' },
      { id: 'c2', evento: 'actualizar', campo: 'jornada_fin', valor_anterior: '17:00:00', valor_nuevo: '16:30:00', motivo: null },
    ] },
  { id: 'b2', created_at: '2026-11-04T16:00:00Z', usuario_id: 'a1', autor: { nombres: 'Laura', apellidos: 'Mendoza' }, entidad: 'anomalias', entidad_id: 'c9', evento: 'decidir_caso', grupo: 'decisiones', motivo: '=1+1', datos: 0,
    cambios: [{ id: 'c3', evento: 'decidir_caso', campo: null, valor_anterior: null, valor_nuevo: 'rechazada', motivo: '=1+1' }] },
]
const NOMBRES = new Map([['usuarios:u1', 'Pedro Salazar']])
const base = { acciones: ACCIONES, nombres: NOMBRES, periodo: 'noviembre de 2026', filtros: ['Atajo: Todo', 'Sin búsqueda'], totalAcciones: 2, generado: new Date('2026-11-08T22:12:00Z') }

describe('excelDeAuditoria', () => {
  it('con una fila por dato: una por dato cambiado y una por acción que no cambió ningún dato', () => {
    const r = excelDeAuditoria({ ...base, modo: 'datos' })
    expect(r.filas).toBe(3)
    expect(r.recortado).toBe(false)
    expect([r.bytes[0], r.bytes[1]]).toEqual([0x50, 0x4b])
    const t = TEXTO(r.bytes)
    expect(t).toContain('Laura Mendoza cambió 2 datos de Pedro Salazar')
    expect(t).toContain('Inicio de la jornada')
    expect(t).toContain('07:30')
    expect(t).toContain('2026-11-04 10:03')
    expect(t).toContain('Una fila por dato cambiado')
    expect(t).toContain('Atajo: Todo · Sin búsqueda')
  })

  it('con una fila por acción: los datos van juntos en una celda', () => {
    const r = excelDeAuditoria({ ...base, modo: 'acciones' })
    expect(r.filas).toBe(2)
    const t = TEXTO(r.bytes)
    expect(t).toContain('Inicio de la jornada: 08:00 → 07:30')
    expect(t).toContain('Fin de la jornada: 17:00 → 16:30')
    expect(t).toContain('Datos cambiados')
    expect(t).toContain('Una fila por acción')
  })

  it('lo que escribió una persona va como texto: nunca como fórmula', () => {
    const t = TEXTO(excelDeAuditoria({ ...base, modo: 'acciones' }).bytes)
    expect(t).not.toMatch(/<f>/)
    expect(t).toContain('=1+1')
  })

  it('recorta a 5 000 filas y lo avisa', () => {
    const muchas = Array.from({ length: 5200 }, (_, i) => ({ ...ACCIONES[1]!, id: `x${i}` }))
    const r = excelDeAuditoria({ ...base, acciones: muchas, totalAcciones: 5200, modo: 'acciones' })
    expect(r.filas).toBe(5000)
    expect(r.recortado).toBe(true)
    expect(TEXTO(r.bytes)).toContain('Acota el periodo')
  })

  it('si la base trae menos acciones de las que hay, también avisa', () => {
    expect(excelDeAuditoria({ ...base, totalAcciones: 9000, modo: 'acciones' }).recortado).toBe(true)
  })
})
