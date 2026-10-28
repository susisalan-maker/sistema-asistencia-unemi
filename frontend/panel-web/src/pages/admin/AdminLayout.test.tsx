import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { perfilDe, renderConAuth } from '../../test/helpers'
import AdminLayout from './AdminLayout'

const pantalla = (cerrarSesion = async () => {}) =>
  renderConAuth(
    <Routes><Route path="/admin" element={<AdminLayout />}><Route path="anomalias" element={<p>Bandeja</p>} /></Route></Routes>,
    { perfil: perfilDe('administrador') as never, cerrarSesion }, '/admin/anomalias',
  )

beforeEach(() => window.localStorage.clear())

describe('AdminLayout · menú lateral', () => {
  it('abierto muestra los textos junto a los iconos y la entrada actual queda marcada', () => {
    pantalla()
    expect(screen.getByRole('button', { name: 'Contraer menú' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Sedes y bloques')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Anomalías' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('Cerrar sesión')).toBeInTheDocument()
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
