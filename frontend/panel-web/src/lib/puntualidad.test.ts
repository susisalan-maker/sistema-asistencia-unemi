import { puntualidad, type Historial, type MarcaDeHistorial } from './puntualidad'

const marca = (tipo: MarcaDeHistorial['tipo'], anomalia: string | null = null): MarcaDeHistorial => ({
  id: Math.random().toString(), tipo, fecha_hora: '2026-10-20T13:00:00+00:00', sede_id: null, bloque_id: null, origen: 'app',
  verificacion: 'ok', lugar: null, anomalia: anomalia ? { tipo: anomalia, estado: 'pendiente' } : null,
})
const historial = (...marcaciones: MarcaDeHistorial[]): Historial => ({ dias: [{ fecha: '2026-10-20', marcaciones }], total: marcaciones.length })

describe('puntualidad', () => {
  it('sin historial o sin ingresos no hay porcentaje', () => {
    expect(puntualidad(null)).toBeNull()
    expect(puntualidad(historial(marca('salida')))).toBeNull()
  })

  it('es el porcentaje de ingresos sin la observación «fuera de horario»', () => {
    const h = historial(marca('ingreso'), marca('ingreso', 'fuera_horario'), marca('ingreso'), marca('ingreso'))
    expect(puntualidad(h)).toBe(75)
  })

  it('otras observaciones no restan puntualidad y las salidas no cuentan', () => {
    const h = historial(marca('ingreso', 'fuera_geocerca'), marca('salida', 'fuera_horario'))
    expect(puntualidad(h)).toBe(100)
  })
})
