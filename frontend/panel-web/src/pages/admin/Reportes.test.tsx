import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { api } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Reportes from './Reportes'
import { descargarTexto } from './reportesExportar'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../../lib/api', () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error { status: number; constructor(status: number, mensaje: string) { super(mensaje); this.status = status } },
}))
vi.mock('./reportesExportar', async (original) => ({ ...(await original<typeof import('./reportesExportar')>()), descargarTexto: vi.fn() }))

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
  por_dia: [{ dia: '2026-11-03', total: 5 }], por_hora: [{ hora: 11, total: 9 }],
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
  simular()
})
afterEach(() => { vi.useRealTimers() })

describe('Reportes · lo que se ve', () => {
  it('abre en el mes actual con el total, cómo va cada caso y la tabla histórica', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Reportes' })).toBeInTheDocument()
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026')).toBeInTheDocument()

    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('46')).toBeInTheDocument()
    expect(within(indicadores).getByText('−8 % frente al periodo anterior (50)')).toBeInTheDocument()
    expect(within(indicadores).getByText('Distribución por estado')).toBeInTheDocument()
    // Las gráficas de análisis (tipo, sede, día, hora) y los demás indicadores viven en el Dashboard, no aquí.
    for (const t of ['Por tipo de anomalía', 'Por sede', 'Casos por día', 'Casos por hora del día', 'Por cada 100 marcaciones', 'Justificadas a tiempo', 'Por resolver']) {
      expect(screen.queryByText(t)).not.toBeInTheDocument()
    }

    const tabla = screen.getByRole('region', { name: 'Histórico de anomalías' })
    expect(within(tabla).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(tabla).getAllByText('Aprobada · Luis Vera')).toHaveLength(2)
    expect(within(tabla).getByRole('link', { name: 'A-1' })).toHaveAttribute('href', '/admin/anomalias/a1')
    expect(within(tabla).getByText('2 registros')).toBeInTheDocument()
  })

  it('pide a la base el mes completo y el mes anterior de igual duración, en hora de Ecuador', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
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
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await screen.findByRole('option', { name: 'Campus Norte' })
    await userEvent.selectOptions(screen.getByLabelText('Sede'), 's2')
    expect(url()).toBe('?sede=s2')
    expect(await screen.findByText('Histórico de anomalías · noviembre de 2026 · Campus Norte')).toBeInTheDocument()
    await waitFor(() => expect(llamadasRpc().filter((p) => p.p_sede === 's2')).toHaveLength(2))   // el periodo y el anterior
    expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['sede_id', 's2'])
    await waitFor(() => expect(screen.queryByText('Por sede')).not.toBeInTheDocument())
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
    expect(within(resumen).getByText('Generado por IA · noviembre de 2026 · todas las sedes')).toBeInTheDocument()
    expect(api).toHaveBeenCalledTimes(1)
    const [ruta, opciones] = vi.mocked(api).mock.calls[0] as [string, { method: string; body: Record<string, unknown> }]
    expect(ruta).toBe('/reportes/resumen')
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toMatchObject({ periodo: 'noviembre de 2026', sede: null, total: 46, total_anterior: 50, variacion_pct: -8, marcaciones: 24, a_tiempo_pct: 37.8 })
    expect(JSON.stringify(opciones.body)).not.toMatch(/Ana|Pérez|@/)
  })

  it('«Regenerar» vuelve a pedirlo y se bloquea unos segundos para no gastar llamadas', async () => {
    pantalla()
    const resumen = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    await within(resumen).findByText('En noviembre se registraron 46 anomalías.')
    vi.mocked(api).mockResolvedValue({ resumen: 'Segundo texto.' })
    await userEvent.click(within(resumen).getByRole('button', { name: 'Regenerar' }))
    expect(await within(resumen).findByText('Segundo texto.')).toBeInTheDocument()
    expect(api).toHaveBeenCalledTimes(2)
    expect(within(resumen).getByRole('button', { name: 'Regenerar' })).toBeDisabled()
  })

  it('si la IA falla, el resto del reporte sigue ahí y se puede reintentar', async () => {
    const { ApiError } = await import('../../lib/api')
    vi.mocked(api).mockRejectedValueOnce(new ApiError(503, 'Aún no hay una IA configurada', undefined, undefined))
    pantalla()
    const resumen = await screen.findByRole('region', { name: 'Resumen ejecutivo' })
    expect(await within(resumen).findByText(/Aún no hay una IA configurada/)).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Histórico de anomalías' })).toBeInTheDocument()
    await userEvent.click(within(resumen).getByRole('button', { name: 'Reintentar' }))
    expect(await within(resumen).findByText('En noviembre se registraron 46 anomalías.')).toBeInTheDocument()
  })

  it('un periodo sin casos no gasta ninguna llamada a la IA y no se puede exportar', async () => {
    simular({ actual: VACIO as never, anterior: VACIO as never, filasTabla: [] })
    pantalla()
    expect(await screen.findByText('No hubo anomalías en este periodo: no hay nada que resumir.')).toBeInTheDocument()
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByText('No hubo anomalías en este periodo.')).toBeInTheDocument()
    expect(screen.queryByText('Distribución por estado')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeDisabled()
    expect(screen.getByText('Sin casos en el periodo anterior')).toBeInTheDocument()
  })
})

describe('Reportes · tabla histórica', () => {
  it('filtra por estado y por tipo en la base, vuelve a la página 1 y se puede borrar', async () => {
    simular({ filasTabla: Array.from({ length: 40 }, (_, i) => FILA(i + 1)), totalTabla: 40 })
    pantalla('/admin/reportes?pagina=3')
    await screen.findByText('Página 3 de 3')
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'rechazada')
    expect(url()).toBe('?estado=rechazada')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['estado', 'rechazada']))
    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['tipo', 'duplicada']))
    await userEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }))
    expect(url()).toBe('')
    await waitFor(() => expect(argsDe(ultimaTabla(), 'eq')).toEqual([]))
  })

  it('filtrar o cambiar de página solo vuelve a pedir la tabla: las cifras y la IA no se piden otra vez', async () => {
    simular({ filasTabla: Array.from({ length: 40 }, (_, i) => FILA(i + 1)), totalTabla: 40 })
    pantalla()
    await screen.findByText('Página 1 de 3')
    const cifras = vi.mocked(supabase.rpc).mock.calls.length
    const resumenes = vi.mocked(api).mock.calls.length
    expect(cifras).toBe(2)
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
    pantalla()
    expect(await screen.findByText('Mostrando 1–15 de 40 · del más reciente al más antiguo')).toBeInTheDocument()
    expect(argsDe(ultimaTabla(), 'range')[0]).toEqual([0, 14])
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(url()).toBe('?pagina=2')
    expect(await screen.findByText('Mostrando 16–30 de 40 · del más reciente al más antiguo')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    expect(argsDe(ultimaTabla(), 'range')[0]).toEqual([15, 29])
  })

  it('con filtros sin resultados lo dice distinto que un periodo vacío', async () => {
    simular({ filasTabla: [], totalTabla: 0 })
    pantalla('/admin/reportes?estado=rechazada')
    expect(await screen.findByText('No hay anomalías que coincidan con esos filtros.')).toBeInTheDocument()
  })

  it('si la tabla falla, lo dice sin tumbar el resto', async () => {
    simular()
    falla = true
    pantalla()
    expect(await screen.findByText('No se pudo cargar la tabla histórica')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
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
    expect(within(indicadores).getByText('Sin datos del periodo anterior')).toBeInTheDocument()
  })
})

describe('Reportes · exportar', () => {
  const abrirMenu = async () => {
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    await userEvent.click(screen.getByRole('button', { name: /Exportar/ }))
  }

  it('el CSV trae todo el periodo filtrado y se descarga con el nombre del periodo', async () => {
    simular({ filasTabla: [FILA(1), FILA(2), FILA(3)] })
    pantalla('/admin/reportes?estado=justificada')
    await abrirMenu()
    expect(screen.getByRole('menuitem', { name: /Exportar PDF/ })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: /Exportar CSV/ }))
    await waitFor(() => expect(descargarTexto).toHaveBeenCalledTimes(1))
    const [nombre, contenido] = vi.mocked(descargarTexto).mock.calls[0] as [string, string]
    expect(nombre).toBe('reporte-anomalias-2026-11-01-a-2026-11-30.csv')
    expect(contenido.startsWith('﻿Caso;Fecha y hora;Colaborador')).toBe(true)
    expect(contenido.split('\r\n').filter(Boolean)).toHaveLength(4)
    expect(argsDe(ultimaTabla(), 'eq')).toContainEqual(['estado', 'justificada'])
    expect(await screen.findByText('CSV listo: 3 casos')).toBeInTheDocument()
  })

  it('el PDF arma la versión imprimible, abre el diálogo de impresión y la retira al terminar', async () => {
    const imprimir = vi.fn()
    Object.assign(window, { print: imprimir })
    pantalla()
    await screen.findByText('En noviembre se registraron 46 anomalías.')
    await abrirMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Exportar PDF/ }))
    const hoja = await waitFor(() => { const e = document.getElementById('reporte-impresion'); expect(e).not.toBeNull(); return e as HTMLElement })
    expect(within(hoja).getByRole('heading', { name: 'Reporte de anomalías' })).toBeInTheDocument()
    expect(within(hoja).getByText('noviembre de 2026 · Todas las sedes')).toBeInTheDocument()
    expect(within(hoja).getByText('En noviembre se registraron 46 anomalías.')).toBeInTheDocument()
    expect(within(hoja).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(hoja).getByText('2 casos')).toBeInTheDocument()
    await waitFor(() => expect(imprimir).toHaveBeenCalledTimes(1))
    expect(document.title).toBe('Reporte de anomalías · noviembre de 2026')
    act(() => { window.dispatchEvent(new Event('afterprint')) })
    await waitFor(() => expect(document.getElementById('reporte-impresion')).toBeNull())
    expect(document.title).not.toContain('Reporte de anomalías')
  })

  it('si hay más casos que el tope, avisa que el archivo quedó recortado', async () => {
    simular({ filasTabla: Array.from({ length: 1000 }, (_, i) => FILA(i + 1)), totalTabla: 5400 })
    pantalla()
    await abrirMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: /Exportar CSV/ }))
    expect(await screen.findByText(/primeros 5000 de 5400 casos/)).toBeInTheDocument()
  })

  it('si la exportación falla, avisa y deja intentar otra vez', async () => {
    pantalla()
    await abrirMenu()
    falla = true
    await userEvent.click(screen.getByRole('menuitem', { name: /Exportar CSV/ }))
    expect(await screen.findByText('No se pudo preparar la exportación. Intenta de nuevo')).toBeInTheDocument()
    expect(descargarTexto).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Exportar/ })).toBeEnabled()
  })

  it('el menú se cierra con Escape', async () => {
    pantalla()
    await abrirMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
