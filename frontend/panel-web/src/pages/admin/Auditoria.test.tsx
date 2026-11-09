import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Auditoria from './Auditoria'
import { descargarBinario } from './reportesExportar'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('./reportesExportar', async (original) => ({ ...(await original<typeof import('./reportesExportar')>()), descargarBinario: vi.fn() }))

const ADMINS = [{ id: 'a1', nombres: 'Ana', apellidos: 'Pérez' }, { id: 'a2', nombres: 'Bruno', apellidos: 'Cedeño' }]
const ANA = { nombres: 'Ana', apellidos: 'Pérez' }

const cambio = (id: string, extra: object = {}) => ({ id, evento: 'actualizar', campo: 'radio_metros', valor_anterior: '200', valor_nuevo: '300', motivo: null, ...extra })
const accion = (n: number, extra: object = {}) => ({
  id: `b${n}`, created_at: '2026-11-04T15:03:00+00:00', usuario_id: 'a1', autor: ANA, entidad: 'sedes', entidad_id: 's1', evento: 'actualizar', grupo: 'personas_sedes',
  motivo: null, datos: 1, cambios: [cambio(`c${n}`)], ...extra,
})
// Hoy es jueves 5 de noviembre de 2026, 10:00 en Ecuador.
const ACCIONES = [
  accion(1, { created_at: '2026-11-05T14:40:00+00:00' }),
  accion(2, { created_at: '2026-11-05T13:05:00+00:00', entidad: 'anomalias', entidad_id: 'c12', evento: 'decidir_caso', grupo: 'decisiones', motivo: 'No adjunta ninguna prueba', datos: 0,
    cambios: [cambio('c2', { evento: 'decidir_caso', campo: null, valor_anterior: null, valor_nuevo: 'rechazada', motivo: 'No adjunta ninguna prueba' })] }),
  accion(3, { entidad: 'usuarios', entidad_id: 'u9', datos: 4, motivo: 'Cambio de turno',
    cambios: [
      cambio('c3a', { campo: 'dias_laborables', valor_anterior: '[1,2,3,4,5]', valor_nuevo: '[1,2,3,4,5,6]', motivo: 'Cambio de turno' }),
      cambio('c3b', { campo: 'jornada_fin', valor_anterior: '17:00:00', valor_nuevo: '16:30:00' }),
      cambio('c3c', { campo: 'jornada_inicio', valor_anterior: '08:00:00', valor_nuevo: '07:30:00' }),
      cambio('c3d', { campo: 'sede_id', valor_anterior: 's1', valor_nuevo: 's2' }),
    ] }),
  accion(4, { evento: 'desactivar', entidad: 'usuarios', entidad_id: 'u9', datos: 1, cambios: [cambio('c4', { evento: 'desactivar', campo: 'activo', valor_anterior: 'true', valor_nuevo: 'false' })] }),
  accion(5, { entidad: 'configuracion', entidad_id: '1', grupo: 'configuracion', usuario_id: null, autor: null, cambios: [cambio('c5', { campo: 'tolerancia_min', valor_anterior: '10', valor_nuevo: '15' })] }),
  accion(6, { evento: 'resetear_rostro', entidad: 'usuarios', entidad_id: 'u9', grupo: 'rostros_celulares', datos: 1, motivo: 'Cambió de apariencia',
    cambios: [cambio('c6', { evento: 'resetear_rostro', campo: 'fecha_registro_rostro', valor_anterior: '2026-10-01T10:00:00Z', valor_nuevo: null, motivo: 'Cambió de apariencia' })] }),
  accion(7, { evento: 'exportar_reporte', entidad: 'reportes', entidad_id: '2026-11-01 a 2026-11-30', grupo: 'exportaciones', datos: 0,
    motivo: 'Sede: todas · con resumen redactado por IA · Incluye: Tabla de casos',
    cambios: [cambio('c7', { evento: 'exportar_reporte', campo: 'pdf', valor_anterior: null, valor_nuevo: '108 casos', motivo: 'Sede: todas · con resumen redactado por IA · Incluye: Tabla de casos' })] }),
]
const PAGINA = (extra: object = {}) => ({
  total: 7, datos: 8, filas: 10, acciones: ACCIONES,
  conteos: { todo: 7, configuracion: 1, personas_sedes: 3, rostros_celulares: 1, decisiones: 1, exportaciones: 1, sistema: 1 }, ...extra,
})

let respuesta: object
let falla: { acciones: boolean; nombres: boolean; anotar: boolean }
let llamadasFrom: { tabla: string; ids: unknown[] }[]

function simular(pagina: object = PAGINA()) {
  respuesta = pagina
  falla = { acciones: false, nombres: false, anotar: false }
  llamadasFrom = []
  vi.mocked(supabase.rpc).mockImplementation((async (nombre: string) => {
    if (nombre === 'auditoria_acciones') return falla.acciones ? { data: null, error: new Error('x') } : { data: respuesta, error: null }
    if (nombre === 'registrar_exportacion_auditoria') return falla.anotar ? { data: null, error: new Error('x') } : { data: null, error: null }
    return { data: null, error: null }
  }) as never)
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    const reg = { tabla, ids: [] as unknown[], eq: false }
    llamadasFrom.push(reg)
    const respuestaTabla = () => {
      if (tabla === 'usuarios' && reg.eq) return { data: ADMINS, error: null }
      if (falla.nombres) return { data: null, error: new Error('x') }
      if (tabla === 'sedes') return { data: [{ id: 's1', nombre: 'Matriz' }, { id: 's2', nombre: 'Campus Norte' }], error: null }
      if (tabla === 'usuarios') return { data: [{ id: 'u9', nombres: 'Luis', apellidos: 'Mora' }], error: null }
      if (tabla === 'v_anomalias_detalle') return { data: [{ id: 'c12', numero: 12, colaborador: 'Carlos Ruiz' }], error: null }
      return { data: [], error: null }
    }
    const cadena: object = new Proxy({}, {
      get: (_, nombre: string) => {
        if (nombre === 'then') return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(respuestaTabla()).then(ok, ko)
        return (...args: unknown[]) => { if (nombre === 'eq') reg.eq = true; if (nombre === 'in') reg.ids.push(args[1]); return cadena }
      },
    })
    return cadena
  }) as never)
}

const llamadasA = (nombre: string) => vi.mocked(supabase.rpc).mock.calls.filter((c) => c[0] === nombre).map((c) => c[1] as Record<string, unknown>)
const ultimaConsulta = () => llamadasA('auditoria_acciones').at(-1)!

function Ubicacion() {
  const l = useLocation()
  return <output data-testid="url">{l.search}</output>
}
const pantalla = (ruta = '/admin/auditoria') => renderConAuth(
  <Routes><Route path="/admin/auditoria" element={<><Auditoria /><Ubicacion /></>} /></Routes>,
  { perfil: perfilDe('administrador') }, ruta,
)
/** El párrafo de la frase de una acción, por su texto completo. */
const frase = (texto: string) => screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === texto)
const fila = (texto: string) => frase(texto).closest('button') as HTMLElement
const conFrase = (texto: string) => (_: string, el: Element | null) => el?.tagName === 'P' && el.textContent === texto
const cargada = async () => { await screen.findByText(conFrase('Ana Pérez cambió radio (m) de Matriz')) }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-05T15:00:00Z') })
  vi.mocked(descargarBinario).mockReset()
  simular()
})
afterEach(() => { vi.useRealTimers() })

describe('Auditoría · lo que se ve', () => {
  it('muestra cada acción como una frase, con el total de acciones y de datos cambiados', async () => {
    pantalla()
    expect(screen.getByRole('heading', { name: 'Auditoría' })).toBeInTheDocument()
    expect(await screen.findByText('Registro inmutable de los cambios en el sistema · noviembre de 2026')).toBeInTheDocument()
    await cargada()
    expect(screen.getByText('7 acciones · 8 datos cambiados')).toBeInTheDocument()
    expect(frase('Ana Pérez cambió 4 datos de Luis Mora')).toBeInTheDocument()
    expect(frase('Ana Pérez desactivó el usuario Luis Mora')).toBeInTheDocument()
    expect(frase('Ana Pérez decidió el caso A-12 de Carlos Ruiz: Rechazada')).toBeInTheDocument()
    expect(frase('Ana Pérez reseteó el rostro de Luis Mora')).toBeInTheDocument()
    expect(frase('Ana Pérez exportó un reporte a PDF')).toBeInTheDocument()
    expect(frase('Sistema cambió tolerancia (min) en Parámetros del sistema')).toBeInTheDocument()
  })

  it('agrupa por día y dice la hora exacta y cuánto hace', async () => {
    pantalla()
    await cargada()
    expect(screen.getByRole('heading', { name: 'Hoy · jueves 5 de noviembre' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ayer · miércoles 4 de noviembre' })).toBeInTheDocument()
    const primera = fila('Ana Pérez cambió radio (m) de Matriz')
    expect(within(primera).getByText('09:40')).toBeInTheDocument()
    expect(within(primera).getByText('hace 20 min')).toBeInTheDocument()
    expect(within(fila('Ana Pérez cambió 4 datos de Luis Mora')).getByText('ayer')).toBeInTheDocument()
  })

  it('varios datos de una misma acción van en una sola fila: dos a la vista y «+2 más»', async () => {
    pantalla()
    await cargada()
    const f = fila('Ana Pérez cambió 4 datos de Luis Mora')
    expect(within(f).getByText('Días laborables: lunes a viernes → lunes a sábado')).toBeInTheDocument()
    expect(within(f).getByText('+2 más')).toBeInTheDocument()
    expect(within(f).getByText('Motivo: Cambio de turno')).toBeInTheDocument()
  })

  it('un cambio de un dato muestra su antes y después; una decisión, su motivo; un reporte, lo que se exportó', async () => {
    pantalla()
    await cargada()
    expect(within(fila('Ana Pérez cambió radio (m) de Matriz')).getByText('Radio (m): 200 → 300')).toBeInTheDocument()
    expect(within(fila('Ana Pérez decidió el caso A-12 de Carlos Ruiz: Rechazada')).getByText('Motivo: No adjunta ninguna prueba')).toBeInTheDocument()
    const rep = fila('Ana Pérez exportó un reporte a PDF')
    expect(within(rep).getByText('Periodo: 1 nov 2026 a 30 nov 2026')).toBeInTheDocument()
    expect(within(rep).getByText('108 casos')).toBeInTheDocument()
    expect(within(rep).getByText('Todas las sedes')).toBeInTheDocument()
    expect(within(rep).getByText('Con resumen redactado por IA')).toBeInTheDocument()
  })

  it('lo que no hizo una persona se llama «Sistema» y nada dice que el sistema decidiera un caso', async () => {
    pantalla()
    await cargada()
    const f = fila('Sistema cambió tolerancia (min) en Parámetros del sistema')
    expect(within(f).getByText('Sistema').className).toContain('italic')
    expect(screen.queryByText(/pasó .* a «Sin justificar»/)).not.toBeInTheDocument()
  })

  it('es solo lectura: no hay nada que editar ni borrar, y avisa que la bitácora no se puede cambiar', async () => {
    pantalla()
    await cargada()
    expect(screen.queryByRole('button', { name: /editar|eliminar|borrar registro/i })).not.toBeInTheDocument()
    expect(screen.getAllByText(/no se puede editar ni eliminar/i).length).toBeGreaterThan(0)
  })

  it('un periodo sin cambios lo dice; con filtros lo dice distinto', async () => {
    simular(PAGINA({ total: 0, datos: 0, filas: 0, acciones: [] }))
    pantalla()
    expect(await screen.findByText('No hubo cambios en este periodo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Exportar a Excel/ })).toBeDisabled()
  })

  it('con filtros y sin resultados lo dice distinto que sin cambios', async () => {
    simular(PAGINA({ total: 0, datos: 0, filas: 0, acciones: [] }))
    pantalla('/admin/auditoria?grupo=decisiones')
    expect(await screen.findByText('No hay acciones que coincidan con esos filtros.')).toBeInTheDocument()
  })

  it('si no se pueden buscar los nombres, la lista igual se ve (con el identificador corto)', async () => {
    falla.nombres = true
    pantalla()
    expect(await screen.findByText(conFrase('Ana Pérez cambió radio (m) de Registro s1'))).toBeInTheDocument()
  })

  it('si falla la consulta lo avisa y se puede reintentar', async () => {
    falla.acciones = true
    pantalla()
    expect(await screen.findByText(/No se pudo cargar la bitácora/)).toBeInTheDocument()
    falla.acciones = false
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await cargada()
    expect(screen.queryByText(/No se pudo cargar la bitácora/)).not.toBeInTheDocument()
  })
})

describe('Auditoría · el detalle', () => {
  const abrir = async (texto: string) => {
    await userEvent.click(fila(texto))
    return screen.findByRole('dialog', { name: 'Detalle del cambio' })
  }

  it('al tocar una acción se abre el detalle con quién, cuándo, el registro, el motivo y cada dato con su antes y después', async () => {
    pantalla()
    await cargada()
    expect(screen.queryByRole('dialog', { name: 'Detalle del cambio' })).not.toBeInTheDocument()
    const d = await abrir('Ana Pérez cambió 4 datos de Luis Mora')
    expect(within(d).getByRole('heading', { name: 'Ana Pérez cambió 4 datos de Luis Mora' })).toBeInTheDocument()
    expect(within(d).getByText('Miércoles 4 de noviembre de 2026 · 10:03 (hora de Ecuador)')).toBeInTheDocument()
    expect(within(d).getByText('Cambio de turno', { selector: 'dd' })).toBeInTheDocument()
    expect(within(d).getByText('Luis Mora')).toBeInTheDocument()
    const filas = within(d).getAllByRole('row').slice(1).map((r) => Array.from(r.children).map((c) => c.textContent))
    expect(filas).toEqual([
      ['Días laborables', 'lunes a viernes', 'lunes a sábado'],
      ['Fin de la jornada', '17:00', '16:30'],
      ['Inicio de la jornada', '08:00', '07:30'],
      ['Sede', 'Matriz', 'Campus Norte'],
    ])
    expect(within(d).getByText(/no se puede editar ni eliminar/)).toBeInTheDocument()
  })

  it('una acción del Sistema lo dice con claridad', async () => {
    pantalla()
    await cargada()
    const d = await abrir('Sistema cambió tolerancia (min) en Parámetros del sistema')
    expect(within(d).getByText('Sistema (sin una persona asociada)')).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: /Ver todo lo de/ })).not.toBeInTheDocument()
  })

  it('un reporte exportado muestra lo que se exportó y su detalle, no una tabla de datos', async () => {
    pantalla()
    await cargada()
    const d = await abrir('Ana Pérez exportó un reporte a PDF')
    expect(within(d).getByText('Lo que se exportó')).toBeInTheDocument()
    expect(within(d).getByText('Sede: todas · con resumen redactado por IA · Incluye: Tabla de casos')).toBeInTheDocument()
    expect(within(d).queryByRole('table')).not.toBeInTheDocument()
  })

  it('«Ver todo lo de…» cierra el detalle y busca a esa persona', async () => {
    pantalla()
    await cargada()
    const d = await abrir('Ana Pérez cambió 4 datos de Luis Mora')
    await userEvent.click(within(d).getByRole('button', { name: 'Ver todo lo de Luis Mora' }))
    expect(screen.getByTestId('url')).toHaveTextContent('q=Luis+Mora')
    expect(screen.getByRole('searchbox', { name: 'Buscar por nombre' })).toHaveValue('Luis Mora')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_buscar: 'Luis Mora' }))
    expect(screen.queryByRole('dialog', { name: 'Detalle del cambio' })).not.toBeInTheDocument()
  })

  it('de un caso se busca a la persona del caso', async () => {
    pantalla()
    await cargada()
    const d = await abrir('Ana Pérez decidió el caso A-12 de Carlos Ruiz: Rechazada')
    expect(within(d).getByRole('button', { name: 'Ver todo lo de Carlos Ruiz' })).toBeInTheDocument()
  })

  it('se cierra con «Cerrar» y con Escape', async () => {
    pantalla()
    await cargada()
    await abrir('Ana Pérez cambió radio (m) de Matriz')
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Detalle del cambio' }))
    expect(screen.queryByRole('dialog', { name: 'Detalle del cambio' })).not.toBeInTheDocument()
    await abrir('Ana Pérez cambió radio (m) de Matriz')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Detalle del cambio' })).not.toBeInTheDocument()
  })
})

describe('Auditoría · lo que se pide a la base', () => {
  it('pide el mes actual, la primera página de veinte, sin filtros', async () => {
    pantalla()
    await cargada()
    expect(llamadasA('auditoria_acciones')).toHaveLength(1)
    expect(ultimaConsulta()).toEqual({
      p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_evento: null, p_entidad: null, p_por: null, p_grupo: null,
      p_buscar: null, p_limite: 20, p_desplazamiento: 0,
    })
  })

  it('no pide las sedes para un filtro que no existe aquí', async () => {
    pantalla()
    await cargada()
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
    expect(llamadasFrom.filter((r) => r.tabla === 'sedes').every((r) => r.ids.length === 1)).toBe(true)
  })

  it('pide los administradores para el filtro «Realizado por»', async () => {
    pantalla()
    const combo = await screen.findByRole('combobox', { name: 'Realizado por' })
    await waitFor(() => expect(within(combo).getByRole('option', { name: 'Bruno Cedeño' })).toBeInTheDocument())
    expect(within(combo).getAllByRole('option').map((o) => o.textContent)).toEqual(['Realizado por: todos', 'Sistema', 'Ana Pérez', 'Bruno Cedeño'])
  })

  it('un rango de más de un año no consulta nada', async () => {
    pantalla('/admin/auditoria?periodo=rango&desde=2025-01-01&hasta=2026-11-05')
    expect(await screen.findByText(/como máximo 366 días/)).toBeInTheDocument()
    expect(llamadasA('auditoria_acciones')).toHaveLength(0)
  })
})

describe('Auditoría · atajos', () => {
  it('muestran cuántas acciones tiene cada uno', async () => {
    pantalla()
    await cargada()
    const grupo = screen.getByRole('group', { name: 'Atajos' })
    const textos = within(grupo).getAllByRole('button').map((b) => b.textContent)
    expect(textos).toEqual(['Todo7', 'Configuración1', 'Personas y sedes3', 'Rostros y celulares1', 'Decisiones de casos1', 'Exportaciones1', 'Hechos por el sistema1'])
    expect(within(grupo).getByRole('button', { name: /^Todo/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('tocar uno pide solo esas acciones, queda marcado y en la dirección', async () => {
    pantalla()
    await cargada()
    await userEvent.click(screen.getByRole('button', { name: /^Decisiones de casos/ }))
    expect(screen.getByTestId('url')).toHaveTextContent('grupo=decisiones')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_grupo: 'decisiones' }))
    expect(screen.getByRole('button', { name: /^Decisiones de casos/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: /^Todo/ }))
    expect(screen.getByTestId('url')).not.toHaveTextContent('grupo')
  })

  it('un atajo inventado en la dirección se ignora', async () => {
    pantalla('/admin/auditoria?grupo=inventado')
    await cargada()
    expect(ultimaConsulta()).toMatchObject({ p_grupo: null })
  })
})

describe('Auditoría · búsqueda y filtros', () => {
  it('buscar por nombre espera a que se deje de escribir, y queda en la dirección', async () => {
    pantalla()
    await cargada()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'luis')
    expect(llamadasA('auditoria_acciones')).toHaveLength(1)   // todavía no pidió nada
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_buscar: 'luis' }))
    expect(llamadasA('auditoria_acciones')).toHaveLength(2)   // una sola vez, no una por letra
    expect(screen.getByTestId('url')).toHaveTextContent('q=luis')
  })

  it('al abrir con una búsqueda en la dirección, la caja y la consulta la llevan', async () => {
    pantalla('/admin/auditoria?q=campus')
    await cargada()
    expect(screen.getByRole('searchbox', { name: 'Buscar por nombre' })).toHaveValue('campus')
    expect(ultimaConsulta()).toMatchObject({ p_buscar: 'campus' })
  })

  it('filtrar por evento y por quién lo hizo vuelve a pedir la lista con esos filtros y los deja en la dirección', async () => {
    pantalla()
    await cargada()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Evento' }), 'resetear_rostro')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_evento: 'resetear_rostro' }))
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: 'Realizado por' })).getByRole('option', { name: 'Bruno Cedeño' })).toBeInTheDocument())
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Realizado por' }), 'a2')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_evento: 'resetear_rostro', p_por: 'a2' }))
    expect(screen.getByTestId('url')).toHaveTextContent('evento=resetear_rostro')
    expect(screen.getByTestId('url')).toHaveTextContent('por=a2')
  })

  it('«Sistema» pide las acciones sin persona', async () => {
    pantalla()
    await cargada()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Realizado por' }), 'sistema')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_por: 'sistema' }))
  })

  it('«Borrar filtros» aparece solo con filtros y los quita todos, también la búsqueda', async () => {
    pantalla('/admin/auditoria?grupo=decisiones&q=luis&evento=crear')
    await cargada()
    await userEvent.click(screen.getByRole('button', { name: 'Borrar filtros' }))
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_grupo: null, p_buscar: null, p_evento: null }))
    expect(screen.getByRole('searchbox', { name: 'Buscar por nombre' })).toHaveValue('')
    expect(screen.queryByRole('button', { name: 'Borrar filtros' })).not.toBeInTheDocument()
  })

  it('un evento inventado en la dirección se ignora', async () => {
    pantalla('/admin/auditoria?evento=inventado')
    await cargada()
    expect(ultimaConsulta()).toMatchObject({ p_evento: null })
  })
})

describe('Auditoría · páginas', () => {
  beforeEach(() => simular(PAGINA({ total: 45 })))

  it('con más de veinte acciones se pagina y la página queda en la dirección', async () => {
    pantalla()
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    expect(screen.getByText('Mostrando 1–7 de 45 · de la más reciente a la más antigua')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '‹ Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(screen.getByTestId('url')).toHaveTextContent('pagina=2')
    await waitFor(() => expect(ultimaConsulta()).toMatchObject({ p_limite: 20, p_desplazamiento: 20 }))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
  })

  it('filtrar vuelve a la primera página', async () => {
    pantalla('/admin/auditoria?pagina=3')
    await cargada()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Evento' }), 'crear')
    expect(screen.getByTestId('url')).not.toHaveTextContent('pagina')
  })
})

describe('Auditoría · exportar a Excel', () => {
  const TEXTO = (d: unknown) => new TextDecoder('utf-8').decode(d as Uint8Array)
  const abrir = async () => {
    await cargada()
    await userEvent.click(screen.getByRole('button', { name: 'Exportar a Excel' }))
    return screen.findByRole('dialog', { name: 'Exportar bitácora a Excel' })
  }

  it('el cuadro dice qué se exporta, con los filtros puestos, y cuántas filas salen según cómo se elija', async () => {
    pantalla('/admin/auditoria?grupo=decisiones&q=luis')
    const d = await abrir()
    expect(within(d).getByText('8 datos cambiados')).toBeInTheDocument()
    expect(within(d).getByText('7 acciones')).toBeInTheDocument()
    for (const t of ['noviembre de 2026', 'Atajo: Decisiones de casos', 'Búsqueda: «luis»']) expect(within(d).getByText(t)).toBeInTheDocument()
    expect(within(d).getByRole('radio', { name: /Una fila por dato cambiado/ })).toBeChecked()
    expect(within(d).getByRole('status')).toHaveTextContent('Se descargará: Excel · 10 filas')
    await userEvent.click(within(d).getByRole('radio', { name: /Una fila por acción/ }))
    expect(within(d).getByRole('status')).toHaveTextContent('Se descargará: Excel · 7 filas')
    expect(within(d).getByText(/queda anotada en Auditoría/)).toBeInTheDocument()
    expect(descargarBinario).not.toHaveBeenCalled()
    expect(llamadasA('registrar_exportacion_auditoria')).toHaveLength(0)
  })

  it('descarga un .xlsx con una fila por dato y deja constancia con el periodo, las filas y los filtros', async () => {
    pantalla()
    const d = await abrir()
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    await waitFor(() => expect(descargarBinario).toHaveBeenCalledTimes(1))
    const [nombre, bytes, tipo] = vi.mocked(descargarBinario).mock.calls[0] as [string, Uint8Array, string]
    expect(nombre).toBe('auditoria-2026-11-01-a-2026-11-30.xlsx')
    expect(tipo).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])
    const contenido = TEXTO(bytes)
    expect(contenido).toContain('Ana Pérez cambió 4 datos de Luis Mora')
    expect(contenido).toContain('Una fila por dato cambiado')
    expect(await screen.findByText('Excel listo: 10 filas')).toBeInTheDocument()
    await waitFor(() => expect(llamadasA('registrar_exportacion_auditoria')).toHaveLength(1))
    expect(llamadasA('registrar_exportacion_auditoria')[0]).toEqual({
      p_desde: '2026-11-01T05:00:00.000Z', p_hasta: '2026-12-01T05:00:00.000Z', p_filas: 10,
      p_detalle: 'Una fila por dato cambiado · Atajo: Todo · Sin búsqueda',
    })
    expect(screen.queryByRole('dialog', { name: 'Exportar bitácora a Excel' })).not.toBeInTheDocument()
  })

  it('pide a la base hasta 5 000 acciones con los mismos filtros y no solo la página que se ve', async () => {
    pantalla('/admin/auditoria?grupo=decisiones&pagina=1')
    const d = await abrir()
    await userEvent.click(within(d).getByRole('radio', { name: /Una fila por acción/ }))
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    await waitFor(() => expect(descargarBinario).toHaveBeenCalledTimes(1))
    const completa = llamadasA('auditoria_acciones').find((c) => c.p_limite === 5000)!
    expect(completa).toMatchObject({ p_grupo: 'decisiones', p_desplazamiento: 0 })
    await waitFor(() => expect(llamadasA('registrar_exportacion_auditoria')[0]).toMatchObject({ p_filas: 7, p_detalle: 'Una fila por acción · Atajo: Decisiones de casos · Sin búsqueda' }))
  })

  it('después de anotar la descarga, la lista se vuelve a pedir para que aparezca', async () => {
    pantalla()
    const d = await abrir()
    const antes = llamadasA('auditoria_acciones').length
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    await waitFor(() => expect(llamadasA('registrar_exportacion_auditoria')).toHaveLength(1))
    await waitFor(() => expect(llamadasA('auditoria_acciones').length).toBeGreaterThan(antes + 1))
  })

  it('con más filas de las que caben avisa que el archivo quedó recortado', async () => {
    simular(PAGINA({ total: 6200, datos: 9000, filas: 9000 }))
    pantalla()
    const d = await abrir()
    expect(within(d).getByRole('status')).toHaveTextContent('Se descargará: Excel · las primeras 5 000 de 9 000 filas')
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    expect(await screen.findByText(/El Excel trae las primeras 10 filas/)).toBeInTheDocument()
  })

  it('si no se pudo anotar, el archivo ya salió y solo se avisa', async () => {
    falla.anotar = true
    pantalla()
    const d = await abrir()
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    expect(await screen.findByText('El archivo salió, pero no se pudo anotar la exportación en Auditoría')).toBeInTheDocument()
    expect(descargarBinario).toHaveBeenCalledTimes(1)
  })

  it('si no se pudo preparar el archivo, avisa, no descarga ni anota nada y deja el cuadro abierto', async () => {
    pantalla()
    const d = await abrir()
    falla.acciones = true
    await userEvent.click(within(d).getByRole('button', { name: 'Descargar Excel' }))
    expect(await screen.findByText('No se pudo preparar la exportación. Intenta de nuevo')).toBeInTheDocument()
    expect(descargarBinario).not.toHaveBeenCalled()
    expect(llamadasA('registrar_exportacion_auditoria')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'Exportar bitácora a Excel' })).toBeInTheDocument()
  })

  it('el cuadro se cierra con Escape, con Cancelar y con ✕', async () => {
    pantalla()
    await abrir()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Exportar bitácora a Excel' })).not.toBeInTheDocument()
    let d = await abrir().catch(() => null)
    d ??= await screen.findByRole('dialog', { name: 'Exportar bitácora a Excel' })
    await userEvent.click(within(d).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Exportar bitácora a Excel' })).not.toBeInTheDocument()
  })
})
