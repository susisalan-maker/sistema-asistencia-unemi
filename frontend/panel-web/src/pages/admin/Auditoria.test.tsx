import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Auditoria from './Auditoria'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))

const ADMINS = [{ id: 'a1', nombres: 'Ana', apellidos: 'Pérez' }, { id: 'a2', nombres: 'Bruno', apellidos: 'Cedeño' }]
const LLAVE = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE-llave-publica-larguisima'

const fila = (n: number, extra: object = {}) => ({
  id: `b${n}`, created_at: '2026-11-04T15:03:00+00:00', evento: 'actualizar', entidad: 'sedes', entidad_id: 's1', campo: 'radio_metros',
  valor_anterior: '200', valor_nuevo: '300', motivo: null, usuario_id: 'a1', autor: { nombres: 'Ana', apellidos: 'Pérez' }, ...extra,
})
const FILAS = [
  fila(1),
  fila(2, { evento: 'desactivar', entidad: 'usuarios', entidad_id: 'u9', campo: 'activo', valor_anterior: 'true', valor_nuevo: 'false' }),
  fila(3, { evento: 'decidir_caso', entidad: 'anomalias', entidad_id: 'c12', campo: null, valor_anterior: null, valor_nuevo: 'rechazada', motivo: 'No adjunta ninguna prueba' }),
  fila(4, { entidad: 'configuracion', entidad_id: '1', campo: 'modelo_ia', valor_anterior: 'gpt-4.1-mini', valor_nuevo: 'gemini-flash-latest', usuario_id: null, autor: null }),
  fila(5, { entidad: 'usuarios', entidad_id: 'u9', campo: 'clave_publica', valor_anterior: null, valor_nuevo: LLAVE }),
]

type Registro = { tabla: string; llamadas: [string, unknown[]][] }
let registros: Registro[]
let falla: { bitacora: boolean; nombres: boolean }

function simular({ filas = FILAS as object[], total = filas.length }: { filas?: object[]; total?: number } = {}) {
  registros = []
  falla = { bitacora: false, nombres: false }
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg: Registro = { tabla, llamadas: [] }
    registros.push(reg)
    const pidio = (m: string) => reg.llamadas.some(([k]) => k === m)
    const respuesta = () => {
      if (tabla === 'bitacora') return falla.bitacora ? { data: null, error: new Error('x'), count: null } : { data: filas, error: null, count: total }
      if (tabla === 'usuarios' && pidio('eq')) return { data: ADMINS, error: null }   // la lista de administradores
      if (falla.nombres) return { data: null, error: new Error('x') }
      if (tabla === 'sedes') return { data: [{ id: 's1', nombre: 'Matriz' }], error: null }
      if (tabla === 'usuarios') return { data: [{ id: 'u9', nombres: 'Luis', apellidos: 'Mora' }], error: null }
      if (tabla === 'v_anomalias_detalle') return { data: [{ id: 'c12', numero: 12 }], error: null }
      return { data: [], error: null }
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

const consultasBitacora = () => registros.filter((r) => r.tabla === 'bitacora')
const argsDe = (r: Registro, metodo: string) => r.llamadas.filter(([k]) => k === metodo).map(([, a]) => a)

function Ubicacion() {
  const l = useLocation()
  return <output data-testid="url">{l.search}</output>
}
const pantalla = (ruta = '/admin/auditoria') => renderConAuth(
  <Routes><Route path="/admin/auditoria" element={<><Auditoria /><Ubicacion /></>} /></Routes>,
  { perfil: perfilDe('administrador') }, ruta,
)
/** Las filas de la tabla (sin la cabecera). */
const filasTabla = () => Array.from(document.querySelectorAll('.tabla-fila')) as HTMLElement[]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T15:00:00Z') })   // jueves 5 de noviembre de 2026
  simular()
})
afterEach(() => { vi.useRealTimers() })

describe('Auditoría · lo que se ve', () => {
  it('muestra los cambios del mes con nombres legibles, el evento, los valores y quién lo hizo', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Auditoría' })).toBeInTheDocument()
    expect(await screen.findByText('Registro inmutable de los cambios en el sistema · noviembre de 2026')).toBeInTheDocument()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(screen.getByText('5 cambios')).toBeInTheDocument()

    const [sede, usuario, decision, parametro] = filasTabla()
    // Un cambio de sede: nombre de la sede (no su id), campo en español y los dos valores.
    expect(within(sede!).getByText('4 nov 2026 · 10:03')).toBeInTheDocument()
    expect(within(sede!).getByText('Actualizar')).toBeInTheDocument()
    expect(within(sede!).getByText('Matriz')).toBeInTheDocument()
    expect(within(sede!).getByText('Sede')).toBeInTheDocument()
    expect(within(sede!).getByText('Radio (m)')).toBeInTheDocument()
    expect(within(sede!).getByText('200')).toBeInTheDocument()
    expect(within(sede!).getByText('300')).toBeInTheDocument()
    expect(within(sede!).getByText('Ana Pérez')).toBeInTheDocument()

    // Desactivar a una persona: se lee «Activo» → «Inactivo», no true/false.
    expect(within(usuario!).getByText('Desactivar')).toBeInTheDocument()
    expect(within(usuario!).getByText('Luis Mora')).toBeInTheDocument()
    expect(within(usuario!).getByText('Activo')).toBeInTheDocument()
    expect(within(usuario!).getByText('Inactivo')).toBeInTheDocument()

    // Una decisión: el caso con su número, la decisión en español y el comentario como motivo.
    expect(within(decision!).getByText('Decidir caso')).toBeInTheDocument()
    expect(within(decision!).getByRole('link', { name: 'Caso A-12' })).toHaveAttribute('href', '/admin/anomalias/c12')
    expect(within(decision!).getByText('Decisión')).toBeInTheDocument()
    expect(within(decision!).getByText('Rechazada')).toBeInTheDocument()
    expect(within(decision!).getByText('No adjunta ninguna prueba')).toBeInTheDocument()

    // Lo que hizo el sistema (sin persona) lo dice.
    expect(within(parametro!).getByText('Parámetros del sistema')).toBeInTheDocument()
    expect(within(parametro!).getByText('Sistema')).toBeInTheDocument()
  })

  it('una exportación de reporte dice qué periodo, en qué formato, cuántos casos y si el resumen era borrador', async () => {
    simular({ filas: [fila(9, {
      evento: 'exportar_reporte', entidad: 'reportes', entidad_id: '2026-11-01 a 2026-11-30', campo: 'xlsx', valor_anterior: null, valor_nuevo: '46 casos',
      motivo: 'Sede: todas · resumen con IA como borrador sin revisar',
    })] })
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(1))
    const f = filasTabla()[0]!
    expect(within(f).getByText('Exportar reporte')).toBeInTheDocument()
    expect(within(f).getByText('1 nov 2026 a 30 nov 2026')).toBeInTheDocument()
    expect(within(f).getByText('Reporte')).toBeInTheDocument()
    expect(within(f).getByText('Excel')).toBeInTheDocument()
    expect(within(f).getByText('46 casos')).toBeInTheDocument()
    expect(within(f).getByText('Ana Pérez')).toBeInTheDocument()
    expect(within(f).getByText(/borrador sin revisar/)).toBeInTheDocument()
  })

  it('la clave de firma del celular nunca se muestra: solo que quedó registrada', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(within(filasTabla()[4]!).getByText('Registrada')).toBeInTheDocument()
    expect(screen.queryByText(LLAVE)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('llave-publica')
  })

  it('es solo lectura: no hay nada que editar ni borrar, y avisa que la bitácora no se puede cambiar', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(screen.queryByRole('button', { name: /editar|eliminar|borrar registro|guardar/i })).not.toBeInTheDocument()
    expect(screen.getByText(/La bitácora no se puede editar ni eliminar\. Los datos del rostro nunca aparecen aquí/)).toBeInTheDocument()
  })

  it('un periodo sin cambios lo dice', async () => {
    simular({ filas: [] })
    pantalla()
    expect(await screen.findByText('No hubo cambios en este periodo.')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Páginas' })).not.toBeInTheDocument()
  })

  it('si no se pueden buscar los nombres, la tabla igual se ve (con el identificador corto)', async () => {
    falla.nombres = true
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(within(filasTabla()[0]!).getByText('Registro s1')).toBeInTheDocument()
  })

  it('si falla la consulta lo avisa y se puede reintentar', async () => {
    falla.bitacora = true
    pantalla()
    expect(await screen.findByText(/No se pudo cargar la bitácora/)).toBeInTheDocument()
    falla.bitacora = false
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
  })
})

describe('Auditoría · lo que se pide a la base', () => {
  it('pide el mes actual, lo más reciente primero, de veinte en veinte', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    const [c] = consultasBitacora()
    expect(argsDe(c!, 'gte')).toEqual([['created_at', '2026-11-01T05:00:00.000Z']])
    expect(argsDe(c!, 'lt')).toEqual([['created_at', '2026-12-01T05:00:00.000Z']])
    expect(argsDe(c!, 'order')).toEqual([['created_at', { ascending: false }], ['id', { ascending: false }]])
    expect(argsDe(c!, 'range')).toEqual([[0, 19]])
    expect(argsDe(c!, 'eq')).toEqual([])
  })

  it('no pide las sedes para un filtro que no existe aquí', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
    // La única búsqueda en `sedes` es la del nombre de la sede que cambió, con sus identificadores.
    const sedes = registros.filter((r) => r.tabla === 'sedes')
    expect(sedes.every((r) => argsDe(r, 'in').length === 1)).toBe(true)
  })

  it('pide los administradores para el filtro «Realizado por»', async () => {
    pantalla()
    const combo = await screen.findByRole('combobox', { name: 'Realizado por' })
    await waitFor(() => expect(within(combo).getByRole('option', { name: 'Bruno Cedeño' })).toBeInTheDocument())
    expect(within(combo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Realizado por: todos', 'Sistema', 'Ana Pérez', 'Bruno Cedeño'])
  })
})

describe('Auditoría · filtros', () => {
  it('filtrar por evento, entidad y quién lo hizo vuelve a pedir la tabla con esos filtros y los deja en la dirección', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })

    await u.selectOptions(screen.getByRole('combobox', { name: 'Evento' }), 'desactivar')
    await u.selectOptions(screen.getByRole('combobox', { name: 'Entidad' }), 'usuarios')
    await u.selectOptions(await screen.findByRole('combobox', { name: 'Realizado por' }), 'a2')
    expect(screen.getByTestId('url')).toHaveTextContent('evento=desactivar')
    expect(screen.getByTestId('url')).toHaveTextContent('entidad=usuarios')
    expect(screen.getByTestId('url')).toHaveTextContent('por=a2')

    await waitFor(() => {
      const ultima = consultasBitacora().at(-1)!
      expect(argsDe(ultima, 'eq')).toEqual([['evento', 'desactivar'], ['entidad', 'usuarios'], ['usuario_id', 'a2']])
    })
  })

  it('«Sistema» pide los cambios sin persona', async () => {
    pantalla()
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).selectOptions(await screen.findByRole('combobox', { name: 'Realizado por' }), 'sistema')
    await waitFor(() => {
      const ultima = consultasBitacora().at(-1)!
      expect(argsDe(ultima, 'is')).toEqual([['usuario_id', null]])
      expect(argsDe(ultima, 'eq')).toEqual([])
    })
  })

  it('«Borrar filtros» aparece solo con filtros y los quita todos', async () => {
    pantalla('/admin/auditoria?evento=crear&entidad=sedes')
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    expect(screen.getByRole('combobox', { name: 'Evento' })).toHaveValue('crear')
    await u.click(screen.getByRole('button', { name: 'Borrar filtros' }))
    expect(screen.getByTestId('url')).toHaveTextContent(/^$/)
    expect(screen.queryByRole('button', { name: 'Borrar filtros' })).not.toBeInTheDocument()
  })

  it('con filtros y sin resultados lo dice distinto que sin cambios', async () => {
    simular({ filas: [] })
    pantalla('/admin/auditoria?evento=crear')
    expect(await screen.findByText('No hay cambios que coincidan con esos filtros.')).toBeInTheDocument()
  })

  it('un evento o una entidad inventados en la dirección se ignoran', async () => {
    pantalla('/admin/auditoria?evento=borrar&entidad=bitacora')
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    expect(argsDe(consultasBitacora()[0]!, 'eq')).toEqual([])
    expect(screen.getByRole('combobox', { name: 'Evento' })).toHaveValue('')
  })

  it('cambiar de periodo pide otro rango; un rango de más de un año no consulta nada', async () => {
    pantalla('/admin/auditoria?periodo=rango&desde=2025-01-01&hasta=2026-11-05')
    expect(await screen.findByText(/como máximo 366 días/)).toBeInTheDocument()
    expect(consultasBitacora()).toHaveLength(0)
  })
})

describe('Auditoría · páginas', () => {
  beforeEach(() => simular({ filas: FILAS, total: 45 }))

  it('con más de veinte cambios se pagina y la página queda en la dirección', async () => {
    pantalla()
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 1–5 de 45 · del más reciente al más antiguo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '‹ Anterior' })).toBeDisabled()

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(screen.getByTestId('url')).toHaveTextContent('pagina=2')
    await waitFor(() => expect(argsDe(consultasBitacora().at(-1)!, 'range')).toEqual([[20, 39]]))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('filtrar vuelve a la primera página', async () => {
    pantalla('/admin/auditoria?pagina=3')
    await waitFor(() => expect(filasTabla()).toHaveLength(5))
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).selectOptions(screen.getByRole('combobox', { name: 'Evento' }), 'crear')
    expect(screen.getByTestId('url')).not.toHaveTextContent('pagina')
  })
})
