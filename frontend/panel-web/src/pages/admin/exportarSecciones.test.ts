import { describe, expect, it } from 'vitest'
import { PLANTILLAS, plantillaDe } from './plantillas'
import { PRESETS, SECCIONES_EXPORT, seccionesPorOmision, textoDeSeccion, textoDescarga } from './exportarSecciones'

describe('seccionesPorOmision', () => {
  it('en «Casos del periodo» viene marcada solo la tabla, sea cual sea la plantilla', () => {
    for (const p of PLANTILLAS) expect(seccionesPorOmision(p, 'casos')).toEqual(['tabla'])
  })

  it('en el resumen viene lo que se ve abierto, sin lo que va plegado en «Más análisis»', () => {
    expect(seccionesPorOmision(plantillaDe('resumen'), 'resumen')).toEqual(['resumen', 'indicadores', 'estado', 'graficas', 'tabla'])
  })

  it('en las demás plantillas vienen sus partes, y las gráficas se juntan en una', () => {
    expect(seccionesPorOmision(plantillaDe('sedes'), 'resumen')).toEqual(['graficas', 'comparativo', 'hora', 'tabla'])
    expect(seccionesPorOmision(plantillaDe('recurrentes'), 'resumen')).toEqual(['patrones', 'tabla'])
    expect(seccionesPorOmision(plantillaDe('biometrica'), 'resumen')).toEqual(['indicadores', 'graficas', 'tabla'])
    expect(seccionesPorOmision(plantillaDe('plazos'), 'resumen')).toEqual(['indicadores', 'estado', 'tabla'])
  })

  it('siempre salen en el orden en que se muestran en el cuadro', () => {
    const orden = SECCIONES_EXPORT.map((s) => s.id)
    for (const p of PLANTILLAS) {
      const r = seccionesPorOmision(p, 'resumen')
      expect(r).toEqual(orden.filter((id) => r.includes(id)))
    }
  })
})

describe('textos', () => {
  it('cada parte tiene su nombre', () => {
    expect(textoDeSeccion('graficas')).toBe('Tendencia, tipo y sede')
    expect(textoDeSeccion('tabla')).toBe('Tabla de casos')
  })

  it('dice qué se va a descargar', () => {
    expect(textoDescarga(['resumen', 'tabla'])).toBe('Se descargará: PDF · 2 secciones')
    expect(textoDescarga(['tabla'])).toBe('Se descargará: PDF · 1 sección')
    expect(textoDescarga([])).toBe('Se descargará: PDF · 0 secciones')
  })

  it('los atajos son cuatro y «Solo cifras y gráficas» no lleva ni resumen ni tabla', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['todo', 'cifras', 'tabla', 'nada'])
    const cifras = PRESETS.find((p) => p.id === 'cifras')!.secciones as string[]
    expect(cifras).not.toContain('tabla')
    expect(cifras).not.toContain('resumen')
    expect(cifras).not.toContain('patrones')
  })
})
