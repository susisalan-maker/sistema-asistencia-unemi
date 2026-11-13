import { describe, expect, it } from 'vitest'
import { ejeDe, pasoDeEje } from './ejeGrafica'
import { formaIngresos, horaComoTexto, leerIngresosHoy } from './ingresosHoy'
import { leerAgregado } from './reportesDatos'
import { picoDe, serieComparada } from './dashboardSerie'

describe('ejeDe', () => {
  it('elige un paso redondo con a lo sumo cinco tramos', () => {
    expect(pasoDeEje(7)).toBe(2)
    expect(pasoDeEje(25)).toBe(5)
    expect(pasoDeEje(74)).toBe(20)
    expect(ejeDe(7)).toEqual({ paso: 2, tope: 8, marcas: [0, 2, 4, 6, 8] })
    expect(ejeDe(74).tope).toBe(80)
  })

  it('con cero o uno nunca deja el eje sin altura', () => {
    expect(ejeDe(0)).toEqual({ paso: 1, tope: 1, marcas: [0, 1] })
    expect(ejeDe(1).tope).toBe(1)
  })
})

const puntos = (esperados: (h: number) => number, reales: (h: number) => number | null) =>
  Array.from({ length: 25 }, (_, hora) => ({ hora, esperados: esperados(hora), reales: reales(hora) }))

const hoy = (extra: Record<string, unknown> = {}) => leerIngresosHoy({
  hoy: '2026-11-05', ahora_hora: 13.08, esperadas: 48, esperados_ahora: 42, reales_ahora: 39,
  puntos: puntos((h) => (h < 7 ? 0 : h < 13 ? 6 * (h - 6) : 48), (h) => (h <= 13 ? (h < 7 ? 0 : Math.min(39, 5 * (h - 6))) : null)),
  ...extra,
})

describe('leerIngresosHoy', () => {
  it('completa lo que no llega y descarta lo que no sirve', () => {
    const d = leerIngresosHoy({ puntos: [{ hora: 30, esperados: 1 }, { hora: 8, esperados: 3, reales: 2 }, { hora: 7, esperados: 1, reales: null }], ultima: { nombre: '' } })
    expect(d.esperadas).toBe(0)
    expect(d.puntos.map((p) => p.hora)).toEqual([7, 8])
    expect(d.puntos[0].reales).toBeNull()
    expect(d.ultima).toBeNull()
  })

  it('lee la última marcación', () => {
    const d = leerIngresosHoy({ ultima: { nombre: 'Ana', sede: 'Matriz', tipo: 'ingreso', fecha_hora: '2026-11-05T13:00:00Z', verificacion: 'verificada', sin_conexion: true } })
    expect(d.ultima).toMatchObject({ nombre: 'Ana', tipo: 'ingreso', sin_conexion: true })
  })
})

describe('formaIngresos', () => {
  it('sin nadie a quien esperar no hay gráfica', () => {
    expect(formaIngresos(leerIngresosHoy({}))).toBeNull()
    expect(formaIngresos(hoy({ esperadas: 0 }))).toBeNull()
  })

  it('el eje de horas rodea la jornada y el de personas llega al total', () => {
    const f = formaIngresos(hoy())!
    expect(f.desde).toBe(6)
    expect(f.hasta).toBe(15)
    expect(f.tope).toBe(50)
    expect(f.marcasY[0]).toBe(0)
    expect(f.marcasY.at(-1)).toBe(50)
  })

  it('la línea real termina en «ahora», con las personas que ya ingresaron', () => {
    const f = formaIngresos(hoy())!
    const ultimo = f.reales.at(-1)!
    expect(ultimo).toEqual(f.ahora)
    expect(f.ahora.y).toBeCloseTo((39 / 50) * 100)
    expect(f.ahora.x).toBeGreaterThan(0)
    expect(f.ahora.x).toBeLessThan(100)
    // Ninguna hora futura entra en la línea real.
    expect(f.reales.every((p) => p.x <= f.ahora.x)).toBe(true)
  })

  it('«ahora» no se sale de la gráfica ni con horas raras', () => {
    const f = formaIngresos(hoy({ ahora_hora: 23.9 }))!
    expect(f.ahora.x).toBeLessThanOrEqual(100)
  })
})

describe('horaComoTexto', () => {
  it('pasa la hora decimal a «hh:mm»', () => {
    expect(horaComoTexto(13.08)).toBe('13:05')
    expect(horaComoTexto(7)).toBe('07:00')
    expect(horaComoTexto(0.5)).toBe('00:30')
  })
})

const agregado = (por_dia: { dia: string; total: number }[]) => leerAgregado({ total: por_dia.reduce((n, d) => n + d.total, 0), por_dia: por_dia.map((d) => ({ ...d, justificadas: 0 })) })

describe('serieComparada', () => {
  const semana = { desde: '2026-11-02', hasta: '2026-11-08' }

  it('una semana va día por día, con el nombre del día y el periodo anterior al lado', () => {
    const actual = agregado([{ dia: '2026-11-02', total: 4 }, { dia: '2026-11-05', total: 7 }])
    const antes = agregado([{ dia: '2026-10-26', total: 5 }, { dia: '2026-10-29', total: 2 }])
    const { columnas, unidad } = serieComparada(actual, antes, semana)
    expect(unidad).toBe('dia')
    expect(columnas.map((c) => c.etiqueta)).toEqual(['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'])
    expect(columnas.map((c) => c.actual)).toEqual([4, 0, 0, 7, 0, 0, 0])
    expect(columnas.map((c) => c.anterior)).toEqual([5, 0, 0, 2, 0, 0, 0])
    expect(columnas[3]).toMatchObject({ titulo: 'Jueves 5 de noviembre', enFrase: 'el jueves' })
  })

  it('sin el periodo anterior, las columnas no traen comparación', () => {
    const { columnas } = serieComparada(agregado([]), null, semana)
    expect(columnas.every((c) => c.anterior === null)).toBe(true)
  })

  it('un mes se agrupa de siete en siete días desde el primero, y cada bloque se compara con el suyo', () => {
    const mes = { desde: '2026-11-01', hasta: '2026-11-30' }
    const actual = agregado([{ dia: '2026-11-03', total: 5 }, { dia: '2026-11-09', total: 2 }, { dia: '2026-11-30', total: 1 }])
    const antes = agregado([{ dia: '2026-10-03', total: 4 }])
    const { columnas, unidad } = serieComparada(actual, antes, mes)
    expect(unidad).toBe('semana')
    expect(columnas).toHaveLength(5)
    expect(columnas.map((c) => c.actual)).toEqual([5, 2, 0, 0, 1])
    expect(columnas[0]).toMatchObject({ etiqueta: '1 nov', titulo: 'Semana del 1 nov', enFrase: 'la semana del 1 nov' })
    expect(columnas[4].anterior).toBeDefined()
  })

  it('el pico es la columna con más casos; sin casos no hay pico', () => {
    const { columnas } = serieComparada(agregado([{ dia: '2026-11-04', total: 3 }, { dia: '2026-11-06', total: 9 }]), null, semana)
    expect(picoDe(columnas)?.etiqueta).toBe('Vie')
    expect(picoDe(serieComparada(agregado([]), null, semana).columnas)).toBeNull()
  })
})
