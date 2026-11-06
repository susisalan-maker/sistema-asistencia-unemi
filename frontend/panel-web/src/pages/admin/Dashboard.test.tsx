import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Dashboard from './Dashboard'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const SEDES = [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Campus Norte' }]
const PENDIENTE = (n: number, extra: object = {}) => ({
  id: `p${n}`, numero: n, caso: `A-${n}`, tipo: 'fuera_geocerca', estado: 'en_revision', created_at: '2026-11-04T14:00:00Z',
  colaborador: n === 1 ? 'Ana Pérez' : `Persona ${n}`, sede: 'Matriz', ...extra,
})
const AGREGADO = {
  total: 46, marcaciones: 24,
  por_estado: { pendiente: 29, rechazada: 3, en_revision: 10, justificada: 4 },
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 28 }, { sede_id: 's2', sede: 'Campus Norte', total: 18 }],
  por_dia: [{ dia: '2026-11-03', total: 5, justificadas: 2 }], por_hora: [{ hora: 11, total: 9 }],
  por_clasificacion: {}, jornada: { marcaciones: 40, con_falta: 4 }, evaluadas: 45, a_tiempo: 17,
}
const ANTERIOR = { ...AGREGADO, total: 50, jornada: { marcaciones: 50, con_falta: 7 } }   // puntualidad anterior: 86 %
const VACIO = { total: 0, marcaciones: 0, por_estado: {}, por_tipo: [], por_sede: [], por_dia: [], por_hora: [], por_clasificacion: {}, jornada: { marcaciones: 0, con_falta: 0 }, evaluadas: 0, a_tiempo: 0 }

type Registro = { tabla: string; llamadas: [string, unknown[]][] }
let registros: Registro[]
let fallaPendientes: boolean

function simular({ actual = AGREGADO, anterior = ANTERIOR, pendientes = [PENDIENTE(1), PENDIENTE(2, { estado: 'sin_justificar' })] as object[], totalPendientes = pendientes.length }:
  { actual?: object; anterior?: object; pendientes?: object[]; totalPendientes?: number } = {}) {
  registros = []
  fallaPendientes = false
  vi.mocked(supabase.rpc).mockImplementation((async (_n: string, p: { p_desde: string }) => {
    const esActual = p.p_desde.startsWith('2026-11-02') || p.p_desde >= '2026-10-31T05:00:00.000Z'
    return { data: esActual ? actual : anterior, error: null }
  }) as never)
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg: Registro = { tabla, llamadas: [] }
    registros.push(reg)
    const respuesta = () => {
      if (tabla === 'sedes') return { data: SEDES, error: null }
      if (fallaPendientes) return { data: null, error: new Error('x'), count: null }
      return { data: pendientes, error: null, count: totalPendientes }
    }
    const cadena: object = new Proxy({}, {
      get: (_, nombre: string) => {
        if (nombre === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(respuesta()).then(ok, ko)
        return (...args: unknown[]) => { reg.llamadas.push([nombre, args]); return cadena }
      },
    })
    return cadena
  }) as never)
}

const consultasPendientes = () => registros.filter((r) => r.tabla === 'v_anomalias_detalle')
const argsDe = (r: Registro, metodo: string) => r.llamadas.filter(([k]) => k === metodo).map(([, a]) => a)
const llamadasRpc = () => vi.mocked(supabase.rpc).mock.calls.map((c) => c[1] as { p_desde: string; p_hasta: string; p_sede: string | null })

function Ubicacion() {
  const l = useLocation()
  return <output data-testid="url">{l.search}</output>
}
const pantalla = (ruta = '/admin') => renderConAuth(
  <Routes><Route path="/admin" element={<><Dashboard /><Ubicacion /></>} /></Routes>,
  { perfil: perfilDe('administrador') }, ruta,
)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T15:00:00Z') })   // jueves 5 de noviembre de 2026
  simular()
})
afterEach(() => { vi.useRealTimers() })

describe('Dashboard · lo que se ve', () => {
  it('abre en el mes actual con los tres indicadores, las gráficas y los pendientes', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('Resumen del periodo · noviembre de 2026 · todas las sedes')).toBeInTheDocument()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('46')).toBeInTheDocument()
    expect(within(indicadores).getByText('−8 % frente al periodo anterior (50)')).toBeInTheDocument()
    expect(within(indicadores).getByText('37,8 %')).toBeInTheDocument()
    expect(within(indicadores).getByText('17 de 45 casos con plazo vencido o justificados')).toBeInTheDocument()
    expect(within(indicadores).getByText('90 %')).toBeInTheDocument()
    expect(within(indicadores).getByText('36 de 40 ingresos y salidas dentro del horario · +4 pts frente al periodo anterior')).toBeInTheDocument()

    expect(screen.getByText('Tendencia de anomalías')).toBeInTheDocument()
    expect(screen.getByText('Anomalías por tipo')).toBeInTheDocument()
    expect(screen.getByText('El más frecuente: Verificación facial fallida')).toBeInTheDocument()
    expect(screen.getByText('Por sede')).toBeInTheDocument()
    expect(screen.getByText('Casos por hora del día')).toBeInTheDocument()
    // El Dashboard no repite lo de Reportes: ni la tabla histórica ni el resumen con IA.
    expect(screen.queryByText('Resumen ejecutivo')).not.toBeInTheDocument()
    expect(screen.queryByText('Histórico de anomalías del periodo')).not.toBeInTheDocument()
  })

  it('la tendencia del mes va por semana, con detectadas y justificadas y su leyenda escrita', async () => {
    pantalla()
    const grafica = await screen.findByText('Tendencia de anomalías')
    const tarjeta = grafica.closest('section') as HTMLElement
    expect(within(tarjeta).getByText('Por semana · las justificadas son de las detectadas')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Detectadas')).toBeInTheDocument()
    expect(within(tarjeta).getByText('Justificadas')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('img')).toHaveAccessibleName(/Tendencia por semana: 5 detectadas y 2 justificadas en el periodo. El máximo fue 5 detectadas: semana del 2 nov/)
  })

  it('pide a la base el mes y el mes anterior de igual duración', async () => {
    pantalla()
    await screen.findByText('Tendencia de anomalías')
    const [actual, anterior] = llamadasRpc()
    expect(actual).toEqual({ p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_sede: null })
    expect(anterior.p_hasta).toBe(actual.p_desde)
  })

  it('un periodo sin casos lo dice y no dibuja gráficas', async () => {
    simular({ actual: VACIO, anterior: VACIO, pendientes: [] })
    pantalla()
    expect(await screen.findByText('No hubo anomalías en este periodo.')).toBeInTheDocument()
    expect(screen.getByText('No hay casos esperando revisión en este periodo.')).toBeInTheDocument()
    expect(screen.queryByText('Tendencia de anomalías')).not.toBeInTheDocument()
    const indicadores = screen.getByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('Sin casos en el periodo anterior')).toBeInTheDocument()
    expect(within(indicadores).getByText('Sin ingresos ni salidas en el periodo')).toBeInTheDocument()
    expect(within(indicadores).getAllByText('—')).toHaveLength(2)
  })
})

describe('Dashboard · filtros', () => {
  it('«Semana» cambia el periodo de lunes a domingo y queda en la dirección', async () => {
    pantalla()
    await screen.findByText('Tendencia de anomalías')
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(screen.getByTestId('url').textContent).toBe('?periodo=semana')
    await waitFor(() => expect(llamadasRpc().some((p) => p.p_desde === '2026-11-02T05:00:00.000Z' && p.p_hasta === '2026-11-09T05:00:00.000Z')).toBe(true))
  })

  it('elegir una sede la manda a las cifras y a los pendientes, y deja de mostrar «Por sede»', async () => {
    pantalla()
    await screen.findByText('Por sede')
    await userEvent.selectOptions(screen.getByLabelText('Sede'), 's2')
    await waitFor(() => expect(screen.queryByText('Por sede')).not.toBeInTheDocument())
    expect(screen.getByText('Resumen del periodo · noviembre de 2026 · Campus Norte')).toBeInTheDocument()
    expect(llamadasRpc().filter((p) => p.p_sede === 's2')).toHaveLength(2)
    const ultima = consultasPendientes()[consultasPendientes().length - 1]
    expect(argsDe(ultima, 'eq')).toContainEqual(['sede_id', 's2'])
  })

  it('«Ver reporte completo» abre Reportes con el mismo periodo y la misma sede', async () => {
    pantalla('/admin?periodo=semana&sede=s1')
    await screen.findByText('Tendencia de anomalías')
    expect(screen.getByRole('link', { name: 'Ver reporte completo' })).toHaveAttribute('href', '/admin/reportes?periodo=semana&sede=s1')
  })

  it('sin filtros, el enlace a Reportes no lleva nada', async () => {
    pantalla()
    await screen.findByText('Tendencia de anomalías')
    expect(screen.getByRole('link', { name: 'Ver reporte completo' })).toHaveAttribute('href', '/admin/reportes')
  })

  it('un rango de más de un año se rechaza y no se consulta nada', async () => {
    pantalla('/admin?periodo=rango&desde=2025-01-01&hasta=2026-11-01')
    expect(await screen.findByText(/como máximo 366 días/)).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(consultasPendientes()).toHaveLength(0)
  })
})

describe('Dashboard · pendientes de revisión', () => {
  it('lista los casos que esperan al administrador, con su enlace para revisar', async () => {
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Pendientes de revisión' })
    expect(await within(seccion).findByText('Ana Pérez')).toBeInTheDocument()
    expect(within(seccion).getByText('2 casos')).toBeInTheDocument()
    expect(within(seccion).getByText('A-1')).toBeInTheDocument()
    expect(within(seccion).getAllByRole('link', { name: 'Revisar' })[0]).toHaveAttribute('href', '/admin/anomalias/p1')
    expect(within(seccion).getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/admin/anomalias')
    expect(within(seccion).getByText('Sin justificar')).toBeInTheDocument()
    const consulta = consultasPendientes()[0]
    expect(argsDe(consulta, 'in')).toEqual([['estado', ['en_revision', 'sin_justificar']]])
  })

  it('con más de seis, avisa que muestra los más recientes', async () => {
    simular({ pendientes: Array.from({ length: 6 }, (_, i) => PENDIENTE(i + 1)), totalPendientes: 31 })
    pantalla()
    expect(await screen.findByText('Mostrando los 6 más recientes de 31.')).toBeInTheDocument()
    expect(screen.getByText('31 casos')).toBeInTheDocument()
  })

  it('si falla solo la lista de pendientes, lo demás sigue ahí', async () => {
    simular()
    fallaPendientes = true
    pantalla()
    expect(await screen.findByText('No se pudieron cargar los casos pendientes')).toBeInTheDocument()
    expect(await screen.findByText('Tendencia de anomalías')).toBeInTheDocument()
  })
})

describe('Dashboard · errores', () => {
  it('si fallan los números, lo dice y deja reintentar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('x') } as never).mockResolvedValueOnce({ data: ANTERIOR, error: null } as never)
    pantalla()
    expect(await screen.findByText(/No se pudieron cargar los números del reporte/)).toBeInTheDocument()
    vi.mocked(supabase.rpc).mockImplementation((async () => ({ data: AGREGADO, error: null })) as never)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Tendencia de anomalías')).toBeInTheDocument()
  })

  it('si solo falla el periodo anterior, salen los números sin comparación', async () => {
    let n = 0
    vi.mocked(supabase.rpc).mockImplementation((async () => (++n === 1 ? { data: AGREGADO, error: null } : { data: null, error: new Error('x') })) as never)
    pantalla()
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getAllByText(/Sin datos del periodo anterior/)).toHaveLength(2)   // el total y la puntualidad
  })
})
