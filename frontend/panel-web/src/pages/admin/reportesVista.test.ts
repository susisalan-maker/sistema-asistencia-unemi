import { describe, expect, it } from 'vitest'
import { leerAgregado } from './reportesDatos'
import { columnasPorDia, columnasPorHora, coma, filasPorSede, flechaCambio, filasPorTipo, tendenciaDelPeriodo, textoHoras, textoPuntosCorto, textoResolucion, textoResolucionCorto, textoVariacion, textoVariacionCorto } from './reportesVista'

const A = leerAgregado({
  total: 46,
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 40 }, { sede_id: null, sede: null, total: 6 }],
  por_dia: [{ dia: '2026-10-02', total: 3, justificadas: 2 }, { dia: '2026-10-04', total: 1, justificadas: 0 }],
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

describe('tendenciaDelPeriodo', () => {
  it('hasta 14 días va día por día, con los días sin casos en cero', () => {
    const r = tendenciaDelPeriodo(A, ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(r.granularidad).toBe('dia')
    expect(r.columnas.map((c) => [c.detectadas, c.justificadas])).toEqual([[0, 0], [3, 2], [0, 0], [1, 0]])
    expect(r.columnas[1]).toMatchObject({ etiqueta: '2', titulo: '2 oct: 3 detectadas, 2 justificadas' })
    expect(r.columnas[3].titulo).toBe('4 oct: 1 detectada, 0 justificadas')
    expect(r.resumen).toBe('Tendencia por día: 4 detectadas y 2 justificadas en el periodo. El máximo fue 3 detectadas: 2 oct.')
  })

  it('en periodos más largos agrupa por semana, de lunes a domingo, y las puntas pueden quedar incompletas', () => {
    // Octubre de 2026: empieza en jueves 1; los lunes son 5, 12, 19 y 26.
    const dias = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`)
    const a = leerAgregado({ por_dia: [
      { dia: '2026-10-01', total: 2, justificadas: 1 }, { dia: '2026-10-06', total: 4, justificadas: 3 }, { dia: '2026-10-09', total: 1, justificadas: 1 },
      { dia: '2026-10-28', total: 5, justificadas: 0 },
    ] })
    const r = tendenciaDelPeriodo(a, dias)
    expect(r.granularidad).toBe('semana')
    expect(r.columnas.map((c) => c.clave)).toEqual(['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(r.columnas.map((c) => [c.detectadas, c.justificadas])).toEqual([[2, 1], [5, 4], [0, 0], [0, 0], [5, 0]])
    expect(r.columnas[1]).toMatchObject({ etiqueta: '5 oct', titulo: 'Semana del 5 oct: 5 detectadas, 4 justificadas' })
    expect(r.resumen).toBe('Tendencia por semana: 12 detectadas y 5 justificadas en el periodo. El máximo fue 5 detectadas: semana del 5 oct.')
  })

  it('sin casos lo dice', () => {
    expect(tendenciaDelPeriodo(leerAgregado({}), ['2026-10-01']).resumen).toBe('Tendencia por día: ninguna anomalía en el periodo.')
  })
})

describe('textoHoras', () => {
  it('menos de una hora va en minutos; el resto en horas con coma', () => {
    expect(textoHoras(0.5)).toBe('30 min')
    expect(textoHoras(0.001)).toBe('1 min')
    expect(textoHoras(1)).toBe('1 h')
    expect(textoHoras(5.25)).toBe('5,3 h')
    expect(textoHoras(48)).toBe('48 h')
  })
})

describe('textoResolucion', () => {
  const base = { resolucionHoras: 5, resolucionHorasAntes: 4, resolucionDecididos: 3 }

  it('sin casos decididos por una persona lo dice, sin culpar a nadie', () => {
    expect(textoResolucion({ ...base, resolucionHoras: null, resolucionDecididos: 0 })).toEqual({ texto: 'Aún no hay casos decididos por una persona en este periodo', aviso: false })
  })

  it('sin periodo anterior no compara', () => {
    expect(textoResolucion({ ...base, resolucionHorasAntes: null, resolucionDecididos: 1 })).toEqual({ texto: '1 caso decidido por una persona · sin datos del periodo anterior', aviso: false })
  })

  it('más lento que antes avisa; más rápido o igual, no', () => {
    expect(textoResolucion(base)).toEqual({ texto: '3 casos decididos por una persona · +1 h frente al periodo anterior (4 h)', aviso: true })
    expect(textoResolucion({ ...base, resolucionHoras: 3 })).toEqual({ texto: '3 casos decididos por una persona · −1 h frente al periodo anterior (4 h)', aviso: false })
    expect(textoResolucion({ ...base, resolucionHoras: 4 })).toEqual({ texto: '3 casos decididos por una persona · igual que el periodo anterior', aviso: false })
  })
})

describe('textos cortos para el Dashboard de una pantalla', () => {
  it('textoVariacionCorto: «−8 % · antes 50»', () => {
    expect(textoVariacionCorto({ anterior: 50, variacionPct: -8 })).toBe('−8 % · antes 50')
    expect(textoVariacionCorto({ anterior: 40, variacionPct: 12.5 })).toBe('+12,5 % · antes 40')
    expect(textoVariacionCorto({ anterior: 40, variacionPct: 0 })).toBe('Igual que antes (40)')
    expect(textoVariacionCorto({ anterior: 0, variacionPct: null })).toBe('Antes: 0 casos')
    expect(textoVariacionCorto({ anterior: null, variacionPct: null })).toBe('Sin periodo anterior')
  })

  it('textoPuntosCorto: «+4 pts», «−1,3 pts», «Igual que antes»', () => {
    expect(textoPuntosCorto(4)).toBe('+4 pts')
    expect(textoPuntosCorto(-1.3)).toBe('−1,3 pts')
    expect(textoPuntosCorto(0)).toBe('Igual que antes')
    expect(textoPuntosCorto(null)).toBe('Sin periodo anterior')
  })

  it('textoResolucionCorto: la diferencia y el valor de antes; en ámbar si empeora', () => {
    expect(textoResolucionCorto({ resolucionHoras: 5.2, resolucionHorasAntes: 8.1, resolucionDecididos: 8 })).toEqual({ texto: '−2,9 h · antes 8,1 h', aviso: false })
    expect(textoResolucionCorto({ resolucionHoras: 9, resolucionHorasAntes: 5, resolucionDecididos: 3 })).toEqual({ texto: '+4 h · antes 5 h', aviso: true })
    expect(textoResolucionCorto({ resolucionHoras: 5, resolucionHorasAntes: 5, resolucionDecididos: 3 })).toEqual({ texto: 'Igual que antes', aviso: false })
    expect(textoResolucionCorto({ resolucionHoras: 5, resolucionHorasAntes: null, resolucionDecididos: 1 })).toEqual({ texto: '1 caso decididos', aviso: false })
    expect(textoResolucionCorto({ resolucionHoras: null, resolucionHorasAntes: null, resolucionDecididos: 0 })).toEqual({ texto: 'Sin casos decididos', aviso: false })
  })
})

describe('flechaCambio', () => {
  it('sin periodo anterior no inventa un cambio', () => {
    expect(flechaCambio(null, '%', true)).toEqual({ texto: '—', tono: 'neutro', lectura: 'sin periodo anterior para comparar' })
  })

  it('sin cambio es un igual neutro', () => {
    expect(flechaCambio(0, 'pts', false)).toMatchObject({ texto: '=', tono: 'neutro' })
  })

  it('si subir es malo (anomalías, rechazo): ▲ es rojo y ▼ es verde', () => {
    expect(flechaCambio(8, '%', true)).toEqual({ texto: '▲ 8 %', tono: 'error', lectura: 'subió 8 % frente al periodo anterior' })
    expect(flechaCambio(-8, '%', true)).toEqual({ texto: '▼ 8 %', tono: 'ok', lectura: 'bajó 8 % frente al periodo anterior' })
  })

  it('si subir es bueno (puntualidad): ▲ es verde y ▼ es rojo', () => {
    expect(flechaCambio(1.5, 'pts', false)).toMatchObject({ texto: '▲ 1,5 pts', tono: 'ok' })
    expect(flechaCambio(-1.5, 'pts', false)).toMatchObject({ texto: '▼ 1,5 pts', tono: 'error' })
  })
})
