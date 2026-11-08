import { describe, expect, it } from 'vitest'
import { TIPOS_ANOMALIA } from './anomaliasTipos'
import { PLANTILLAS, PLANTILLA_INICIAL, plantillaDe } from './plantillas'

describe('plantillas de reporte', () => {
  it('son cinco y la primera es la de siempre', () => {
    expect(PLANTILLAS.map((p) => p.id)).toEqual(['resumen', 'sedes', 'recurrentes', 'biometrica', 'plazos'])
    expect(PLANTILLA_INICIAL.id).toBe('resumen')
  })

  it('plantillaDe vuelve a la inicial con un nombre desconocido o vacío', () => {
    expect(plantillaDe('sedes').nombre).toBe('Asistencia por sede')
    expect(plantillaDe('nada')).toBe(PLANTILLA_INICIAL)
    expect(plantillaDe(null)).toBe(PLANTILLA_INICIAL)
  })

  it('todas llevan la tabla de casos, y solo la inicial pide resumen a la IA', () => {
    for (const p of PLANTILLAS) expect(p.secciones).toContain('tabla')
    expect(PLANTILLAS.filter((p) => p.secciones.includes('resumen')).map((p) => p.id)).toEqual(['resumen'])
  })

  it('todas tienen un nombre corto para su pestaña', () => {
    expect(PLANTILLAS.map((p) => p.corto)).toEqual(['Resumen', 'Sede contra sede', 'Casos recurrentes', 'Calidad biométrica', 'Plazos'])
  })

  it('la inicial lleva cuatro indicadores y deja plegadas sede contra sede, hora y patrones', () => {
    expect(PLANTILLA_INICIAL.indicadores).toEqual(['anomalias', 'aTiempo', 'puntualidad', 'resolucion'])
    expect(PLANTILLA_INICIAL.masAnalisis).toEqual(['comparativo', 'hora', 'patrones'])
    for (const parte of PLANTILLA_INICIAL.masAnalisis ?? []) expect(PLANTILLA_INICIAL.secciones).toContain(parte)
    expect(PLANTILLAS.filter((p) => p.id !== 'resumen').every((p) => !p.masAnalisis)).toBe(true)
  })

  it('las que muestran indicadores dicen cuáles, y el tipo con el que abren existe', () => {
    for (const p of PLANTILLAS) {
      expect(!!p.indicadores?.length).toBe(p.secciones.includes('indicadores'))
      if (p.tipo) expect(TIPOS_ANOMALIA.map((t) => t.valor)).toContain(p.tipo)
    }
  })
})
