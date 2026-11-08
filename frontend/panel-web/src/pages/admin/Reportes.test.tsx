import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Reportes from './Reportes'
import { descargarBinario, descargarTexto } from './reportesExportar'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../../lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error { status: number; constructor(status: number, mensaje: string) { super(mensaje); this.status = status } },
}))
vi.mock('./reportesExportar', async (original) => ({ ...(await original<typeof import('./reportesExportar')>()), descargarTexto: vi.fn(), descargarBinario: vi.fn() }))

const SEDES = [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Campus Norte' }]
const FILA = (n: number, extra: object = {}) => ({
  id: `a${n}`, numero: n, caso: `A-${n}`, tipo: 'fuera_geocerca', estado: 'justificada', created_at: '2026-11-03T14:00:00Z',
  colaborador: n === 1 ? 'Ana Pérez' : `Persona ${n}`, sede: 'Matriz', clasificacion_ia: 'aceptable', decision_final: 'aprobada',
  revisado_por_nombre: 'Luis Vera', fecha_decision: '2026-11-04T14:00:00Z', ...extra,
})
const AGREGADO = {
  total: 46, marcaciones: 24,
  por_estado: { pendiente: 29, rechazada: 3, en_revision: 10, justificada: 4 },
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 28 }, { sede_id: 's2', sede: 'Campus Norte', total: 18 }],
  por_dia: [{ dia: '2026-11-03', total: 5, justificadas: 2 }], por_hora: [{ hora: 11, total: 9 }],
  por_clasificacion: { requiere_revision: 3 }, evaluadas: 45, a_tiempo: 17,
}
const ANTERIOR = { ...AGREGADO, total: 50 }
const VACIO = { total: 0, marcaciones: 0, por_estado: {}, por_tipo: [], por_sede: [], por_dia: [], por_hora: [], por_clasificacion: {}, evaluadas: 0, a_tiempo: 0 }

type Registro = { tabla: string; llamadas: [string, unknown[]][] }
let registros: Registro[]
let filas: object[]
let total: number
let falla: boolean

/** Una base de datos de mentira: anota cada consulta y responde lo programado. */
function simular({ actual = AGREGADO, anterior = ANTERIOR, filasTabla = [FILA(1), FILA(2)] as object[], totalTabla = filasTabla.length }: { actual?: object; anterior?: object; filasTabla?: object[]; totalTabla?: number } = {}) {
  registros = []
  filas = filasTabla
  total = totalTabla
  falla = false
  vi.mocked(supabase.rpc).mockImplementation((async (_n: string, p: { p_desde: string }) => {
    const esActual = p.p_desde >= '2026-10-31T05:00:00.000Z' || p.p_desde.startsWith('2026-11-02')   // el periodo mostrado; el otro es el anterior
    return { data: esActual ? actual : anterior, error: null }
  }) as never)
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg: Registro = { tabla, llamadas: [] }
    registros.push(reg)
    const respuesta = () => {
      if (tabla === 'sedes') return { data: SEDES, error: null }
      if (falla) return { data: null, error: new Error('x'), count: null }
      const [desde, hasta] = (reg.llamadas.find(([k]) => k === 'range')?.[1] ?? [0, 0]) as number[]
      return { data: filas.slice(0, Math.max(0, Math.min(hasta - desde + 1, total - desde))), error: null, count: total }
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

const consultasDeTabla = () => registros.filter((r) => r.tabla === 'v_anomalias_detalle')
const ultimaTabla = () => consultasDeTabla()[consultasDeTabla().length - 1]
const argsDe = (r: Registro, metodo: string) => r.llamadas.filter(([k]) => k === metodo).map(([, a]) => a)
const llamadasRpc = () => vi.mocked(supabase.rpc).mock.calls.map((c) => c[1] as { p_desde: string; p_hasta: string; p_sede: string | null })

function Ubicacion() {
  const l = useLocation()
  return <output data-testid="url">{l.search}</output>
}
const pantalla = (ruta = '/admin/reportes') => renderConAuth(
  <Routes><Route path="/admin/reportes" element={<><Reportes /><Ubicacion /></>} /></Routes>,
  { perfil: perfilDe('administrador') }, ruta,
)
const url = () => screen.getByTestId('url').textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T15:00:00Z') })   // jueves 5 de noviembre de 2026
  vi.mocked(api).mockReset()
  vi.mocked(api).mockResolvedValue({ resumen: 'En noviembre se registraron 46 anomalías.' })
  vi.mocked(descargarTexto).mockReset()
  vi.mocked(descargarBinario).mockReset()
  simular()
})
afterEach(() => { vi.useRealTimers() })

describe('Reportes · lo que se ve', () => {
  it('abre en el mes actual, en la pestaña «Resumen»: las cifras primero y la tabla aparte', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument()
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026')).toBeInTheDocument()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('46')).toBeInTheDocument()
    expect(within(indicadores).getByText('−8 % · antes 50')).toBeInTheDocument()
    expect(screen.getByText('Cómo va cada caso')).toBeInTheDocument()
    // La plantilla «Resumen» lleva cuatro indicadores; rechazo facial y «por resolver» tienen su propia plantilla.
    for (const t of ['Anomalías', 'Justificadas a tiempo', 'Puntualidad', 'Resolución']) expect(within(indicadores).getByText(t)).toBeInTheDocument()
    for (const t of ['Rechazo facial', 'Por resolver']) expect(within(indicadores).queryByText(t)).not.toBeInTheDocument()

    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Casos del periodo (46)' })).toHaveAttribute('aria-selected', 'false')
    // La tabla no se ve (ni se pide) hasta abrir la pestaña de casos.
    expect(screen.queryByRole('region', { name: 'Histórico de anomalías' })).not.toBeInTheDocument()
    expect(consultasDeTabla()).toHaveLength(0)
  })

  it('la pestaña «Casos del periodo» trae la tabla histórica y queda en la dirección', async () => {
    pantalla()
    await userEvent.click(await screen.findByRole('tab', { name: /Casos del periodo/ }))
    expect(url()).toBe('?vista=casos')
    const tabla = await screen.findByRole('region', { name: 'Histórico de anomalías' })
    expect(await within(tabla).findByText('Ana Pérez')).toBeInTheDocument()
    expect(within(tabla).getAllByText('Aprobada · Luis Vera')).toHaveLength(2)
    expect(within(tabla).getByRole('link', { name: 'A-1' })).toHaveAttribute('href', '/admin/anomalias/a1')
    expect(within(tabla).getByText('2 registros')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Indicadores del periodo' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Resumen' }))
    expect(url()).toBe('')
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
  })

  it('las pestañas se mueven con las flechas del teclado', async () => {
    pantalla()
    const resumen = await screen.findByRole('tab', { name: 'Resumen' })
    resumen.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(url()).toBe('?plantilla=sedes')
    expect(screen.getByRole('tab', { name: 'Sede contra sede' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}')
    expect(url()).toBe('')
    await userEvent.keyboard('{ArrowLeft}')   // desde la primera se da la vuelta hasta «Casos del periodo»
    expect(url()).toBe('?vista=casos')
    expect(screen.getByRole('tab', { name: /Casos del periodo/ })).toHaveFocus()
  })

  it('trae las gráficas de análisis que ya no caben en el Dashboard: tendencia y tipo (y, en «Asistencia por sede», sede y hora)', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    const grafica = await screen.findByText('Tendencia de anomalías')
    const tarjeta = grafica.closest('section') as HTMLElement
    expect(within(tarjeta).getByText('Por semana · las justificadas son de las detectadas')).toBeInTheDocument()
    expect(within(tarjeta).getByRole('img')).toHaveAccessibleName(/Tendencia por semana: 5 detectadas y 2 justificadas en el periodo. El máximo fue 5 detectadas: semana del 2 nov/)
    expect(screen.getByText('Anomalías por tipo')).toBeInTheDocument()
    expect(screen.getByText('El más frecuente: Verificación facial fallida')).toBeInTheDocument()
    expect(screen.queryByText('Por sede')).not.toBeInTheDocument()
  })

  it('«Asistencia por sede» trae «Por sede» y la hora del día', async () => {
    pantalla('/admin/reportes?plantilla=sedes')
    expect(await screen.findByText('Por sede')).toBeInTheDocument()
    expect(screen.getByText('La que más casos tuvo: Matriz')).toBeInTheDocument()
    expect(screen.getByText('Casos por hora del día')).toBeInTheDocument()
    expect(screen.queryByText('Tendencia de anomalías')).not.toBeInTheDocument()
  })

  it('al elegir una sede, «Por sede» deja de mostrarse', async () => {
    pantalla('/admin/reportes?plantilla=sedes')
    await screen.findByText('Por sede')
    await userEvent.selectOptions(screen.getByLabelText('Sede'), 's2')
    await waitFor(() => expect(screen.queryByText('Por sede')).not.toBeInTheDocument())
    expect(screen.getByText('Casos por hora del día')).toBeInTheDocument()
  })

  it('un periodo sin casos no dibuja gráficas', async () => {
    simular({ actual: VACIO, anterior: VACIO })
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(screen.queryByText('Tendencia de anomalías')).not.toBeInTheDocument()
    expect(screen.queryByText('Anomalías por tipo')).not.toBeInTheDocument()
  })

  it('pide a la base el mes completo y el mes anterior de igual duración, en hora de Ecuador', async () => {
    pantalla('/admin/reportes?vista=casos')
    await screen.findByRole('region', { name: 'Histórico de anomalías' })
    await waitFor(() => expect(consultasDeTabla().length).toBeGreaterThan(0))
    const pedidos = llamadasRpc()
    expect(pedidos).toContainEqual({ p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_sede: null })
    expect(pedidos).toContainEqual({ p_desde: '2026-10-02T05:00:00.000Z', p_hasta: '2026-11-01T05:00:00.000Z', p_sede: null })
    const t = ultimaTabla()
    expect(argsDe(t, 'gte')[0]).toEqual(['created_at', '2026-11-01T05:00:00.000Z'])
    expect(argsDe(t, 'lt')[0]).toEqual(['created_at', '2026-12-01T05:00:00.000Z'])
  })
})

describe('Reportes · periodo', () => {
  it('«Semana» cambia el periodo de lunes a domingo y queda en la dirección', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(url()).toBe('?periodo=semana')
    expect(await screen.findByText('Histórico de anomalías · 2 – 8 nov 2026')).toBeInTheDocument()
    await waitFor(() => expect(llamadasRpc()).toContainEqual({ p_desde: '2026-11-02T05:00:00.000Z', p_hasta: '2026-11-09T05:00:00.000Z', p_sede: null }))
  })

  it('‹ va al periodo anterior y › se bloquea mientras el periodo incluya hoy', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
    expect(await screen.findByText('Histórico de anomalías · octubre de 2026')).toBeInTheDocument()
    expect(url()).toBe('?ref=2026-10-01')
    expect(screen.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Periodo siguiente' }))
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026')).toBeInTheDocument()
  })

  it('el rango personalizado pide exactamente esas fechas', async () => {
    pantalla('/admin/reportes?periodo=rango&desde=2026-10-05&hasta=2026-10-20')
    expect(await screen.findByText('Histórico de anomalías · 5 – 20 oct 2026')).toBeInTheDocument()
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-10-05')
    expect(screen.getByLabelText('Hasta')).toHaveValue('2026-10-20')
    expect(screen.getByText('16 días')).toBeInTheDocument()
    await waitFor(() => expect(llamadasRpc()).toContainEqual({ p_desde: '2026-10-05T05:00:00.000Z', p_hasta: '2026-10-21T05:00:00.000Z', p_sede: null }))
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-25' } })
    expect(await screen.findByText('Histórico de anomalías · 5 – 25 oct 2026')).toBeInTheDocument()
    expect(url()).toContain('hasta=2026-10-25')
  })

  it('un rango de más de un año se rechaza y no se consulta nada', async () => {
    pantalla('/admin/reportes?periodo=rango&desde=2024-01-01&hasta=2026-01-01')
    expect(await screen.findByText(/como máximo 366 días/)).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(consultasDeTabla()).toHaveLength(0)
    expect(screen.queryByRole('region', { name: 'Resumen ejecutivo' })).not.toBeInTheDocument()
  })
})

describe('Reportes · sede', () => {
  it('elegir una sede la manda a la base, deja de mostrar «Por sede» y la nombra en el encabezado', async () => {
    pantalla('/admin/reportes?plantilla=sedes')
    await screen.findByText('Por sede')
    await screen.findByRole('option', { name: 'Campus Norte' })
    await userEvent.selectOptions(screen.getByLabelText('Sede'), 's2')
    expect(url()).toBe('?plantilla=sedes&sede=s2')
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026 · Campus Norte · Asistencia por sede')).toBeInTheDocument()
    await waitFor(() => expect(llamadasRpc().filter((p) => p.p_desde && p.p_sede === 's2')).toHaveLength(4))   // el periodo y el anterior, y las 2 del comparativo de antes de filtrar
    await waitFor(() => expect(screen.queryByText('Por sede')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('tab', { name: /Casos del periodo/ }))
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['sede_id', 's2']))
  })

  it('una sede que ya no existe en la dirección se ignora', async () => {
    pantalla('/admin/reportes?sede=borrada')
    await screen.findByRole('option', { name: 'Matriz' })
    await waitFor(() => expect(screen.getByLabelText('Sede')).toHaveValue(''))
    await waitFor(() => expect(llamadasRpc().some((p) => p.p_sede === null)).toBe(true))
  })
})

describe('Reportes · resumen con IA', () => {
  it('lo pide con solo números y lo muestra', async () => {
    pantalla()
    const resumen = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    expect(await within(resumen).findByText('En noviembre se registraron 46 anomalías.')).toBeInTheDocument()
    expect(within(resumen).getByText('Redactado por IA a partir de las cifras · noviembre de 2026 · todas las sedes')).toBeInTheDocument()
    expect(api).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(api).mock.calls[0] as [string, { method: string; body: Record<string, unknown> }]
    expect(ruta).toBe('/reportes/resumen')
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toMatchObject({ periodo: 'noviembre de 2026', sede: null, total: 46, total_anterior: 50, variacion_pct: -8, marcaciones: 24, a_tiempo_pct: 37.8 })
    expect(JSON.stringify(opciones.body)).not.toMatch(/Ana|Pérez|@/)
  })

  it('si la IA falla, el resto del reporte sigue ahí y se puede reintentar', async () => {
    const { ApiError } = await import('../../lib/api')
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'Aún no hay una IA configurada', undefined, undefined))
    pantalla()
    const resumen = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    expect(await within(resumen).findByText(/Aún no hay una IA configurada/)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Casos del periodo/ })).toBeInTheDocument()
    await userEvent.click(within(resumen).getByRole('button', { name: 'Reintentar' }))
    expect(await within(resumen).findByText('En noviembre se registraron 46 anomalías.')).toBeInTheDocument()
  })

  it('un periodo sin casos no gasta ninguna llamada a la IA y no se puede exportar', async () => {
    simular({ actual: VACIO as never, anterior: VACIO as never, filasTabla: [] })
    pantalla()
    expect(await screen.findByText('No hubo anomalías en este periodo: no hay nada que resumir.')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
    expect(screen.queryByText('Cómo va cada caso')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeDisabled()
    expect(screen.getByText('Antes: 0 casos')).toBeInTheDocument()
  })
})

describe('Reportes · tabla histórica', () => {
  it('filtra por estado y por tipo en la base, vuelve a la página 1 y se puede borrar', async () => {
    simular({ filasTabla: Array.from({ length: 40 }, (_, i) => FILA(i + 1)), totalTabla: 40 })
    pantalla('/admin/reportes?vista=casos&pagina=3')
    await screen.findByText('Página 3 de 3')
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'rechazada')
    expect(url()).toBe('?vista=casos&estado=rechazada')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['estado', 'rechazada']))
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['tipo', 'duplicada']))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }))
    expect(url()).toBe('?vista=casos')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toEqual([]))
  })

  it('filtrar o cambiar de página solo vuelve a pedir la tabla: las cifras y la IA no se piden otra vez', async () => {
    simular({ filasTabla: Array.from({ length: 40 }, (_, i) => FILA(i + 1)), totalTabla: 40 })
    pantalla('/admin/reportes?vista=casos')
    await screen.findByText('Página 1 de 3')
    const cifras = vi.mocked(supabase.rpc).mock.calls.length
    const resumenes = vi.mocked(api).mock.calls.length
    expect(cifras).toBe(2)   // el periodo y el anterior; en «Casos del periodo» no se piden ni los patrones ni el comparativo
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'rechazada')
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['tipo', 'duplicada']))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }))
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toEqual([]))
    expect(vi.mocked(supabase.rpc).mock.calls.length).toBe(cifras)
    expect(vi.mocked(api).mock.calls.length).toBe(resumenes)
  })

  it('pagina de a 15, del más reciente al más antiguo', async () => {
    simular({ filasTabla: Array.from({ length: 40 }, (_, i) => FILA(i + 1)), totalTabla: 40 })
    pantalla('/admin/reportes?vista=casos')
    expect(await screen.findByText('Mostrando 1–15 de 40 · del más reciente al más antiguo')).toBeInTheDocument()
    expect(argsDe(ultimaTabla(), 'range')[0]).toEqual([0, 14])
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(url()).toBe('?vista=casos&pagina=2')
    expect(await screen.findByText('Mostrando 16–30 de 40 · del más reciente al más antiguo')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(argsDe(ultimaTabla(), 'range')[0]).toEqual([15, 29])
  })

  it('con filtros sin resultados lo dice distinto que un periodo vacío', async () => {
    simular({ filasTabla: [], totalTabla: 0 })
    pantalla('/admin/reportes?vista=casos&estado=rechazada')
    expect(await screen.findByText('No hay anomalías que coincidan con esos filtros.')).toBeInTheDocument()
  })

  it('si la tabla falla, lo dice sin tumbar el resto', async () => {
    simular()
    falla = true
    pantalla('/admin/reportes?vista=casos')
    expect(await screen.findByText('No se pudo cargar la tabla histórica')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Resumen' })).toBeInTheDocument()
  })
})

describe('Reportes · si fallan los números', () => {
  it('avisa, no muestra el resumen y deja reintentar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: new Error('x') } as never)
    pantalla()
    expect(await screen.findByText(/No se pudieron cargar los números del reporte/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen ejecutivo' })).not.toBeInTheDocument()
    vi.mocked(supabase.rpc).mockImplementation((async () => ({ data: AGREGADO, error: null })) as never)
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
  })

  it('si solo falla el periodo anterior, el reporte sale sin comparación', async () => {
    let n = 0
    vi.mocked(supabase.rpc).mockImplementation((async () => (++n === 1 ? { data: AGREGADO, error: null } : { data: null, error: new Error('x') })) as never)
    pantalla()
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('Sin periodo anterior')).toBeInTheDocument()
  })
})

const llamadasA = (nombre: string) => vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === nombre).map((c) => c[1] as Record<string, unknown>)

/** Abre el cuadro de exportar (espera a que las cifras estén y el botón se active). */
const abrirExportar = async () => {
  const boton = await screen.findByRole('button', { name: 'Exportar' })
  await waitFor(() => expect(boton).toBeEnabled())
  await userEvent.click(boton)
  return screen.findByRole('dialog', { name: 'Exportar reporte' })
}
const elegirFormato = (dialogo: HTMLElement, nombre: RegExp) => userEvent.click(within(dialogo).getByRole('radio', { name: nombre }))
const descargar = (dialogo: HTMLElement, nombre: RegExp) => userEvent.click(within(dialogo).getByRole('button', { name: nombre }))
const casilla = (dialogo: HTMLElement, nombre: RegExp) => within(dialogo).getByRole('checkbox', { name: nombre })

describe('Reportes · exportar', () => {
  it('el botón abre un cuadro con el alcance y las partes que se ven, sin descargar nada todavía', async () => {
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    expect(within(d).getByText('noviembre de 2026 · todas las sedes')).toBeInTheDocument()
    for (const t of [/Resumen redactado por IA/, /Indicadores del periodo/, /Cómo va cada caso/, /Tendencia, tipo y sede/, /Tabla de casos/]) expect(casilla(d, t)).toBeChecked()
    // Lo que va plegado bajo «Más análisis» no viene marcado, pero se puede pedir.
    for (const t of [/Sede contra sede/, /Anomalías por hora del día/, /Patrones a revisar/]) expect(casilla(d, t)).not.toBeChecked()
    expect(within(d).getByRole('status')).toHaveTextContent('Se descargará: PDF · 5 secciones')
    expect(descargarTexto).not.toHaveBeenCalled()
    expect(descargarBinario).not.toHaveBeenCalled()
    expect(llamadasA('registrar_exportacion')).toHaveLength(0)
  })

  it('en «Casos del periodo» solo viene marcada la tabla, y el resumen se explica en lugar de desaparecer', async () => {
    pantalla('/admin/reportes?vista=casos')
    const d = await abrirExportar()
    expect(casilla(d, /Tabla de casos/)).toBeChecked()
    expect(casilla(d, /Indicadores del periodo/)).not.toBeChecked()
    expect(casilla(d, /Resumen redactado por IA/)).toBeDisabled()
    expect(within(d).getByText('ábrelo desde «Resumen»')).toBeInTheDocument()
  })

  it('«Quitar todo» deja el botón sin poder descargar; «Solo la tabla de casos» y «Todo» marcan lo que dicen', async () => {
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await userEvent.click(within(d).getByRole('button', { name: 'Quitar todo' }))
    expect(within(d).getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
    await userEvent.click(within(d).getByRole('button', { name: 'Solo la tabla de casos' }))
    expect(casilla(d, /Tabla de casos/)).toBeChecked()
    expect(casilla(d, /Resumen redactado por IA/)).not.toBeChecked()
    expect(within(d).getByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
    await userEvent.click(within(d).getByRole('button', { name: 'Todo' }))
    expect(casilla(d, /Resumen redactado por IA/)).toBeChecked()
    expect(casilla(d, /Tabla de casos/)).toBeChecked()
  })

  it('con una sede elegida, «Sede contra sede» se explica y no se puede marcar', async () => {
    pantalla('/admin/reportes?sede=s2')
    const d = await abrirExportar()
    expect(casilla(d, /Sede contra sede/)).toBeDisabled()
    expect(within(d).getByText('quita el filtro de sede')).toBeInTheDocument()
  })

  it('el CSV trae todo el periodo filtrado, solo la tabla, y se descarga con el nombre del periodo', async () => {
    simular({ filasTabla: [FILA(1), FILA(2), FILA(3)] })
    pantalla('/admin/reportes?estado=justificada')
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    expect(within(d).getByText('El CSV lleva solo la tabla de casos, con todos los casos del periodo.')).toBeInTheDocument()
    await descargar(d, /Descargar CSV/)
    await waitFor(() => expect(descargarTexto).toHaveBeenCalledTimes(1))
    const [nombre, contenido] = vi.mocked(descargarTexto).mock.calls[0] as [string, string]
    expect(nombre).toBe('reporte-anomalias-2026-11-01-a-2026-11-30.csv')
    expect(contenido.startsWith('﻿Caso;Fecha y hora;Colaborador')).toBe(true)
    expect(contenido.split('\r\n').filter(Boolean)).toHaveLength(4)
    expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['estado', 'justificada'])
    expect(await screen.findByText('CSV listo: 3 casos')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Exportar reporte' })).not.toBeInTheDocument()
  })

  it('el PDF arma la versión imprimible con lo elegido, abre el diálogo de impresión y la retira al terminar', async () => {
    const imprimir = vi.fn()
    Object.assign(window, { print: imprimir })
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await descargar(d, /Descargar PDF/)
    const hoja = await waitFor(() => { const e = document.getElementById('reporte-impresion'); expect(e).not.toBeNull(); return e as HTMLElement })
    expect(within(hoja).getByRole('heading', { name: 'Reporte de anomalías' })).toBeInTheDocument()
    expect(within(hoja).getByText('noviembre de 2026 · Todas las sedes')).toBeInTheDocument()
    expect(within(hoja).getByText('En noviembre se registraron 46 anomalías.')).toBeInTheDocument()
    expect(within(hoja).getByText(/redactado por IA a partir de las cifras/)).toBeInTheDocument()
    expect(within(hoja).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(hoja).getByText('2 casos')).toBeInTheDocument()
    await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1))
    expect(document.title).toBe('Reporte de anomalías · noviembre de 2026')
    act(() => { window.dispatchEvent(new Event('afterprint')) })
    await waitFor(() => expect(document.getElementById('reporte-impresion')).toBeNull())
    expect(document.title).not.toContain('Reporte de anomalías')
  })

  it('un PDF «solo cifras» no lleva ni el resumen ni la tabla, y ni siquiera pide los casos', async () => {
    Object.assign(window, { print: vi.fn() })
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await userEvent.click(within(d).getByRole('button', { name: 'Solo cifras y gráficas' }))
    await descargar(d, /Descargar PDF/)
    const hoja = await waitFor(() => { const e = document.getElementById('reporte-impresion'); expect(e).not.toBeNull(); return e as HTMLElement })
    expect(within(hoja).queryByText('En noviembre se registraron 46 anomalías.')).not.toBeInTheDocument()
    expect(within(hoja).queryByText('Ana Pérez')).not.toBeInTheDocument()
    expect(consultasDeTabla()).toHaveLength(0)
  })

  it('si hay más casos que el tope, avisa que el archivo quedó recortado', async () => {
    simular({ filasTabla: Array.from({ length: 1000 }, (_, i) => FILA(i + 1)), totalTabla: 5400 })
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    await descargar(d, /Descargar CSV/)
    expect(await screen.findByText(/primeros 5000 de 5400 casos/)).toBeInTheDocument()
  })

  it('si la exportación falla, avisa, deja el cuadro abierto y permite intentar otra vez', async () => {
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    falla = true
    await descargar(d, /Descargar CSV/)
    expect(await screen.findByText('No se pudo preparar la exportación. Intenta de nuevo')).toBeInTheDocument()
    expect(descargarTexto).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Exportar reporte' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Descargar CSV' })).toBeEnabled()
  })

  it('el cuadro se cierra con Escape, con Cancelar y con ✕', async () => {
    pantalla()
    await abrirExportar()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Exportar reporte' })).not.toBeInTheDocument()
    let d = await abrirExportar()
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Exportar reporte' })).not.toBeInTheDocument()
    d = await abrirExportar()
    await userEvent.click(within(d).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog', { name: 'Exportar reporte' })).not.toBeInTheDocument()
  })
})

describe('Reportes · plantillas', () => {
  it('las pestañas son las cinco plantillas y, al final, «Casos del periodo»; la primera viene elegida', async () => {
    pantalla()
    const lista = await screen.findByRole('tablist', { name: 'Partes del reporte' })
    await within(lista).findByRole('tab', { name: 'Casos del periodo (46)' })
    expect(within(lista).getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Resumen', 'Sede contra sede', 'Casos recurrentes', 'Calidad biométrica', 'Plazos', 'Casos del periodo (46)',
    ])
    expect(within(lista).getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
    expect(within(lista).getByRole('tab', { name: 'Casos recurrentes' })).toHaveAttribute('aria-selected', 'false')
  })

  it('elegir una queda en la dirección, cambia el encabezado y vuelve al principio con la primera', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await userEvent.click(screen.getByRole('tab', { name: 'Plazos' }))
    expect(url()).toBe('?plantilla=plazos')
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026 · Cumplimiento de plazos')).toBeInTheDocument()
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    for (const t of ['Justificadas a tiempo', 'Resolución', 'Por resolver']) expect(within(indicadores).getByText(t)).toBeInTheDocument()
    expect(screen.queryByText('Anomalías por tipo')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Resumen' }))
    expect(url()).toBe('')
  })

  it('una plantilla desconocida en la dirección se trata como la primera', async () => {
    pantalla('/admin/reportes?plantilla=inventada')
    expect(await screen.findByRole('region', { name: 'Resumen ejecutivo' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true')
  })

  it('«Calidad biométrica» abre la tabla solo con verificaciones fallidas, sin gastar la IA; las demás quitan ese filtro', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    const llamadasIA = vi.mocked(api).mock.calls.length
    await userEvent.click(screen.getByRole('tab', { name: 'Calidad biométrica' }))
    expect(url()).toBe('?plantilla=biometrica&tipo=verificacion_fallida')
    await userEvent.click(screen.getByRole('tab', { name: /Casos del periodo/ }))
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['tipo', 'verificacion_fallida']))
    expect(screen.getByLabelText('Tipo')).toHaveValue('verificacion_fallida')
    await userEvent.click(screen.getByRole('tab', { name: 'Calidad biométrica' }))
    expect(within(await screen.findByRole('region', { name: 'Indicadores del periodo' })).getByText('Rechazo facial')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Resumen ejecutivo' })).not.toBeInTheDocument()
    expect(vi.mocked(api).mock.calls.length).toBe(llamadasIA)   // la IA no se vuelve a llamar
    await userEvent.click(screen.getByRole('tab', { name: 'Sede contra sede' }))
    expect(url()).toBe('?plantilla=sedes')
    await userEvent.click(screen.getByRole('tab', { name: /Casos del periodo/ }))
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toEqual([]))
  })

  it('la IA solo se llama en la plantilla que lleva resumen', async () => {
    pantalla('/admin/reportes?plantilla=plazos')
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(api).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Resumen ejecutivo' })).not.toBeInTheDocument()
  })

  it('«Casos recurrentes» muestra los patrones a revisar y no pide el resumen', async () => {
    pantalla('/admin/reportes?plantilla=recurrentes')
    expect(await screen.findByRole('region', { name: 'Patrones a revisar' })).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
    expect(llamadasA('patrones_anomalias')).toHaveLength(1)
  })

  it('las plantillas sin patrones ni resumen no consultan los patrones', async () => {
    pantalla('/admin/reportes?plantilla=plazos')
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(llamadasA('patrones_anomalias')).toHaveLength(0)
  })
})

describe('Reportes · desde cada cifra se llega a sus casos', () => {
  it('los indicadores son enlaces a «Casos del periodo» con el filtro que les toca, sin perder la sede ni el periodo', async () => {
    pantalla('/admin/reportes?sede=s2&periodo=semana')
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    const enlaces = within(indicadores).getAllByRole('link')
    expect(enlaces).toHaveLength(4)
    const href = (texto: RegExp) => within(indicadores).getByRole('link', { name: texto }).getAttribute('href') as string
    expect(href(/Anomalías/)).toBe('/admin/reportes?sede=s2&periodo=semana&vista=casos')
    expect(href(/Justificadas a tiempo/)).toContain('estado=sin_justificar')
    expect(href(/Puntualidad/)).toContain('tipo=fuera_horario')
    expect(href(/Puntualidad/)).toContain('sede=s2')
  })

  it('al tocar uno se abre «Casos del periodo» ya filtrado y con la página en 1', async () => {
    pantalla('/admin/reportes?pagina=2')
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await userEvent.click(within(indicadores).getByRole('link', { name: /Justificadas a tiempo/ }))
    expect(url()).toBe('?vista=casos&estado=sin_justificar')
    expect(await screen.findByRole('region', { name: 'Histórico de anomalías' })).toBeInTheDocument()
    expect(screen.getByLabelText('Estado')).toHaveValue('sin_justificar')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['estado', 'sin_justificar']))
  })

  it('«Cómo va cada caso» y «Anomalías por tipo» también llevan a sus casos', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await userEvent.click(await screen.findByRole('link', { name: /Rechazada: 3 casos. Ver sus casos/ }))
    expect(url()).toBe('?vista=casos&estado=rechazada')
    await userEvent.click(screen.getByRole('tab', { name: 'Resumen' }))
    await userEvent.click(await screen.findByRole('link', { name: /Verificación facial fallida: 21 casos. Ver sus casos/ }))
    expect(url()).toBe('?vista=casos&tipo=verificacion_fallida')
  })
})

describe('Reportes · «Más análisis»', () => {
  it('lo de segundo nivel viene plegado, con una línea de lo que trae cada parte', async () => {
    pantalla()
    const mas = await screen.findByRole('region', { name: 'Más análisis' })
    const partes = mas.querySelectorAll('details')
    expect(partes).toHaveLength(3)
    partes.forEach((p) => expect(p).not.toHaveAttribute('open'))
    const titulos = Array.from(mas.querySelectorAll('summary')).map((x) => x.querySelector('span:nth-of-type(1)')?.textContent)
    expect(titulos).toEqual(['Sede contra sede', '¿Cuándo ocurren?', 'Patrones a revisar'])
    expect(within(mas).getByText('Matriz 28 · Campus Norte 18')).toBeInTheDocument()
  })

  it('«Sede contra sede» ya no está suelto en el Resumen; las demás plantillas lo traen abierto', async () => {
    pantalla('/admin/reportes?plantilla=sedes')
    await screen.findByRole('region', { name: 'Sede contra sede' })
    expect(screen.queryByRole('region', { name: 'Más análisis' })).not.toBeInTheDocument()
  })
})

describe('Reportes · sede contra sede', () => {
  it('compara todas las sedes, cada una con su periodo y el anterior', async () => {
    pantalla('/admin/reportes?plantilla=sedes')
    const region = await screen.findByRole('region', { name: 'Sede contra sede' })
    await waitFor(() => expect(region.querySelectorAll('.tabla-fila')).toHaveLength(2))
    expect(within(region).getByText('Matriz')).toBeInTheDocument()
    expect(within(region).getByText('Campus Norte')).toBeInTheDocument()
    const porSede = llamadasRpc().filter((p) => p.p_desde && p.p_sede)
    expect(porSede.filter((p) => p.p_sede === 's1')).toHaveLength(2)
    expect(porSede.filter((p) => p.p_sede === 's2')).toHaveLength(2)
  })

  it('con una sede elegida no compara: avisa que hay que quitar el filtro', async () => {
    pantalla('/admin/reportes?plantilla=sedes&sede=s1')
    expect(await screen.findByText(/compara todas las sedes: quita el filtro de sede/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Sede contra sede' })).not.toBeInTheDocument()
  })

  it('la plantilla inicial también lo trae', async () => {
    pantalla()
    expect(await screen.findByRole('region', { name: 'Sede contra sede' })).toBeInTheDocument()
  })

  it('si falla, lo dice sin tumbar el resto del reporte', async () => {
    vi.mocked(supabase.rpc).mockImplementation((async (_n: string, p: { p_sede?: string | null }) => (p.p_sede ? { data: null, error: new Error('x') } : { data: AGREGADO, error: null })) as never)
    pantalla('/admin/reportes?plantilla=sedes')
    expect(await screen.findByText(/No se pudo cargar el comparativo/)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Casos del periodo/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Indicadores del periodo' })).not.toBeInTheDocument()   // «Asistencia por sede» no lleva indicadores
  })
})

describe('Reportes · ficha y cómo se calcula', () => {
  it('están a un botón de distancia, sea cual sea la plantilla, y no ocupan sitio mientras tanto', async () => {
    pantalla('/admin/reportes?plantilla=biometrica')
    const ficha = await screen.findByRole('button', { name: 'Ficha por persona' })
    expect(screen.queryByRole('dialog', { name: 'Ficha por persona' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Cómo se calcula' })).not.toBeInTheDocument()
    await userEvent.click(ficha)
    expect(await screen.findByRole('dialog', { name: 'Ficha por persona' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Ficha por persona' }))
    expect(screen.queryByRole('dialog', { name: 'Ficha por persona' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cómo se calcula' }))
    expect(await screen.findByRole('dialog', { name: 'Cómo se calcula' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Cómo se calcula' })).not.toBeInTheDocument()
  })

  it('con un rango demasiado largo no se ven (no hay nada que consultar)', async () => {
    pantalla('/admin/reportes?periodo=rango&desde=2024-01-01&hasta=2026-01-01')
    await screen.findByText(/como máximo 366 días/)
    expect(screen.queryByRole('dialog', { name: 'Ficha por persona' })).not.toBeInTheDocument()
  })
})


describe('Reportes · el resumen de la IA solo redacta', () => {
  const resumenRegion = async () => {
    const r = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    await within(r).findByText('En noviembre se registraron 46 anomalías.')
    return r
  }

  it('dice que lo redactó la IA a partir de las cifras y que decide una persona', async () => {
    pantalla()
    const r = await resumenRegion()
    expect(within(r).getByText('Redactado por IA a partir de las cifras · noviembre de 2026 · todas las sedes')).toBeInTheDocument()
    expect(within(r).getByText('La IA sugiere; la decisión es de una persona.')).toBeInTheDocument()
  })

  it('no ofrece regenerar, marcar como revisado ni acciones sugeridas: la IA solo escribe el resumen', async () => {
    pantalla()
    const r = await resumenRegion()
    expect(within(r).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText(/Regenerar|Marcar como revisado|Revisado por|Borrador de IA|Acciones sugeridas/)).not.toBeInTheDocument()
  })

  it('cambiar de periodo pide otro resumen y lo rotula con el periodo nuevo', async () => {
    pantalla()
    await resumenRegion()
    vi.mocked(api).mockResolvedValue({ resumen: 'Octubre fue más tranquilo.' })
    await userEvent.click(screen.getByRole('button', { name: 'Periodo anterior' }))
    await screen.findByText('Octubre fue más tranquilo.')
    expect(screen.getByText('Redactado por IA a partir de las cifras · octubre de 2026 · todas las sedes')).toBeInTheDocument()
  })

  it('sin texto de la IA no hay nada que incluir: el cuadro de exportar lo dice', async () => {
    const { ApiError } = await import('../../lib/api')
    vi.mocked(api).mockRejectedValue(new ApiError(503, 'Aún no hay una IA configurada', undefined, undefined))
    pantalla()
    const r = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    await within(r).findByText(/Aún no hay una IA configurada/)
    const d = await abrirExportar()
    expect(casilla(d, /Resumen redactado por IA/)).toBeDisabled()
    expect(within(d).getByText('aún no está listo')).toBeInTheDocument()
  })
})

describe('Reportes · exportar deja constancia en Auditoría', () => {
  const BASE = { p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_sede: null }
  const TEXTO = (d: unknown) => new TextDecoder('utf-8').decode(d as Uint8Array)

  it('el CSV anota formato, periodo, casos, que no llevaba resumen y que era la tabla', async () => {
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    await descargar(d, /Descargar CSV/)
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toEqual({ ...BASE, p_formato: 'csv', p_casos: 2, p_resumen: 'sin_resumen', p_secciones: 'Tabla de casos' })
  })

  it('el Excel por omisión lleva lo que se ve y anota cada parte, incluido el resumen de la IA', async () => {
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await elegirFormato(d, /Excel/)
    await descargar(d, /Descargar Excel/)
    await waitFor(() => expect(descargarBinario).toHaveBeenCalledTimes(1))
    const [nombre, bytes, tipo] = vi.mocked(descargarBinario).mock.calls[0] as [string, Uint8Array, string]
    expect(nombre).toBe('reporte-anomalias-2026-11-01-a-2026-11-30.xlsx')
    expect(tipo).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    const contenido = TEXTO(bytes)
    expect(contenido).toContain('Resumen redactado por IA a partir de las cifras')
    expect(contenido).not.toContain('BORRADOR')
    expect(contenido).not.toContain('Patrones a revisar')
    expect(await screen.findByText('Excel listo: 2 casos')).toBeInTheDocument()
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toEqual({
      ...BASE, p_formato: 'xlsx', p_casos: 2, p_resumen: 'con_resumen',
      p_secciones: 'Resumen redactado por IA, Indicadores del periodo, Cómo va cada caso, Tendencia, tipo y sede, Tabla de casos',
    })
  })

  it('un Excel con solo «Sede contra sede» y «Patrones a revisar» no pide los casos y así se anota', async () => {
    const patrones = [{ usuario_id: 'u1', nombre: 'Ana Pérez', sede: 'Matriz', total: 4, justificadas: 1, tipo: 'fuera_geocerca', tipo_total: 3 }]
    const base = vi.mocked(supabase.rpc).getMockImplementation() as unknown as (n: string, p: never) => Promise<unknown>
    vi.mocked(supabase.rpc).mockImplementation(((n: string, p: never) => (n === 'patrones_anomalias' ? Promise.resolve({ data: patrones, error: null }) : base(n, p))) as never)
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /Excel/)
    await userEvent.click(within(d).getByRole('button', { name: 'Quitar todo' }))
    await waitFor(() => expect(casilla(d, /Sede contra sede/)).toBeEnabled())
    await waitFor(() => expect(casilla(d, /Patrones a revisar/)).toBeEnabled())
    await userEvent.click(casilla(d, /Sede contra sede/))
    await userEvent.click(casilla(d, /Patrones a revisar/))
    await descargar(d, /Descargar Excel/)
    await waitFor(() => expect(descargarBinario).toHaveBeenCalledTimes(1))
    const contenido = TEXTO((vi.mocked(descargarBinario).mock.calls[0] as unknown[])[1])
    expect(contenido).toContain('Patrones a revisar')
    expect(contenido).toContain('Campus Norte')
    expect(contenido).toContain('Sin resumen con IA')
    expect(consultasDeTabla()).toHaveLength(0)
    expect(await screen.findByText('Excel listo')).toBeInTheDocument()
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toMatchObject({ p_formato: 'xlsx', p_resumen: 'sin_resumen', p_secciones: 'Sede contra sede, Patrones a revisar' })
  })

  it('si se quita el resumen del cuadro, aunque la IA lo haya escrito, el archivo no lo lleva y se anota sin resumen', async () => {
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await elegirFormato(d, /Excel/)
    await userEvent.click(casilla(d, /Resumen redactado por IA/))
    await descargar(d, /Descargar Excel/)
    await waitFor(() => expect(descargarBinario).toHaveBeenCalledTimes(1))
    expect(TEXTO((vi.mocked(descargarBinario).mock.calls[0] as unknown[])[1])).toContain('Sin resumen con IA')
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toMatchObject({ p_formato: 'xlsx', p_resumen: 'sin_resumen' })
  })

  it('el PDF también deja constancia, con el resumen y las partes que llevaba', async () => {
    Object.assign(window, { print: vi.fn() })
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    const d = await abrirExportar()
    await descargar(d, /Descargar PDF/)
    await waitFor(() => expect(document.getElementById('reporte-impresion')).not.toBeNull())
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toMatchObject({ p_formato: 'pdf', p_resumen: 'con_resumen', p_secciones: expect.stringContaining('Tabla de casos') })
  })

  it('en una plantilla sin resumen, el archivo no lleva resumen y así se anota', async () => {
    pantalla('/admin/reportes?plantilla=plazos')
    const d = await abrirExportar()
    expect(casilla(d, /Resumen redactado por IA/)).toBeDisabled()
    await elegirFormato(d, /Excel/)
    await descargar(d, /Descargar Excel/)
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toMatchObject({ p_formato: 'xlsx', p_resumen: 'sin_resumen' })
    expect(TEXTO((vi.mocked(descargarBinario).mock.calls[0] as unknown[])[1])).toContain('Sin resumen con IA')
  })

  it('con una sede elegida anota la sede', async () => {
    pantalla('/admin/reportes?sede=s2')
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    await descargar(d, /Descargar CSV/)
    await waitFor(() => expect(llamadasA('registrar_exportacion')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion')[0]).toMatchObject({ p_sede: 's2' })
  })

  it('si no se pudo anotar, el archivo ya salió y solo se avisa', async () => {
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /CSV/)
    vi.mocked(supabase.rpc).mockImplementation((async (n: string) => (n === 'registrar_exportacion' ? { data: null, error: new Error('x') } : { data: AGREGADO, error: null })) as never)
    await descargar(d, /Descargar CSV/)
    expect(await screen.findByText('El archivo salió, pero no se pudo anotar la exportación en Auditoría')).toBeInTheDocument()
    expect(descargarTexto).toHaveBeenCalledTimes(1)
  })

  it('si la exportación misma falla, no se anota nada', async () => {
    pantalla()
    const d = await abrirExportar()
    await elegirFormato(d, /Excel/)
    falla = true
    await descargar(d, /Descargar Excel/)
    expect(await screen.findByText('No se pudo preparar la exportación. Intenta de nuevo')).toBeInTheDocument()
    expect(descargarBinario).not.toHaveBeenCalled()
    expect(llamadasA('registrar_exportacion')).toHaveLength(0)
  })
})
