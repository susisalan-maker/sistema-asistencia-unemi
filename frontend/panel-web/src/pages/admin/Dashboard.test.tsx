import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Dashboard from './Dashboard'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() } }))

const SEDES = [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Campus Norte' }]
const AGREGADO = {
  total: 46, marcaciones: 24,
  por_estado: { pendiente: 29, rechazada: 3, en_revision: 10, justificada: 4 },
  por_tipo: [{ tipo: 'verificacion_fallida', total: 21 }, { tipo: 'fuera_geocerca', total: 11 }],
  por_sede: [{ sede_id: 's1', sede: 'Matriz', total: 28 }, { sede_id: 's2', sede: 'Campus Norte', total: 18 }],
  por_dia: [{ dia: '2026-11-03', total: 5, justificadas: 2 }], por_hora: [{ hora: 11, total: 9 }],
  por_clasificacion: {}, jornada: { marcaciones: 40, con_falta: 4 }, evaluadas: 45, a_tiempo: 17,
  por_dia_hora: [{ dia: 1, hora: 7, total: 4 }, { dia: 1, hora: 8, total: 6 }, { dia: 5, hora: 17, total: 3 }],
  cierre: { aprobadas: 6, rechazadas: 3, sin_justificar: 1, sin_persona: 0 },
}
const ANTERIOR = { ...AGREGADO, total: 50, jornada: { marcaciones: 50, con_falta: 7 } }   // puntualidad anterior: 86 %
const VACIO = { total: 0, marcaciones: 0, por_estado: {}, por_tipo: [], por_sede: [], por_dia: [], por_hora: [], por_clasificacion: {}, jornada: { marcaciones: 0, con_falta: 0 }, evaluadas: 0, a_tiempo: 0 }

const ESTADO_HOY = {
  ahora: '2026-11-05T18:40:00Z', hoy: '2026-11-05', feriado: null, esperadas: 74,
  por_estado: { en_jornada: 41, en_almuerzo: 17, salio: 8, por_llegar: 5, sin_ingreso: 3 },
  por_sede: [
    { sede_id: 's1', sede: 'Matriz', esperadas: 48, presentes: 38, salieron: 5, por_llegar: 3, sin_ingreso: 2 },
    { sede_id: 's2', sede: 'Campus Norte', esperadas: 26, presentes: 20, salieron: 3, por_llegar: 2, sin_ingreso: 1 },
  ],
  faltan: [
    { usuario_id: 'u1', nombre: 'Luis Paredes', sede: 'Matriz', jornada_inicio: '08:00', minutos_retraso: 340, ultima: { tipo: 'salida', fecha_hora: '2026-11-04T22:02:00Z' } },
    { usuario_id: 'u2', nombre: 'Jorge Mina', sede: 'Campus Norte', jornada_inicio: '09:00', minutos_retraso: 45, ultima: null },
    { usuario_id: 'u3', nombre: 'Karla Intriago', sede: 'Matriz', jornada_inicio: '08:00', minutos_retraso: 100, ultima: { tipo: 'salida', fecha_hora: '2026-10-29T22:00:00Z' } },
  ],
}
const ATENCION = {
  plazo_revision_h: 48, revision: { total: 6, vencidos: 3, por_vencer: 2, por_vencer_casos: ['A-1042', 'A-1047'] }, sin_justificar: 4, sospechosas: 2,
  rostro: [{ usuario_id: 'u9', nombre: 'Marcela Ortiz', intentos: 3 }], sin_celular: 4,
}
const PATRONES = [
  { usuario_id: 'u7', nombre: 'Karla Intriago', sede: 'Matriz', total: 5, justificadas: 4, tipo: 'sin_ingreso', tipo_total: 4 },
  { usuario_id: 'u8', nombre: 'Diego Vera', sede: 'Campus Norte', total: 4, justificadas: 2, tipo: 'almuerzo_excedido', tipo_total: 3 },
  { usuario_id: 'u9', nombre: 'Marcela Ortiz', sede: 'Matriz', total: 3, justificadas: 0, tipo: 'verificacion_fallida', tipo_total: 3 },
]
const TODO_AL_DIA = { plazo_revision_h: 48, revision: { total: 0, vencidos: 0, por_vencer: 0 }, sin_justificar: 0, sospechosas: 0, rostro: [], sin_celular: 0 }

type Respuesta = { data: unknown; error: unknown }
let hoyEstado: () => Respuesta
let hoyAtencion: () => Respuesta
let hoyPatrones: () => Respuesta
let avisarCambio: () => void

/**
 * Las funciones de la base que usa el Dashboard: `estado_hoy` y `atencion_hoy` (lo de hoy) y `reporte_anomalias` (el periodo).
 * Cada prueba que quiera otro comportamiento para los números del periodo pasa su propia función.
 */
function responderRpc(reporte: (p: { p_desde: string; p_hasta: string; p_sede: string | null }, n: number) => Respuesta) {
  let n = 0
  vi.mocked(supabase.rpc).mockImplementation((async (nombre: string, p: { p_desde: string; p_hasta: string; p_sede: string | null }) => {
    if (nombre === 'estado_hoy') return hoyEstado()
    if (nombre === 'atencion_hoy') return hoyAtencion()
    if (nombre === 'patrones_anomalias') return hoyPatrones()
    return reporte(p, ++n)
  }) as never)
}

function simular({ actual = AGREGADO, anterior = ANTERIOR }: { actual?: object; anterior?: object } = {}) {
  hoyEstado = () => ({ data: ESTADO_HOY, error: null })
  hoyAtencion = () => ({ data: ATENCION, error: null })
  hoyPatrones = () => ({ data: PATRONES, error: null })
  responderRpc((p) => {
    const esActual = p.p_desde.startsWith('2026-11-02') || p.p_desde >= '2026-10-31T05:00:00.000Z'
    return { data: esActual ? actual : anterior, error: null }
  })
  // Realtime: guarda quién escucha para que una prueba pueda simular «entró una marcación».
  vi.mocked(supabase.channel).mockImplementation((() => {
    const canal: Record<string, unknown> = {}
    canal.on = (_tipo: string, _filtro: unknown, cb: () => void) => { avisarCambio = cb; return canal }
    canal.subscribe = (cb?: (s: string) => void) => { cb?.('SUBSCRIBED'); return canal }
    return canal
  }) as never)
  // Lo único que el Dashboard lee con `from` son las sedes del filtro.
  vi.mocked(supabase.from).mockImplementation((() => {
    const cadena: object = new Proxy({}, {
      get: (_, nombre: string) => {
        if (nombre === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data: SEDES, error: null }).then(ok, ko)
        return () => cadena
      },
    })
    return cadena
  }) as never)
}

const llamadasRpc = () => vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'reporte_anomalias').map((c) => c[1] as { p_desde: string; p_hasta: string; p_sede: string | null })
const llamadasA = (nombre: string) => vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === nombre).length

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

const CARGADO = () => screen.findByRole('region', { name: 'Indicadores del periodo' })

describe('Dashboard · lo que se ve', () => {
  it('abre en el mes actual con los cinco indicadores en una franja', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(await screen.findByText('Resumen del periodo · noviembre de 2026 · todas las sedes')).toBeInTheDocument()

    const indicadores = await CARGADO()
    expect(within(indicadores).getByText('46')).toBeInTheDocument()
    expect(within(indicadores).getByText('−8 % · antes 50')).toBeInTheDocument()
    expect(within(indicadores).getByText('37,8 %')).toBeInTheDocument()
    expect(within(indicadores).getByText('17 de 45 casos')).toBeInTheDocument()
    expect(within(indicadores).getByText('90 %')).toBeInTheDocument()
    expect(within(indicadores).getByText('36 de 40 · +4 pts')).toBeInTheDocument()
    for (const t of ['Anomalías', 'Justificadas a tiempo', 'Puntualidad', 'Resolución', 'Rechazo facial']) {
      expect(within(indicadores).getByText(t)).toBeInTheDocument()
    }
  })

  it('cada indicador guarda su explicación completa para quien pasa el cursor o usa lector de pantalla', async () => {
    pantalla()
    const indicadores = await CARGADO()
    expect(within(indicadores).getByTitle('Anomalías del periodo. −8 % frente al periodo anterior (50)')).toBeInTheDocument()
    expect(within(indicadores).getByTitle(/Justificadas a tiempo\. 17 de 45 casos con plazo vencido o justificados\. Meta de referencia 90 %/)).toBeInTheDocument()
    expect(within(indicadores).getByTitle(/Puntualidad\. 36 de 40 ingresos y salidas dentro del horario · \+4 pts frente al periodo anterior\. Meta de referencia 95 %/)).toBeInTheDocument()
  })

  it('cabe en una pantalla: no repite lo de Reportes (ni gráficas de tendencia, tipo, sede u hora, ni la tabla de pendientes)', async () => {
    pantalla()
    await CARGADO()
    for (const t of ['Tendencia de anomalías', 'Anomalías por tipo', 'Por sede', 'Casos por hora del día', 'Anomalías pendientes de revisión', 'Resumen ejecutivo', 'Histórico de anomalías del periodo']) {
      expect(screen.queryByText(t)).not.toBeInTheDocument()
    }
    expect(screen.queryByRole('region', { name: 'Pendientes de revisión' })).not.toBeInTheDocument()
    // Y lo que sí está: hoy, atención, indicadores, cuándo, quién cerró y patrones.
    for (const r of ['Hoy en vivo', 'Requiere atención', 'Indicadores del periodo', 'Cuándo ocurren las anomalías', 'Quién cerró cada caso', 'Patrones a revisar']) {
      expect(screen.getByRole('region', { name: r })).toBeInTheDocument()
    }
  })

  it('pide a la base el mes y el mes anterior de igual duración', async () => {
    pantalla()
    await CARGADO()
    const [actual, anterior] = llamadasRpc()
    expect(actual).toEqual({ p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_sede: null })
    expect(anterior.p_hasta).toBe(actual.p_desde)
  })

  it('un periodo sin casos lo dice y no dibuja el mapa de calor ni el cierre', async () => {
    simular({ actual: VACIO, anterior: VACIO })
    pantalla()
    expect(await screen.findByText('No hubo anomalías en este periodo.')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cuándo ocurren las anomalías' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Quién cerró cada caso' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Patrones a revisar' })).toBeInTheDocument()
    const indicadores = screen.getByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('Antes: 0 casos')).toBeInTheDocument()
    expect(within(indicadores).getByText('Sin ingresos ni salidas')).toBeInTheDocument()
    expect(within(indicadores).getAllByText('—')).toHaveLength(4)   // a tiempo, puntualidad, tiempo de resolución y rechazo facial
  })
})

describe('Dashboard · filtros', () => {
  it('«Semana» cambia el periodo de lunes a domingo y queda en la dirección', async () => {
    pantalla()
    await CARGADO()
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(screen.getByTestId('url').textContent).toBe('?periodo=semana')
    await waitFor(() => expect(llamadasRpc().some((p) => p.p_desde === '2026-11-02T05:00:00.000Z' && p.p_hasta === '2026-11-09T05:00:00.000Z')).toBe(true))
  })

  it('elegir una sede la manda a las cifras y a los patrones, pero no a «Hoy en vivo»', async () => {
    pantalla()
    await CARGADO()
    await userEvent.selectOptions(screen.getByLabelText('Sede'), 's2')
    await waitFor(() => expect(screen.getByText('Resumen del periodo · noviembre de 2026 · Campus Norte')).toBeInTheDocument())
    await waitFor(() => expect(llamadasRpc().filter((p) => p.p_sede === 's2')).toHaveLength(2))
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('patrones_anomalias', { p_sede: 's2' })
    expect(vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'estado_hoy').every((c) => c.length === 1)).toBe(true)
  })

  it('«Ver reporte completo» abre Reportes con el mismo periodo y la misma sede', async () => {
    pantalla('/admin?periodo=semana&sede=s1')
    await CARGADO()
    expect(screen.getByRole('link', { name: 'Ver reporte completo' })).toHaveAttribute('href', '/admin/reportes?periodo=semana&sede=s1')
  })

  it('sin filtros, el enlace a Reportes no lleva nada', async () => {
    pantalla()
    await CARGADO()
    expect(screen.getByRole('link', { name: 'Ver reporte completo' })).toHaveAttribute('href', '/admin/reportes')
  })

  it('un rango de más de un año se rechaza y no se consulta nada', async () => {
    pantalla('/admin?periodo=rango&desde=2025-01-01&hasta=2026-11-01')
    expect(await screen.findByText(/como máximo 366 días/)).toBeInTheDocument()
    expect(llamadasRpc()).toHaveLength(0)
  })
})

describe('Dashboard · errores', () => {
  it('si fallan los números, lo dice y deja reintentar', async () => {
    responderRpc((_p, n) => (n === 1 ? { data: null, error: new Error('x') } : { data: n === 2 ? ANTERIOR : AGREGADO, error: null }))
    pantalla()
    expect(await screen.findByText(/No se pudieron cargar los números del reporte/)).toBeInTheDocument()
    responderRpc(() => ({ data: AGREGADO, error: null }))
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await CARGADO()).toBeInTheDocument()
  })

  it('si solo falla el periodo anterior, salen los números sin comparación', async () => {
    responderRpc((_p, n) => (n === 1 ? { data: AGREGADO, error: null } : { data: null, error: new Error('x') }))
    pantalla()
    const indicadores = await CARGADO()
    expect(within(indicadores).getAllByText(/Sin periodo anterior/)).toHaveLength(3)   // el total, la puntualidad y el rechazo facial
  })
})

describe('Dashboard · hoy en vivo', () => {
  it('cuenta las personas en cada estado y las reparte por sede', async () => {
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Hoy en vivo' })
    expect(within(seccion).getByText('74 personas deben marcar hoy')).toBeInTheDocument()
    expect(within(seccion).getByRole('img')).toHaveAccessibleName('41 en jornada, 17 en almuerzo, 8 ya salieron, 5 aún no es su hora, 3 sin ingreso')
    for (const [numero, texto] of [['41', 'En jornada'], ['17', 'En almuerzo'], ['8', 'Ya salieron'], ['5', 'Aún no es su hora'], ['3', 'Sin ingreso']]) {
      expect(within(seccion).getByText(texto, { selector: 'dt' }).closest('div')).toHaveTextContent(numero)
    }
    // Las sedes, en una sola línea.
    expect(within(seccion).getByText('Matriz').closest('p')).toHaveTextContent('Matriz 38/48 (2 sin ingreso) · Campus Norte 20/26 (1 sin ingreso) en jornada')
    expect(within(seccion).getByText(/No muestra ubicación ni quién tiene la app abierta/)).toBeInTheDocument()
  })

  it('no depende del periodo ni de la sede: siempre pide hoy y todas las sedes', async () => {
    pantalla('/admin?periodo=semana&sede=s2')
    await screen.findByRole('region', { name: 'Hoy en vivo' })
    expect(vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'estado_hoy')).toEqual([['estado_hoy']])
    expect(vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === 'atencion_hoy')).toEqual([['atencion_hoy']])
  })

  it('dice quiénes no han ingresado: su retraso (en rojo si pasa de dos horas) y lo último que marcaron', async () => {
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Personas sin ingreso' })
    expect(within(seccion).getByText('3 personas')).toBeInTheDocument()
    expect(within(seccion).getByText('Luis Paredes')).toBeInTheDocument()
    expect(within(seccion).getByText('5 h 40 min de retraso')).toBeInTheDocument()
    expect(within(seccion).getAllByText('08:00', { selector: 'span' })).toHaveLength(2)   // Luis y Karla debían ingresar a las 08:00
    expect(within(seccion).getByTitle('Última marcación: Ayer 17:02 · Salida')).toHaveTextContent('Matriz · Ayer 17:02 · Salida')
    expect(within(seccion).getByText('Jorge Mina')).toBeInTheDocument()
    expect(within(seccion).getByText('45 min de retraso')).toBeInTheDocument()
    expect(within(seccion).getByTitle('Última marcación: Nunca ha marcado')).toHaveTextContent('Campus Norte · Nunca ha marcado')
    expect(within(seccion).getByTitle('Última marcación: 29 oct · 17:00 · Salida')).toBeInTheDocument()
    expect(within(seccion).getByText('5 h 40 min de retraso').className).toMatch(/error/)
    expect(within(seccion).getByText('45 min de retraso').className).toMatch(/aviso/)
    expect(within(seccion).getAllByRole('link', { name: 'Ver casos' })[0]).toHaveAttribute('href', '/admin/anomalias?estado=todas&q=Luis%20Paredes')
  })

  it('con más de tres, muestra tres y «Ver las N» despliega el resto', async () => {
    const faltan = Array.from({ length: 7 }, (_, i) => ({ usuario_id: `x${i}`, nombre: `Persona ${i + 1}`, sede: 'Matriz', jornada_inicio: '08:00', minutos_retraso: 30 + i, ultima: null }))
    hoyEstado = () => ({ data: { ...ESTADO_HOY, por_estado: { ...ESTADO_HOY.por_estado, sin_ingreso: 7 }, faltan }, error: null })
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Personas sin ingreso' })
    expect(within(seccion).getAllByRole('link', { name: 'Ver casos' })).toHaveLength(3)
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver las 7' }))
    expect(within(seccion).getAllByRole('link', { name: 'Ver casos' })).toHaveLength(7)
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver menos' }))
    expect(within(seccion).getAllByRole('link', { name: 'Ver casos' })).toHaveLength(3)
  })

  it('si todos ya ingresaron, lo dice', async () => {
    hoyEstado = () => ({ data: { ...ESTADO_HOY, por_estado: { ...ESTADO_HOY.por_estado, sin_ingreso: 0 }, faltan: [] }, error: null })
    pantalla()
    expect(await screen.findByText('Todos los que ya debían ingresar lo hicieron.')).toBeInTheDocument()
  })

  it('un feriado lo avisa y no pide marcar a nadie', async () => {
    hoyEstado = () => ({ data: { ...ESTADO_HOY, feriado: 'Día de Difuntos', esperadas: 0, por_estado: { en_jornada: 0, en_almuerzo: 0, salio: 0, por_llegar: 0, sin_ingreso: 0 }, por_sede: [], faltan: [] }, error: null })
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Hoy en vivo' })
    expect(within(seccion).getByText('Hoy es día no laborable: Día de Difuntos. Nadie debe marcar.')).toBeInTheDocument()
    expect(within(seccion).getByText('0 personas deben marcar hoy')).toBeInTheDocument()
    expect(within(seccion).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Personas sin ingreso' })).not.toBeInTheDocument()
  })

  it('«Sin ingreso» está dentro de la misma tarjeta de «Hoy en vivo»: todo cabe en una pantalla', async () => {
    pantalla()
    const vivo = await screen.findByRole('region', { name: 'Hoy en vivo' })
    expect(within(vivo).getByRole('region', { name: 'Personas sin ingreso' })).toBeInTheDocument()
  })

  it('si no se pudo cargar, lo dice y deja reintentar sin afectar lo demás', async () => {
    hoyEstado = () => ({ data: null, error: new Error('x') })
    pantalla()
    expect(await screen.findByText(/No se pudo cargar el estado de hoy/)).toBeInTheDocument()
    expect(await CARGADO()).toBeInTheDocument()
    hoyEstado = () => ({ data: ESTADO_HOY, error: null })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'Hoy en vivo' })).toBeInTheDocument()
  })

  it('con conexión en vivo lo dice; sin Realtime sigue funcionando y avisa que se actualiza cada minuto', async () => {
    pantalla()
    expect(await screen.findByText('En vivo')).toBeInTheDocument()
    vi.mocked(supabase.channel).mockImplementation((() => { throw new Error('sin realtime') }) as never)
    cleanup()
    pantalla()
    expect(await screen.findByText('Se actualiza cada minuto')).toBeInTheDocument()
    expect(await screen.findByText('74 personas deben marcar hoy')).toBeInTheDocument()
  })

  it('se actualiza solo cuando Realtime avisa de una marcación nueva, y pide una sola vez aunque lleguen varios avisos', async () => {
    pantalla()
    await screen.findByText('74 personas deben marcar hoy')
    const antes = llamadasA('estado_hoy')
    hoyEstado = () => ({ data: { ...ESTADO_HOY, esperadas: 75 }, error: null })
    avisarCambio(); avisarCambio(); avisarCambio()
    expect(await screen.findByText('75 personas deben marcar hoy', undefined, { timeout: 4000 })).toBeInTheDocument()
    expect(llamadasA('estado_hoy')).toBe(antes + 1)
  })
})

describe('Dashboard · requiere atención', () => {
  it('lista lo que espera al administrador, de lo más urgente a lo menos, cada cosa con su enlace', async () => {
    pantalla()
    const seccion = await screen.findByRole('region', { name: 'Requiere atención' })
    // Caben cuatro; el resto, con «Ver las 6».
    expect(within(seccion).getAllByRole('listitem')).toHaveLength(4)
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver las 6' }))
    const items = within(seccion).getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('p')?.textContent)).toEqual([
      '3 casos en revisión ya pasaron el plazo de 48 h',
      '2 casos en revisión vencen en menos de 6 horas',
      '4 casos sin justificar esperan tu decisión',
      'La IA clasificó 2 casos como sospechosos',
      'Marcela Ortiz: 3 verificaciones faciales fallidas en 7 días',
      '4 personas todavía no tienen un celular vinculado',
    ])
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver menos' }))
    expect(within(seccion).getAllByRole('listitem')).toHaveLength(4)
    await userEvent.click(within(seccion).getByRole('button', { name: 'Ver las 6' }))
    expect(within(items[0]).getByRole('link', { name: 'Revisar ahora' })).toHaveAttribute('href', '/admin/anomalias?estado=por_resolver')
    expect(within(items[4]).getByRole('link', { name: 'Ver casos' })).toHaveAttribute('href', '/admin/anomalias?estado=todas&tipo=verificacion_fallida&q=Marcela%20Ortiz')
    expect(within(items[5]).getByRole('link', { name: 'Ver usuarios' })).toHaveAttribute('href', '/admin/usuarios')
    expect(within(items[3]).getByText('La IA solo sugiere: la decisión es de una persona.')).toBeInTheDocument()
  })

  it('un solo caso se dice en singular', async () => {
    hoyAtencion = () => ({ data: { ...TODO_AL_DIA, revision: { total: 1, vencidos: 1, por_vencer: 0 }, sin_celular: 1 }, error: null })
    pantalla()
    expect(await screen.findByText('1 caso en revisión ya pasó el plazo de 48 h')).toBeInTheDocument()
    expect(screen.getByText('1 persona todavía no tiene un celular vinculado')).toBeInTheDocument()
  })

  it('si no hay nada pendiente, lo dice', async () => {
    hoyAtencion = () => ({ data: TODO_AL_DIA, error: null })
    pantalla()
    expect(await screen.findByText('Todo al día: nada requiere tu atención ahora.')).toBeInTheDocument()
  })

  it('si no se pudo cargar, lo dice y deja reintentar', async () => {
    hoyAtencion = () => ({ data: null, error: new Error('x') })
    pantalla()
    expect(await screen.findByText(/No se pudo cargar lo que requiere atención/)).toBeInTheDocument()
    hoyAtencion = () => ({ data: ATENCION, error: null })
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('region', { name: 'Requiere atención' })).toBeInTheDocument()
  })
})

describe('Dashboard · indicadores de resolución y rechazo facial', () => {
  it('muestra el tiempo medio y el rechazo facial con su comparación, y las metas de referencia', async () => {
    simular({
      actual: { ...AGREGADO, resolucion: { decididos: 8, horas_medias: 5.2 }, ia_persona: { comparables: 5, coinciden: 4 }, rostro: { fallidas: 6 } },
      anterior: { ...ANTERIOR, resolucion: { decididos: 6, horas_medias: 8.1 }, rostro: { fallidas: 3 } },
    })
    pantalla()
    const indicadores = await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(within(indicadores).getByText('5,2 h')).toBeInTheDocument()
    expect(within(indicadores).getByText('−2,9 h · antes 8,1 h')).toBeInTheDocument()
    expect(within(indicadores).getByTitle('Tiempo medio de resolución. 8 casos decididos por una persona · −2,9 h frente al periodo anterior (8,1 h)')).toBeInTheDocument()
    expect(within(indicadores).getByText('20 %')).toBeInTheDocument()
    expect(within(indicadores).getByText('6 fallidas · +8,9 pts')).toBeInTheDocument()
    expect(within(indicadores).getByTitle('Rechazo facial. 6 verificaciones fallidas · +8,9 pts frente al periodo anterior · conviene vigilar el umbral')).toBeInTheDocument()
    // La meta es una marca ámbar en la barra y también se dice con palabras.
    expect(within(indicadores).getByRole('img', { name: /meta de referencia 90 %/ })).toBeInTheDocument()
    expect(within(indicadores).getByRole('img', { name: /meta de referencia 95 %/ })).toBeInTheDocument()
  })

  it('el tiempo de resolución que empeora se marca en ámbar', async () => {
    simular({ actual: { ...AGREGADO, resolucion: { decididos: 3, horas_medias: 9 } }, anterior: { ...ANTERIOR, resolucion: { decididos: 4, horas_medias: 5 } } })
    pantalla()
    const texto = await screen.findByText('+4 h · antes 5 h')
    expect(texto.className).toMatch(/aviso/)
  })

  it('el Dashboard nunca presenta una decisión de la IA como tomada', async () => {
    pantalla()
    await screen.findByRole('region', { name: 'Indicadores del periodo' })
    expect(screen.queryByText(/resuelto por la IA/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/aprobó automáticamente/i)).not.toBeInTheDocument()
    expect(screen.queryByText('IA–persona')).not.toBeInTheDocument()
  })
})

describe('Dashboard · cuándo ocurren, quién cerró cada caso y patrones', () => {
  it('dibuja el mapa de calor día × hora con su frase de pico', async () => {
    pantalla()
    const mapa = await screen.findByRole('region', { name: 'Cuándo ocurren las anomalías' })
    expect(within(mapa).getByText('¿Cuándo ocurren las anomalías?')).toBeInTheDocument()
    expect(within(mapa).getByRole('img', { name: /Lunes de 07:00 a 10:00 concentra 10 de 13 casos \(77 %\)/ })).toBeInTheDocument()
    expect(within(mapa).getByText('Lunes 07:00–10:00 concentra 10 de 13 casos (77 %). Segundo pico: viernes 17:00.')).toBeInTheDocument()
    expect(within(mapa).getByTitle('Lunes 08:00: 6 casos')).toBeInTheDocument()
  })

  it('«Quién cerró cada caso» cuenta solo decisiones de personas y no menciona a la IA como quien decide', async () => {
    pantalla()
    const cierre = await screen.findByRole('region', { name: 'Quién cerró cada caso' })
    expect(within(cierre).getByText('10 casos con resultado')).toBeInTheDocument()
    expect(within(cierre).getByText('Aprobados por el administrador')).toBeInTheDocument()
    expect(within(cierre).getByText('Rechazados por el administrador')).toBeInTheDocument()
    expect(within(cierre).getByText(/Sin justificar a tiempo/)).toBeInTheDocument()
    expect(within(cierre).getByText('60 %')).toBeInTheDocument()
    expect(within(cierre).getByText(/Todo caso lo decide una persona: la IA solo sugiere\./)).toBeInTheDocument()
    expect(within(cierre).getByText(/36 casos siguen en trámite/)).toBeInTheDocument()
    expect(within(cierre).queryByText(/Aprobados por la IA/i)).not.toBeInTheDocument()
    expect(within(cierre).queryByText(/cerrados sin que una persona/i)).not.toBeInTheDocument()
  })

  it('si hubiera casos cerrados sin una persona, los muestra aparte para revisarlos', async () => {
    simular({ actual: { ...AGREGADO, cierre: { aprobadas: 2, rechazadas: 0, sin_justificar: 0, sin_persona: 3 } } })
    pantalla()
    const cierre = await screen.findByRole('region', { name: 'Quién cerró cada caso' })
    expect(within(cierre).getByText('Cerrados sin que una persona los decidiera')).toBeInTheDocument()
  })

  it('«Patrones a revisar» lista a las personas con su sugerencia y lleva a su historial', async () => {
    pantalla()
    const patrones = await screen.findByRole('region', { name: 'Patrones a revisar' })
    expect(within(patrones).getByText('Para conversar, no para sancionar.')).toBeInTheDocument()
    const filas = within(patrones).getAllByRole('listitem')
    expect(filas).toHaveLength(3)
    expect(filas[0]).toHaveTextContent('Karla Intriago5 casos (4 justificados) · Sin ingreso (4) → Conversar con la persona')
    expect(filas[1]).toHaveTextContent('Revisar el horario asignado')
    expect(filas[2]).toHaveTextContent('3 casos (0 justificados) · Verificación facial fallida (3) → Revisar el rostro registrado')
    // El nombre lleva al historial de esa persona.
    expect(within(patrones).getByRole('link', { name: 'Karla Intriago' })).toHaveAttribute('href', '/admin/anomalias?estado=todas&q=Karla%20Intriago')
  })

  it('con más de tres personas muestra tres y «Ver las N» despliega el resto', async () => {
    simular()
    hoyPatrones = () => ({ data: [...PATRONES, { ...PATRONES[0], usuario_id: 'u10', nombre: 'Elena Mora' }, { ...PATRONES[0], usuario_id: 'u11', nombre: 'Raúl Soto' }], error: null })
    pantalla()
    const patrones = await screen.findByRole('region', { name: 'Patrones a revisar' })
    await within(patrones).findByText('Karla Intriago')
    expect(within(patrones).getAllByRole('listitem')).toHaveLength(3)
    await userEvent.click(within(patrones).getByRole('button', { name: 'Ver las 5' }))
    expect(within(patrones).getAllByRole('listitem')).toHaveLength(5)
    await userEvent.click(within(patrones).getByRole('button', { name: 'Ver menos' }))
    expect(within(patrones).getAllByRole('listitem')).toHaveLength(3)
  })

  it('sin patrones lo dice; al elegir una sede los vuelve a pedir solo para esa sede', async () => {
    simular()
    hoyPatrones = () => ({ data: [], error: null })
    pantalla('/admin?sede=s1')
    expect(await screen.findByText('Nadie tiene 3 o más casos en los últimos 30 días.')).toBeInTheDocument()
    expect(vi.mocked(supabase.rpc)).toHaveBeenCalledWith('patrones_anomalias', { p_sede: 's1' })
  })

  it('si fallan los patrones, avisa y deja reintentar sin afectar lo demás', async () => {
    simular()
    let falla = true
    hoyPatrones = () => (falla ? { data: null, error: new Error('x') } : { data: PATRONES, error: null })
    pantalla()
    expect(await screen.findByText(/No se pudieron cargar los patrones/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Indicadores del periodo' })).toBeInTheDocument()
    falla = false
    await userEvent.click(within(screen.getByRole('region', { name: 'Patrones a revisar' })).getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Diego Vera')).toBeInTheDocument()
  })

  it('el aviso de «vencen pronto» nombra los casos', async () => {
    pantalla()
    expect(await screen.findByText(/A-1042 · A-1047\./)).toBeInTheDocument()
  })

  it('el rechazo facial que sube trae el aviso de vigilar el umbral', async () => {
    simular({ actual: { ...AGREGADO, rostro: { fallidas: 6 } }, anterior: { ...ANTERIOR, rostro: { fallidas: 3 } } })
    pantalla()
    expect(await screen.findByTitle(/conviene vigilar el umbral/)).toBeInTheDocument()
    expect(screen.getByText('6 fallidas · +8,9 pts').className).toMatch(/aviso/)
  })
})
