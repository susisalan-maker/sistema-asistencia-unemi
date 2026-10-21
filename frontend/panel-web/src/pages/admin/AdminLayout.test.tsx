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
