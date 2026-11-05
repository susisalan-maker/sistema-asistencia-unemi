import { describe, expect, it } from 'vitest'
import { leerAgregado } from './reportesDatos'
import { columnasPorDia, columnasPorHora, coma, filasPorSede, filasPorTipo, textoVariacion } from './reportesVista'

const A = leerAgregado({
  total: 46,
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 40 }, { sede_id: null, sede: null, total: 6 }],
  por_dia: [{ dia: '2026-10-02', total: 3 }, { dia: '2026-10-04', total: 1 }],
  por_hora: [{ hora: 9, total: 6 }, { hora: 11, total: 9 }],
})

describe('textoVariacion', () => {
  it('dice si subió, bajó o quedó igual, con coma decimal y el valor anterior', () => {
    expect(textoVariacion({ anterior: 50, variacionPct: -8 })).toBe('−8 % frente al periodo anterior (50)')
    expect(textoVariacion({ anterior: 40, variacionPct: 12.5 })).toBe('+12,5 % frente al periodo anterior (40)')
    expect(textoVariacion({ anterior: 10, variacionPct: 0 })).toBe('Igual que el periodo anterior (10)')
  })
  it('sin periodo anterior comparable no inventa un porcentaje', () => {
    expect(textoVariacion({ anterior: null, variacionPct: null })).toBe('Sin datos del periodo anterior')
    expect(textoVariacion({ anterior: 0, variacionPct: null })).toBe('Sin casos en el periodo anterior')
  })
  it('coma', () => { expect(coma(37.8)).toBe('37,8') })
})

describe('filas de barras', () => {
  it('por tipo usa el nombre legible', () => {
    expect(filasPorTipo(A)).toEqual([
      { clave: 'verificacion_fallida', texto: 'Verificación facial fallida', total: 21 },
      { clave: 'fuera_geocerca', texto: 'Marcación fuera de la zona', total: 11 },
    ])
  })
  it('por sede nombra los casos sin sede', () => {
    expect(filasPorSede(A)).toEqual([
      { clave: 's1', texto: 'Matriz', total: 40 },
      { clave: 'sin-sede', texto: 'Sin sede asignada', total: 6 },
    ])
  })
})

describe('columnas', () => {
  it('por día incluye también los días sin casos y resume el máximo', () => {
    const r = columnasPorDia(A, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(r.columnas.map((c) => c.total)).toEqual([0, 3, 0, 1])
    expect(r.columnas[0].etiqueta).toBe('1 oct')
    expect(r.columnas[1].etiqueta).toBe('2')
    expect(r.columnas[1].titulo).toBe('2 oct: 3 casos')
    expect(r.columnas[3].titulo).toBe('4 oct: 1 caso')
    expect(r.resumen).toBe('Casos por día. El máximo fue 3 casos el 2 oct.')
  })
  it('por día con muchos días pone pocas etiquetas', () => {
    const dias = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    expect(columnasPorDia(A, dias).cadaEtiqueta).toBe(5)
    expect(columnasPorDia(A, ['2026-10-01']).cadaEtiqueta).toBe(1)
  })
  it('por hora siempre tiene las 24 horas', () => {
    const r = columnasPorHora(A)
    expect(r.columnas).toHaveLength(24)
    expect(r.columnas[11]).toMatchObject({ etiqueta: '11h', total: 9, titulo: '11:00 a 11:59: 9 casos' })
    expect(r.columnas[0].total).toBe(0)
    expect(r.resumen).toBe('Casos por hora del día. El máximo fue 9 casos entre las 11:00 y las 11:59.')
  })
  it('sin casos lo dice', () => {
    const vacio = leerAgregado({})
    expect(columnasPorDia(vacio, ['2026-10-01']).resumen).toBe('Casos por día: ninguno en el periodo.')
    expect(columnasPorHora(vacio).resumen).toBe('Casos por hora del día: ninguno en el periodo.')
  })
})
