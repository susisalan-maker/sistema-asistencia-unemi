import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import AdminLayout from './AdminLayout'
import { leerVisita } from './novedadesBandeja'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

/** Cuántos casos justificaron las personas desde la última visita (lo que cuenta la base). */
let nuevas = 0

const pantalla = (cerrarSesion = async () => {}, ruta = '/admin/anomalias') =>
  renderConAuth(
    <Routes><Route path="/admin" element={<AdminLayout />}>
      <Route path="anomalias" element={<p>Bandeja</p>} />
      <Route path="reportes" element={<p>Reportes aquí</p>} />
    </Route></Routes>,
    { perfil: perfilDe('administrador') as never, cerrarSesion }, ruta,
  )

beforeEach(() => {
  window.localStorage.clear()
  nuevas = 0
  vi.mocked(supabase.from).mockImplementation((() => {
    const c: Record<string, unknown> = {}
    for (const m of ['select', 'gte', 'in']) c[m] = () => c
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ count: nuevas, error: null }).then(ok, ko)
    return c
  }) as never)
})

describe('AdminLayout · menú lateral', () => {
  it('abierto muestra los textos junto a los iconos y la entrada actual queda marcada', () => {
    pantalla()
    expect(screen.getByRole('button', { name: 'Contraer menú' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Sedes y bloques')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anomalías' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument()
  })

  it('Reportes y Auditoría son entradas del menú, cada una con su enlace', () => {
    pantalla()
    expect(screen.getByRole('link', { name: 'Reportes' })).toHaveAttribute('href', '/admin/reportes')
    expect(screen.getByRole('link', { name: 'Auditoría' })).toHaveAttribute('href', '/admin/auditoria')
  })

  it('Feriados ya no es una entrada del menú: vive dentro de Configuración', () => {
    pantalla()
    expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute('href', '/admin/configuracion')
    expect(screen.queryByRole('link', { name: 'Feriados' })).not.toBeInTheDocument()
  })

  it('se contrae a solo iconos, conserva el nombre accesible de cada entrada y se vuelve a abrir', async () => {
    pantalla()
    await userEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('title', 'Usuarios')
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Expandir menú' }))
    expect(screen.getByRole('button', { name: 'Contraer menú' })).toBeInTheDocument()
  })

  it('recuerda la elección: si se dejó cerrado, abre cerrado', async () => {
    const { unmount } = pantalla()
    await userEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    unmount()
    pantalla()
    expect(screen.getByRole('button', { name: 'Expandir menú' })).toBeInTheDocument()
  })

  it('con el menú cerrado se puede cerrar sesión desde el icono', async () => {
    const salir = vi.fn(async () => {})
    pantalla(salir)
    await userEvent.click(screen.getByRole('button', { name: 'Contraer menú' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(salir).toHaveBeenCalledOnce()
  })
})

/** Simula una pantalla de celular: la consulta `(min-width: 1024px)` no se cumple. */
function pantallaAngosta() {
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    matches: false, media: consulta, addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
  }))
}

describe('AdminLayout · menú en pantallas angostas', () => {
  beforeEach(pantallaAngosta)
  afterEach(() => vi.unstubAllGlobals())

  const menu = () => document.querySelector('aside') as HTMLElement

  it('empieza cerrado (fuera de pantalla y sin foco) y se abre con el botón de la barra superior', async () => {
    pantallaAngosta()
    pantalla()
    expect(menu()).toHaveAttribute('inert')
    const abrir = screen.getByRole('button', { name: 'Abrir menú' })
    expect(abrir).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(abrir)
    expect(menu()).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('en el cajón se ven los textos aunque en el computador se haya dejado contraído', async () => {
    window.localStorage.setItem('menu-lateral-abierto', 'no')
    pantalla()
    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
    expect(screen.getByText('Sedes y bloques')).toBeVisible()
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument()
  })

  it('se cierra con la X, con el fondo oscuro, con Escape y al elegir una sección', async () => {
    pantalla()
    const abrir = () => userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))

    await abrir()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar menú' }))
    expect(menu()).toHaveAttribute('inert')

    await abrir()
    await userEvent.click(screen.getByTestId('fondo-menu'))
    expect(menu()).toHaveAttribute('inert')

    await abrir()
    await userEvent.keyboard('{Escape}')
    expect(menu()).toHaveAttribute('inert')

    await abrir()
    await userEvent.click(screen.getByRole('link', { name: 'Anomalías' }))
    expect(menu()).toHaveAttribute('inert')
  })

  it('no ofrece contraer a solo iconos: eso es del computador', () => {
    pantalla()
    expect(menu().querySelector('[aria-label="Cerrar menú"]')).toBeInTheDocument()
  })
})

describe('novedades en Anomalías', () => {
  it('fuera de la bandeja, el menú muestra cuántos casos justificaron las personas desde tu última visita', async () => {
    window.localStorage.setItem('bandeja-visita:u1', '2026-10-20T10:00:00.000Z')
    nuevas = 3
    pantalla(undefined, '/admin/reportes')
    expect(await screen.findByTestId('globo-novedades')).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /Anomalías.*3 nuevas/ })).toBeInTheDocument()
  })

  it('sin novedades no hay globo', async () => {
    window.localStorage.setItem('bandeja-visita:u1', '2026-10-20T10:00:00.000Z')
    pantalla(undefined, '/admin/reportes')
    await screen.findByText('Reportes aquí')
    expect(screen.queryByTestId('globo-novedades')).toBeNull()
  })

  it('dentro de la bandeja el menú no repite el aviso (ahí se marcan las tarjetas)', async () => {
    window.localStorage.setItem('bandeja-visita:u1', '2026-10-20T10:00:00.000Z')
    nuevas = 3
    pantalla()
    await screen.findByText('Bandeja')
    await waitFor(() => expect(supabase.from).toHaveBeenCalled())
    expect(screen.queryByTestId('globo-novedades')).toBeNull()
  })

  it('con el menú cerrado se ve un puntito y el nombre accesible lo dice', async () => {
    window.localStorage.setItem('bandeja-visita:u1', '2026-10-20T10:00:00.000Z')
    window.localStorage.setItem('menu-lateral-abierto', 'no')
    nuevas = 1
    pantalla(undefined, '/admin/reportes')
    expect(await screen.findByTestId('punto-novedades')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anomalías, 1 nueva' })).toBeInTheDocument()
  })

  it('la primera vez no hay nada guardado: se empieza a contar desde ahora', async () => {
    pantalla(undefined, '/admin/reportes')
    await screen.findByText('Reportes aquí')
    expect(leerVisita('u1')).not.toBeNull()
    expect(Date.now() - Date.parse(leerVisita('u1')!)).toBeLessThan(10_000)
  })

  it('al salir de la bandeja, lo que había queda como visto', async () => {
    window.localStorage.setItem('bandeja-visita:u1', '2026-10-20T10:00:00.000Z')
    nuevas = 2
    pantalla()
    await screen.findByText('Bandeja')
    expect(leerVisita('u1')).toBe('2026-10-20T10:00:00.000Z')   // dentro de la bandeja todavía no se da por visto
    nuevas = 0   // desde ahora ya no hay nada nuevo
    await userEvent.click(screen.getByRole('link', { name: 'Reportes' }))
    await screen.findByText('Reportes aquí')
    await waitFor(() => expect(leerVisita('u1')).not.toBe('2026-10-20T10:00:00.000Z'))
    expect(screen.queryByTestId('globo-novedades')).toBeNull()
  })
})
