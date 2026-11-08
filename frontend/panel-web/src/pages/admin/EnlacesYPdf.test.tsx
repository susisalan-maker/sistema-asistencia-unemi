import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BarraEstados, BarrasHorizontales } from './GraficasReporte'
import { IndicadorCompacto } from './PiezasReporte'
import { ReporteImpresion, type DatosImpresion } from './ReporteImpresion'
import type { SeccionExport } from './exportarSecciones'
import { calcularIndicadores, leerAgregado } from './reportesDatos'

const enRuta = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('IndicadorCompacto', () => {
  const base = { titulo: 'Anomalías', valor: '46', detalle: '−8 % · antes 50', ayuda: 'Anomalías del periodo' }

  it('sin enlace es solo una tarjeta', () => {
    enRuta(<IndicadorCompacto {...base} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('46')).toBeInTheDocument()
  })

  it('con enlace, toda la tarjeta lleva a los casos y dice a dónde', () => {
    enRuta(<IndicadorCompacto {...base} enlace={{ to: '?vista=casos', texto: 'Ver los 46 casos' }} />)
    const enlace = screen.getByRole('link')
    expect(enlace).toHaveAttribute('href', '/?vista=casos')
    expect(within(enlace).getByText('46')).toBeInTheDocument()
    expect(within(enlace).getByText('Ver los 46 casos →')).toBeInTheDocument()
  })
})

describe('BarraEstados y BarrasHorizontales', () => {
  it('con `enlace`, cada estado y cada fila es un enlace que dice cuántos casos tiene', () => {
    enRuta(<>
      <BarraEstados porEstado={{ pendiente: 5, rechazada: 3 }} total={8} enlace={(e) => `?estado=${e}`} />
      <BarrasHorizontales filas={[{ clave: 'duplicada', texto: 'Marcación duplicada', total: 4 }]} total={4} enlace={(t) => `?tipo=${t}`} />
    </>)
    expect(screen.getByRole('link', { name: /Rechazada: 3 casos. Ver sus casos/ })).toHaveAttribute('href', '/?estado=rechazada')
    expect(screen.getByRole('link', { name: 'Marcación duplicada: 4 casos. Ver sus casos' })).toHaveAttribute('href', '/?tipo=duplicada')
  })

  it('sin `enlace` no hay enlaces (el Dashboard y el PDF los dibujan igual que antes)', () => {
    enRuta(<>
      <BarraEstados porEstado={{ pendiente: 5 }} total={5} />
      <BarrasHorizontales filas={[{ clave: 'duplicada', texto: 'Marcación duplicada', total: 4 }]} total={4} />
    </>)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('ReporteImpresion · lleva solo lo elegido', () => {
  const agregado = leerAgregado({
    total: 46, marcaciones: 24, por_estado: { pendiente: 29, rechazada: 3 },
    por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }], por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 28 }],
    por_dia: [{ dia: '2026-11-03', total: 5, justificadas: 2 }], por_hora: [{ hora: 11, total: 9 }],
    por_clasificacion: {}, evaluadas: 45, a_tiempo: 17,
  })
  const datos = (secciones: SeccionExport[], resto: Partial<DatosImpresion> = {}): DatosImpresion => ({
    periodo: 'noviembre de 2026', sede: 'Todas las sedes', filtros: '', secciones: new Set(secciones), resumen: 'Texto de la IA.',
    comparativo: [{ sede_id: 's1', sede: 'Matriz', actual: agregado, anterior: null } as never], patrones: [], agregado, indicadores: calcularIndicadores(agregado, null),
    filas: [], total: 0, recortado: false, dias: ['2026-11-03'], ...resto,
  })
  const hoja = () => document.getElementById('reporte-impresion') as HTMLElement

  beforeEach(() => { vi.spyOn(window, 'print').mockImplementation(() => {}) })
  afterEach(() => { vi.restoreAllMocks() })

  it('con el resumen y los indicadores, dice que el resumen lo redactó la IA y no pone lo demás', () => {
    render(<ReporteImpresion datos={datos(['resumen', 'indicadores'])} alTerminar={() => {}} />)
    expect(within(hoja()).getByText('Texto de la IA.')).toBeInTheDocument()
    expect(within(hoja()).getByText(/redactado por IA a partir de las cifras/)).toBeInTheDocument()
    expect(within(hoja()).queryByText('Sede contra sede')).not.toBeInTheDocument()
    expect(within(hoja()).queryByText('Patrones a revisar')).not.toBeInTheDocument()
  })

  it('sin el resumen marcado no sale aunque exista el texto', () => {
    render(<ReporteImpresion datos={datos(['indicadores'])} alTerminar={() => {}} />)
    expect(within(hoja()).queryByText('Texto de la IA.')).not.toBeInTheDocument()
  })

  it('«Patrones a revisar» sale solo si se pidió', () => {
    render(<ReporteImpresion datos={datos(['patrones'])} alTerminar={() => {}} />)
    expect(within(hoja()).getByText('Patrones a revisar')).toBeInTheDocument()
  })
})
