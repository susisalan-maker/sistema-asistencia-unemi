import { describe, expect, it } from 'vitest'
import type { AccionAuditoria, CambioAuditoria } from './auditoriaDatos'
import { describirAccion, nombreDelAutor } from './auditoriaFrases'

const cambio = (extra: Partial<CambioAuditoria> = {}): CambioAuditoria => ({ id: 'c', evento: 'actualizar', campo: 'radio_metros', valor_anterior: '200', valor_nuevo: '300', motivo: null, ...extra })
const accion = (extra: Partial<AccionAuditoria> = {}): AccionAuditoria => ({
  id: 'b1', created_at: '2026-11-04T15:03:00Z', usuario_id: 'a1', autor: { nombres: 'Laura', apellidos: 'Mendoza' }, entidad: 'sedes', entidad_id: 's1',
  evento: 'actualizar', grupo: 'personas_sedes', motivo: null, datos: 1, cambios: [cambio()], ...extra,
})
const NOMBRES = new Map([['sedes:s1', 'Campus Norte'], ['usuarios:u1', 'Pedro Salazar'], ['anomalias:c1', 'Caso A-7 de Carlos Ruiz'], ['anomalias_caso:c1', 'A-7'], ['anomalias_persona:c1', 'Carlos Ruiz']])
const dice = (a: AccionAuditoria) => describirAccion(a, NOMBRES)

describe('describirAccion', () => {
  it('un dato: lo nombra con su antes y después', () => {
    const d = dice(accion())
    expect(d.texto).toBe('Laura Mendoza cambió radio (m) de Campus Norte')
    expect(d.etiquetas).toEqual(['Radio (m): 200 → 300'])
    expect(d.trozos.filter((t) => t.fuerte).map((t) => t.t)).toEqual(['Laura Mendoza', 'radio (m)', 'Campus Norte'])
  })

  it('varios datos: «cambió N datos» y una etiqueta por dato', () => {
    const d = dice(accion({ entidad: 'usuarios', entidad_id: 'u1', datos: 2, cambios: [cambio({ campo: 'jornada_inicio', valor_anterior: '08:00:00', valor_nuevo: '07:30:00' }), cambio({ campo: 'jornada_fin', valor_anterior: '17:00:00', valor_nuevo: '16:30:00' })] }))
    expect(d.texto).toBe('Laura Mendoza cambió 2 datos de Pedro Salazar')
    expect(d.etiquetas).toEqual(['Inicio de la jornada: 08:00 → 07:30', 'Fin de la jornada: 17:00 → 16:30'])
    expect(d.datos).toHaveLength(2)
  })

  it('la configuración dice «en», no «de»', () => {
    const d = dice(accion({ entidad: 'configuracion', entidad_id: '1', cambios: [cambio({ campo: 'tolerancia_min', valor_anterior: '10', valor_nuevo: '15' })] }))
    expect(d.texto).toBe('Laura Mendoza cambió tolerancia (min) en Parámetros del sistema')
  })

  it('activar y desactivar nombran lo activado', () => {
    expect(dice(accion({ evento: 'activar', cambios: [cambio({ evento: 'activar', campo: 'activa', valor_anterior: 'false', valor_nuevo: 'true' })] })).texto).toBe('Laura Mendoza activó la sede Campus Norte')
    expect(dice(accion({ evento: 'desactivar', entidad: 'usuarios', entidad_id: 'u1', cambios: [cambio({ evento: 'desactivar', campo: 'activo', valor_anterior: 'true', valor_nuevo: 'false' })] })).texto).toBe('Laura Mendoza desactivó el usuario Pedro Salazar')
  })

  it('crear', () => {
    expect(dice(accion({ evento: 'crear', datos: 0, cambios: [cambio({ evento: 'crear', campo: null, valor_anterior: null, valor_nuevo: null })] })).texto).toBe('Laura Mendoza creó la sede Campus Norte')
  })

  it('rostro y celular: reseteo, registro propio y registro por otra persona; los valores no se muestran', () => {
    expect(dice(accion({ evento: 'resetear_rostro', entidad: 'usuarios', entidad_id: 'u1', cambios: [cambio({ evento: 'resetear_rostro', campo: 'fecha_registro_rostro' })] })).texto).toBe('Laura Mendoza reseteó el rostro de Pedro Salazar')
    expect(dice(accion({ evento: 'resetear_dispositivo', entidad: 'usuarios', entidad_id: 'u1' })).texto).toBe('Laura Mendoza reseteó el celular de Pedro Salazar')
    expect(dice(accion({ evento: 'registrar_rostro', entidad: 'usuarios', entidad_id: 'u1' })).texto).toBe('Laura Mendoza registró el rostro de Pedro Salazar')
    expect(dice(accion({ evento: 'registrar_rostro', entidad: 'usuarios', entidad_id: 'u1', usuario_id: 'u1', autor: { nombres: 'Pedro', apellidos: 'Salazar' } })).texto).toBe('Pedro Salazar registró su rostro')
    expect(dice(accion({ evento: 'resetear_rostro', entidad: 'usuarios', entidad_id: 'u1' })).etiquetas).toEqual([])
  })

  it('una decisión nombra el caso, la persona y lo decidido, y el motivo va aparte', () => {
    const d = dice(accion({ evento: 'decidir_caso', entidad: 'anomalias', entidad_id: 'c1', motivo: 'No adjunta prueba', datos: 0, cambios: [cambio({ evento: 'decidir_caso', campo: null, valor_nuevo: 'rechazada' })] }))
    expect(d.texto).toBe('Laura Mendoza decidió el caso A-7 de Carlos Ruiz: Rechazada')
    expect(d.nota).toBe('Motivo: No adjunta prueba')
  })

  it('una decisión sin poder buscar a la persona sigue diciendo el caso', () => {
    const d = describirAccion(accion({ evento: 'decidir_caso', entidad: 'anomalias', entidad_id: 'cx', cambios: [cambio({ evento: 'decidir_caso', campo: null, valor_nuevo: 'aprobada' })] }), new Map())
    expect(d.texto).toBe('Laura Mendoza decidió el caso Registro cx: Aprobada')
  })

  it('un reporte exportado dice el formato, el periodo, los casos, la sede y el resumen; lo que incluye va en la nota', () => {
    const d = dice(accion({ evento: 'exportar_reporte', entidad: 'reportes', entidad_id: '2026-11-01 a 2026-11-30', datos: 0, motivo: 'Sede: Matriz · sin resumen con IA · Incluye: Tabla de casos',
      cambios: [cambio({ evento: 'exportar_reporte', campo: 'pdf', valor_anterior: null, valor_nuevo: '108 casos' })] }))
    expect(d.texto).toBe('Laura Mendoza exportó un reporte a PDF')
    expect(d.etiquetas).toEqual(['Periodo: 1 nov 2026 a 30 nov 2026', '108 casos', 'Matriz', 'Sin resumen con IA'])
    expect(d.nota).toBe('Incluye: Tabla de casos')
    expect(d.visibles).toBe(4)
    expect(d.datos).toEqual([])
  })

  it('la descarga de la bitácora', () => {
    const d = dice(accion({ evento: 'exportar_reporte', entidad: 'auditoria', entidad_id: '2026-11-01 a 2026-11-30', datos: 0, motivo: 'Una fila por acción · Atajo: Todo',
      cambios: [cambio({ evento: 'exportar_reporte', campo: 'xlsx', valor_nuevo: '120 filas' })] }))
    expect(d.texto).toBe('Laura Mendoza exportó la bitácora a Excel')
    expect(d.etiquetas).toEqual(['Periodo: 1 nov 2026 a 30 nov 2026', '120 filas'])
    expect(d.nota).toBe('Una fila por acción · Atajo: Todo')
  })

  it('sin datos ni evento conocido, igual dice algo', () => {
    expect(dice(accion({ datos: 0, cambios: [] })).texto).toBe('Laura Mendoza modificó Campus Norte')
    expect(dice(accion({ evento: 'inventado' as never })).texto).toBe('Laura Mendoza cambió radio (m) de Campus Norte')
  })

  it('un valor largo se recorta en la etiqueta pero no en el detalle', () => {
    const largo = 'x'.repeat(60)
    const d = dice(accion({ cambios: [cambio({ campo: 'nombre', valor_anterior: 'Corto', valor_nuevo: largo })] }))
    expect(d.etiquetas[0]).toBe(`Nombre: Corto → ${'x'.repeat(27)}…`)
    expect(d.datos[0]!.despues).toBe(largo)
  })
})

describe('nombreDelAutor', () => {
  it('Sistema si no hay persona, y «Persona desconocida» si la persona ya no se ve', () => {
    expect(nombreDelAutor({ usuario_id: null, autor: null })).toBe('Sistema')
    expect(nombreDelAutor({ usuario_id: 'x', autor: null })).toBe('Persona desconocida')
    expect(dice(accion({ usuario_id: null, autor: null })).esSistema).toBe(true)
  })
})
