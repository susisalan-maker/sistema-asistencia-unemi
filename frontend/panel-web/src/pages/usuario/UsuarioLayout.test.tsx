import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { INACTIVIDAD_MS } from '../../lib/inactividad'
import { cerrarPor } from '../../lib/sesion'
import { perfilDe, renderConAuth } from '../../test/helpers'
import UsuarioLayout from './UsuarioLayout'

vi.mock('../../lib/sesion', async (original) => ({ ...(await original<typeof import('../../lib/sesion')>()), cerrarPor: vi.fn(async () => {}) }))

const pantalla = (cerrarSesion = async () => {}) => renderConAuth(
  <Routes>
    <Route path="/usuario" element={<UsuarioLayout />}>
      <Route index element={<p>Contenido de inicio</p>} />
    </Route>
  </Routes>,
  { perfil: perfilDe('usuario') as never, cerrarSesion }, '/usuario',
)

beforeEach(() => { vi.mocked(cerrarPor).mockClear() })

describe('UsuarioLayout (web reducida de contingencia)', () => {
  it('no tiene menú de secciones: solo el contenido, el nombre de la persona y el círculo de su cuenta', () => {
    pantalla()
    expect(screen.getByText('Contenido de inicio')).toBeInTheDocument()
    expect(screen.getByText('Ana María Pérez Loor')).toBeInTheDocument()
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('«Cerrar sesión» está dentro del menú del círculo de iniciales y cierra la sesión', async () => {
    const salir = vi.fn(async () => {})
    pantalla(salir)
    expect(screen.getByRole('button', { name: 'Menú de la cuenta' })).toHaveTextContent('AP')
    expect(screen.queryByRole('menuitem', { name: 'Cerrar sesión' })).not.toBeInTheDocument()   // cerrado de entrada
    await userEvent.click(screen.getByRole('button', { name: 'Menú de la cuenta' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(salir).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('el menú se cierra con Escape o al tocar fuera, sin cerrar la sesión', async () => {
    const salir = vi.fn(async () => {})
    pantalla(salir)
    const circulo = screen.getByRole('button', { name: 'Menú de la cuenta' })
    await userEvent.click(circulo)
    expect(circulo).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(circulo)
    await userEvent.click(screen.getByText('Contenido de inicio'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(salir).not.toHaveBeenCalled()
  })

  describe('por inactividad', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    it('cierra la sesión tras diez minutos sin actividad', () => {
      pantalla()
      act(() => { vi.advanceTimersByTime(INACTIVIDAD_MS - 1000) })
      expect(cerrarPor).not.toHaveBeenCalled()
      act(() => { vi.advanceTimersByTime(2000) })
      expect(cerrarPor).toHaveBeenCalledWith('inactividad')
    })

    it('si la persona sigue usando la pantalla no se cierra', () => {
      pantalla()
      act(() => { vi.advanceTimersByTime(INACTIVIDAD_MS - 1000) })
      act(() => { window.dispatchEvent(new Event('pointerdown')) })
      act(() => { vi.advanceTimersByTime(INACTIVIDAD_MS - 1000) })
      expect(cerrarPor).not.toHaveBeenCalled()
    })
  })
})
