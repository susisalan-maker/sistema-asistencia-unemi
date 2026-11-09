import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Anomalias from './Anomalias'
import { ProveedorNovedades } from './useNovedadesBandeja'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const ana = { nombres: 'Ana', apellidos: 'Pérez', email: 'ana@x.ec' }
const luis = { nombres: 'Luis', apellidos: 'Mora', email: 'luis@x.ec' }
const FILAS = [
  { id: 'a1', numero: 1, tipo: 'fuera_horario', estado: 'en_revision', detalle: 'Ingreso 08:30; el límite era 08:10', created_at: '2026-10-17T13:00:00Z', usuarios: ana, justificaciones: { clasificacion_ia: 'sospechosa' } },
  { id: 'a2', numero: 2, tipo: 'fuera_geocerca', estado: 'sin_justificar', detalle: 'A 120 m del centro', created_at: '2026-10-18T14:00:00Z', usuarios: luis, justificaciones: null },
]

type Registro = { tabla: string; llamadas: [string, unknown[]][] }
let consultas: Registro[]
let falla = false

interface Mundo { filas?: object[]; total?: number; personas?: { id: string }[]; porResolver?: number; abiertas?: number; resueltas?: number; totalGeneral?: number }

/** Una base de datos de mentira: anota cada consulta (tabla y métodos con sus argumentos) y responde lo programado. */
function simular(m: Mundo = {}) {
  const { filas = FILAS, total = filas.length, personas = [{ id: 'u2' }], porResolver = 2, abiertas = 1, resueltas = 1, totalGeneral = 4 } = m
  consultas = []
  falla = false
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg: Registro = { tabla, llamadas: [] }
    consultas.push(reg)
    const respuesta = () => {
      const metodo = (n: string) => reg.llamadas.find(([k]) => k === n)?.[1]
      if (tabla === 'usuarios') return { data: personas, error: null }
      const opciones = metodo('select')?.[1] as { head?: boolean } | undefined
      if (opciones?.head) {
        const estados = (metodo('in')?.[1] ?? []) as string[]
        const cuenta = estados.length === 0 ? totalGeneral : estados.includes('en_revision') ? porResolver : estados.includes('pendiente') ? abiertas : resueltas
        return { count: cuenta, error: null }
      }
      if (falla) return { data: null, error: { message: 'x' }, count: null }
      const [desde, hasta] = (metodo('range') ?? [0, 0]) as number[]
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

const bandeja = () => consultas.filter((c) => c.tabla === 'anomalias' && !(c.llamadas[0][1][1] as { head?: boolean } | undefined)?.head)
const ultima = () => bandeja()[bandeja().length - 1]
const args = (r: Registro, metodo: string) => r.llamadas.filter(([k]) => k === metodo).map(([, a]) => a)

function Ubicacion() {
  const l = useLocation()
  return <output data-testid="url">{l.search}</output>
}
const pantalla = (ruta = '/admin/anomalias') => renderConAuth(
  <Routes><Route path="/admin/anomalias" element={<><Anomalias /><Ubicacion /></>} /></Routes>,
  { perfil: perfilDe('administrador') }, ruta,
)
const pestana = (nombre: string) => screen.getByRole('button', { name: new RegExp(`^${nombre}`) })
const casos = () => screen.getAllByRole('link', { name: /Revisar el caso/ }).map((a) => a.getAttribute('aria-label'))
const url = () => screen.getByTestId('url').textContent

describe('Anomalías · bandeja', () => {
  beforeEach(() => simular())
afterEach(() => vi.useRealTimers())

  it('abre en «Por resolver» pidiendo al servidor la primera página con prioridad', async () => {
    pantalla()
    await screen.findByText('Luis Mora')
    expect(casos()).toEqual(['Revisar el caso A-1', 'Revisar el caso A-2'])
    const c = ultima()
    expect(args(c, 'in')).toEqual([['estado', ['en_revision', 'sin_justificar']]])
    expect(args(c, 'order')).toEqual([
      ['justificaciones(clasificacion_ia)', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: true }],
      ['numero', { ascending: true }],
    ])
    expect(args(c, 'range')).toEqual([[0, 11]])
    expect(await screen.findByText('2 por resolver · 4 en total')).toBeInTheDocument()
    expect(pestana('Por resolver')).toHaveAttribute('aria-pressed', 'true')
    expect(url()).toBe('')
  })

  it('cada fila lleva al detalle del caso y muestra su estado, tipo, detalle e IA', async () => {
    pantalla()
    const fila = (await screen.findByText('Luis Mora')).closest('article') as HTMLElement
    expect(screen.getByRole('link', { name: 'Revisar el caso A-2' })).toHaveAttribute('href', '/admin/anomalias/a2')
    expect(within(fila).getByText('#A-2')).toBeInTheDocument()
    expect(within(fila).getByText('LM')).toBeInTheDocument()
    expect(within(fila).getByText('Marcación fuera de la zona')).toBeInTheDocument()
    expect(within(fila).getByText('Sin justificar')).toBeInTheDocument()
    expect(within(fila).getByText('A 120 m del centro')).toBeInTheDocument()
    expect(within(fila).getByText('18 oct · 09:00')).toBeInTheDocument()
    expect(screen.getByText('IA: sospechosa')).toBeInTheDocument()
  })

  it('cada estado pide lo suyo al servidor, con su orden, y queda en la dirección', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    await u.click(pestana('Resueltas'))
    await waitFor(() => expect(url()).toBe('?estado=resueltas'))
    expect(args(ultima(), 'in')).toEqual([['estado', ['justificada', 'rechazada']]])
    expect(args(ultima(), 'order')[0]).toEqual(['created_at', { ascending: false }])
    await u.click(pestana('Esperando a la persona'))
    await waitFor(() => expect(url()).toBe('?estado=abiertas'))
    expect(args(ultima(), 'order')[0]).toEqual(['fecha_vencimiento', { ascending: true }])
    await u.click(pestana('Todas'))
    await waitFor(() => expect(url()).toBe('?estado=todas'))
    expect(args(ultima(), 'in')).toEqual([])
    await u.click(pestana('Por resolver'))
    await waitFor(() => expect(url()).toBe(''))
  })

  it('el selector de orden ofrece lo que sirve en cada pestaña', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    const opciones = () => within(screen.getByLabelText('Orden')).getAllByRole('option').map((o) => o.textContent)
    expect(opciones()).toEqual(['Prioridad (sospechosas y más antiguas)', 'Justificadas más recientes primero', 'Más antiguas primero', 'Más recientes primero'])
    await u.selectOptions(screen.getByLabelText('Orden'), 'recientes')
    await waitFor(() => expect(url()).toBe('?orden=recientes'))
    expect(args(ultima(), 'order')).toEqual([['created_at', { ascending: false }], ['numero', { ascending: false }]])
    await u.click(pestana('Resueltas'))
    await waitFor(() => expect(url()).toBe('?estado=resueltas'))   // el orden vuelve al de siempre de cada pestaña
    expect(opciones()).toEqual(['Más recientes primero', 'Justificadas más recientes primero', 'Más antiguas primero'])
  })

  it('filtra por tipo en el servidor', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    await u.selectOptions(screen.getByLabelText('Tipo'), 'sin_salida')
    await waitFor(() => expect(url()).toBe('?tipo=sin_salida'))
    expect(args(ultima(), 'eq')).toEqual([['tipo', 'sin_salida']])
  })

  it('busca por persona: primero halla sus ids y luego sus casos, sin pedir nada en cada tecla', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    const antes = consultas.length
    await u.type(screen.getByLabelText('Buscar'), 'luis')
    expect(consultas.length).toBe(antes)                         // aún escribiendo: no se ha consultado
    await waitFor(() => expect(url()).toBe('?q=luis'))
    const personas = consultas.find((c) => c.tabla === 'usuarios')!
    expect(args(personas, 'or')).toEqual([['nombres.ilike.%luis%,apellidos.ilike.%luis%,email.ilike.%luis%']])
    expect(args(ultima(), 'or')).toEqual([['usuario_id.in.(u2)']])
  })

  it('con varias palabras todas deben coincidir, y un número de caso también se busca', async () => {
    simular({ personas: [] })
    pantalla('/admin/anomalias?q=ana%20p%C3%A9rez')
    await waitFor(() => expect(screen.getByText('No hay anomalías que coincidan.')).toBeInTheDocument())
    const personas = consultas.find((c) => c.tabla === 'usuarios')!
    expect(args(personas, 'or')).toHaveLength(2)                 // una condición por palabra, todas obligatorias
    expect(bandeja()).toHaveLength(0)                            // sin personas ni número de caso no hay nada que pedir
  })

  it('«A-12» busca el caso 12 además de las personas', async () => {
    simular({ personas: [{ id: 'u9' }] })
    pantalla('/admin/anomalias?q=A-12')
    await screen.findByText('Luis Mora')
    expect(args(ultima(), 'or')).toEqual([['usuario_id.in.(u9),numero.eq.12']])
    simular({ personas: [] })
    pantalla('/admin/anomalias?q=12')
    await waitFor(() => expect(args(ultima(), 'or')).toEqual([['numero.eq.12']]))
  })

  it('filtra por fechas con atajos y con un rango, en hora de Ecuador', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    await u.selectOptions(screen.getByLabelText('Fecha'), '7d')
    await waitFor(() => expect(url()).toBe('?fecha=7d'))
    expect(args(ultima(), 'gte')[0]).toEqual(['created_at', expect.stringMatching(/T05:00:00\.000Z$/)])
    expect(args(ultima(), 'lt')).toEqual([])

    await u.selectOptions(screen.getByLabelText('Fecha'), 'rango')
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-05' } })
    await waitFor(() => expect(url()).toBe('?fecha=rango&desde=2026-10-01&hasta=2026-10-05'))
    expect(args(ultima(), 'gte')).toEqual([['created_at', '2026-10-01T05:00:00.000Z']])
    expect(args(ultima(), 'lt')).toEqual([['created_at', '2026-10-06T05:00:00.000Z']])

    await u.selectOptions(screen.getByLabelText('Fecha'), 'todas')
    await waitFor(() => expect(url()).toBe(''))
    expect(screen.queryByLabelText('Desde')).toBeNull()
  })

  it('pide una página a la vez (12 casos) y la página queda en la dirección', async () => {
    const doce = Array.from({ length: 12 }, (_, i) => ({ ...FILAS[0], id: `m${i}`, numero: 100 + i }))
    simular({ filas: doce, total: 30 })
    pantalla()
    const u = userEvent.setup()
    await screen.findAllByRole('article')
    expect(screen.getAllByRole('article')).toHaveLength(12)
    expect(screen.getByText('Mostrando 1–12 de 30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '‹ Anterior' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    await waitFor(() => expect(url()).toBe('?pagina=2'))
    expect(args(ultima(), 'range')).toEqual([[12, 23]])
    expect(await screen.findByText('Mostrando 13–24 de 30')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(await screen.findByText('Mostrando 25–30 de 30')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente ›' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: '‹ Anterior' }))
    await u.click(screen.getByRole('button', { name: '‹ Anterior' }))
    await waitFor(() => expect(url()).toBe(''))
  })

  it('cambiar un filtro vuelve a la primera página', async () => {
    simular({ filas: FILAS, total: 30 })
    pantalla('/admin/anomalias?pagina=2')
    await screen.findByText('Luis Mora')
    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await waitFor(() => expect(url()).toBe('?tipo=duplicada'))
  })

  it('al abrir con una dirección con filtros, los aplica y los muestra', async () => {
    pantalla('/admin/anomalias?estado=resueltas&orden=antiguas&tipo=duplicada&fecha=hoy')
    await screen.findByText('Luis Mora')
    expect(pestana('Resueltas')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Orden')).toHaveValue('antiguas')
    expect(screen.getByLabelText('Tipo')).toHaveValue('duplicada')
    expect(screen.getByLabelText('Fecha')).toHaveValue('hoy')
    expect(args(ultima(), 'order')[0]).toEqual(['created_at', { ascending: true }])
    expect(args(ultima(), 'eq')).toEqual([['tipo', 'duplicada']])
  })

  it('valores raros en la dirección se ignoran', async () => {
    pantalla('/admin/anomalias?estado=zzz&orden=vencer&tipo=otro&fecha=ayer&pagina=-4')
    await screen.findByText('Luis Mora')
    expect(pestana('Por resolver')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Orden')).toHaveValue('prioridad')   // «vencer» no existe en «Por resolver»
    expect(args(ultima(), 'range')).toEqual([[0, 11]])
  })

  it('si la página pedida ya no existe, va a la última', async () => {
    simular({ filas: FILAS, total: 30 })
    pantalla('/admin/anomalias?pagina=9')
    await waitFor(() => expect(url()).toBe('?pagina=3'))
    expect(await screen.findByText('Página 3 de 3')).toBeInTheDocument()
  })

  it('sin casos por resolver felicita; con filtros dice que nada coincide; con error de carga avisa', async () => {
    simular({ filas: [], total: 0 })
    const { unmount } = pantalla()
    expect(await screen.findByText('No hay casos por resolver. ¡Todo al día!')).toBeInTheDocument()
    unmount()
    simular({ filas: [], total: 0 })
    const { unmount: otra } = pantalla('/admin/anomalias?tipo=duplicada')
    expect(await screen.findByText('No hay anomalías que coincidan.')).toBeInTheDocument()
    otra()
    simular()
    falla = true
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la bandeja de anomalías')
  })

  it('cada pestaña muestra cuántos casos tiene con los filtros puestos', async () => {
    simular({ porResolver: 2, abiertas: 5, resueltas: 7, totalGeneral: 14 })
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    expect(pestana('Por resolver')).toHaveTextContent('Por resolver2')   // la activa usa el total de su propia consulta
    expect(pestana('Esperando a la persona')).toHaveTextContent('5')
    expect(pestana('Resueltas')).toHaveTextContent('7')
    expect(pestana('Todas')).toHaveTextContent('14')
    await u.selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await waitFor(() => expect(url()).toBe('?tipo=duplicada'))
    // Los conteos de las otras pestañas se piden con el mismo filtro de tipo.
    const cuentas = consultas.filter((c) => c.tabla === 'anomalias' && (c.llamadas[0][1][1] as { head?: boolean } | undefined)?.head && args(c, 'eq').length > 0)
    expect(cuentas.length).toBe(3)
    expect(cuentas.every((c) => JSON.stringify(args(c, 'eq')) === JSON.stringify([['tipo', 'duplicada']]))).toBe(true)
  })

  it('mientras llega la primera página muestra un esqueleto con la forma de las tarjetas, no un texto', async () => {
    pantalla()
    expect(screen.getByRole('status', { name: 'Cargando anomalías' })).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).toBeNull()
    await screen.findByText('Luis Mora')
    expect(screen.queryByRole('status', { name: 'Cargando anomalías' })).toBeNull()
  })

  it('«Borrar filtros» limpia tipo, búsqueda y fechas, pero se queda en la pestaña', async () => {
    simular({ filas: [], total: 0 })
    pantalla('/admin/anomalias?estado=resueltas&tipo=duplicada&fecha=hoy&q=zzz')
    const u = userEvent.setup()
    await screen.findByText('No hay anomalías que coincidan.')
    await u.click(screen.getByRole('button', { name: /^Borrar filtros/ }))
    await waitFor(() => expect(url()).toBe('?estado=resueltas'))
    expect(screen.getByLabelText('Buscar')).toHaveValue('')
  })

  it('«Borrar filtros» está a la vista mientras haya filtros y limpia búsqueda, tipo y fechas sin cambiar de pestaña', async () => {
    pantalla('/admin/anomalias?estado=todas&tipo=duplicada&fecha=hoy&q=ana')
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')   // hay resultados: el botón no depende de que la lista esté vacía
    expect(screen.getByRole('button', { name: 'Borrar filtros, 3 activos' })).toHaveTextContent('Borrar filtros3')   // cuenta búsqueda, tipo y fecha
    await u.click(screen.getByRole('button', { name: /^Borrar filtros/ }))
    await waitFor(() => expect(url()).toBe('?estado=todas'))
    expect(screen.getByLabelText('Buscar')).toHaveValue('')
    expect(screen.getByLabelText('Tipo')).toHaveValue('')
    expect(screen.getByLabelText('Fecha')).toHaveValue('todas')
    expect(screen.queryByRole('button', { name: /^Borrar filtros/ })).toBeNull()
  })

  it('un solo filtro basta para que aparezca «Borrar filtros»', async () => {
    pantalla()
    await screen.findByText('Luis Mora')
    expect(screen.queryByRole('button', { name: /^Borrar filtros/ })).toBeNull()
    await userEvent.setup().selectOptions(screen.getByLabelText('Tipo'), 'sin_salida')
    expect(await screen.findByRole('button', { name: 'Borrar filtros, 1 activo' })).toBeInTheDocument()
  })

  it('sin filtros puestos no ofrece «Borrar filtros»', async () => {
    simular({ filas: [], total: 0 })
    pantalla()
    await screen.findByText('No hay casos por resolver. ¡Todo al día!')
    expect(screen.queryByRole('button', { name: /^Borrar filtros/ })).toBeNull()
  })

  it('cada caso dice hace cuánto se detectó y cuánto plazo queda o cuánto hace que venció', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T15:00:00Z'))
    simular({ filas: [
      { ...FILAS[1], id: 'p1', numero: 5, estado: 'pendiente', created_at: '2026-10-20T12:00:00Z', fecha_vencimiento: '2026-10-20T20:00:00Z' },
      { ...FILAS[1], id: 's1', numero: 6, estado: 'sin_justificar', created_at: '2026-10-17T12:00:00Z', fecha_vencimiento: '2026-10-18T15:00:00Z' },
      { ...FILAS[0], id: 'r1', numero: 7, estado: 'en_revision', created_at: '2026-10-19T15:00:00Z', fecha_vencimiento: '2026-10-19T20:00:00Z' },
    ] })
    pantalla()
    await screen.findAllByRole('article')
    expect(screen.getByText('Vence en 5 h')).toBeInTheDocument()
    expect(screen.getByText('Venció hace 2 d')).toBeInTheDocument()
    expect(screen.getAllByText(/^Vence en|^Venció/)).toHaveLength(2)   // el caso en revisión no lleva plazo
    expect(screen.getByText('· hace 3 h')).toBeInTheDocument()
    expect(screen.getByText('· hace 3 d')).toBeInTheDocument()
    expect(screen.getByText('· hace 1 d')).toBeInTheDocument()
  })

  describe('lo que se justificó hoy', () => {
    const justificada = (extra: object = {}) => ({ ...FILAS[0], id: 'j1', numero: 9, justificaciones: { clasificacion_ia: 'aceptable', created_at: '2026-10-20T14:02:00Z' }, ...extra })

    it('el botón «Justificadas hoy» pide solo lo justificado hoy, con su cuenta, y queda en la dirección', async () => {
      pantalla()
      const u = userEvent.setup()
      await screen.findByText('Luis Mora')
      const boton = await screen.findByRole('button', { name: /^Justificadas hoy/ })
      expect(boton).toHaveAttribute('aria-pressed', 'false')
      expect(await within(boton).findByText('1')).toBeInTheDocument()
      await u.click(boton)
      await waitFor(() => expect(url()).toBe('?justificada=hoy'))
      expect(screen.getByRole('button', { name: /^Justificadas hoy/ })).toHaveAttribute('aria-pressed', 'true')
      const c = ultima()
      expect(c.llamadas.find(([k]) => k === 'select')?.[1][0]).toContain('justificaciones!inner(')
      expect(args(c, 'gte')).toEqual([['justificaciones.created_at', expect.stringMatching(/T05:00:00\.000Z$/)]])
      expect(args(c, 'in')).toContainEqual(['justificaciones.clasificacion_ia', ['aceptable', 'requiere_revision', 'sospechosa']])
      await u.click(screen.getByRole('button', { name: /^Justificadas hoy/ }))
      await waitFor(() => expect(url()).toBe(''))
      expect(ultima().llamadas.find(([k]) => k === 'select')?.[1][0]).not.toContain('!inner')
    })

    it('sin nadie que haya justificado hoy lo dice', async () => {
      simular({ filas: [], total: 0 })
      pantalla('/admin/anomalias?justificada=hoy')
      expect(await screen.findByText('Nadie ha justificado hoy con estos filtros.')).toBeInTheDocument()
    })

    it('el caso dice cuándo lo justificó la persona; uno sin justificar no dice nada', async () => {
      simular({ filas: [justificada(), FILAS[1]] })
      pantalla()
      const fila = (await screen.findByText('#A-9')).closest('article') as HTMLElement
      expect(within(fila).getByText('Justificada · 20 oct · 09:02')).toBeInTheDocument()
      expect(screen.getAllByText(/^Justificada ·/)).toHaveLength(1)
    })

    it('una fila de justificación sin lo que concluyó la IA (decisión del administrador) no cuenta como justificada', async () => {
      simular({ filas: [justificada({ justificaciones: { clasificacion_ia: null, created_at: '2026-10-20T14:02:00Z' } })] })
      pantalla()
      await screen.findByText('#A-9')
      expect(screen.queryByText(/^Justificada ·/)).toBeNull()
    })

    it('«Justificadas más recientes primero» ordena por la fecha de la justificación', async () => {
      pantalla()
      const u = userEvent.setup()
      await screen.findByText('Luis Mora')
      await u.selectOptions(screen.getByLabelText('Orden'), 'justificadas')
      await waitFor(() => expect(url()).toBe('?orden=justificadas'))
      expect(args(ultima(), 'order')).toEqual([
        ['justificaciones(created_at)', { ascending: false, nullsFirst: false }],
        ['created_at', { ascending: false }],
        ['numero', { ascending: false }],
      ])
    })
  })

  describe('novedades', () => {
    const conVisita = (visita: string | null) => renderConAuth(
      <ProveedorNovedades valor={{ desde: visita, cantidad: 1 }}>
        <Routes><Route path="/admin/anomalias" element={<Anomalias />} /></Routes>
      </ProveedorNovedades>,
      { perfil: perfilDe('administrador') }, '/admin/anomalias',
    )
    const filas = [
      { ...FILAS[0], id: 'n1', numero: 20, justificaciones: { clasificacion_ia: 'aceptable', created_at: '2026-10-20T14:00:00Z' } },
      { ...FILAS[0], id: 'v1', numero: 21, justificaciones: { clasificacion_ia: 'aceptable', created_at: '2026-10-19T14:00:00Z' } },
      { ...FILAS[1], id: 's2', numero: 22 },
    ]

    it('marca «Nueva» solo lo justificado después de tu última visita', async () => {
      simular({ filas })
      conVisita('2026-10-20T10:00:00.000Z')
      const nueva = (await screen.findByText('#A-20')).closest('article') as HTMLElement
      expect(within(nueva).getByText('Nueva')).toBeInTheDocument()
      expect(within((screen.getByText('#A-21')).closest('article') as HTMLElement).queryByText('Nueva')).toBeNull()
      expect(within((screen.getByText('#A-22')).closest('article') as HTMLElement).queryByText('Nueva')).toBeNull()
      expect(screen.getAllByText('Nueva')).toHaveLength(1)
    })

    it('sin visita guardada todavía, nada es nuevo', async () => {
      simular({ filas })
      conVisita(null)
      await screen.findByText('#A-20')
      expect(screen.queryByText('Nueva')).toBeNull()
    })
  })
})
