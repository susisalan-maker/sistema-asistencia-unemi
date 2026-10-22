import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { perfilDe, renderConAuth } from '../../test/helpers'
import { api } from '../../lib/api'
import Perfil from './Perfil'
import UsuarioLayout from './UsuarioLayout'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const anomalia = (id: string, puede = true) => ({ id, caso: `A-${id}`, tipo: 'sin_ingreso', estado: puede ? 'pendiente' : 'justificada', detalle: null, creada: '2026-10-20T13:00:00+00:00', vence: '2026-10-25T13:00:00+00:00', puede_justificar: puede })
function servidor(anomalias: unknown[] = []) {
  vi.mocked(api).mockImplementation((async (ruta: string) => {
    if (ruta === '/anomalias') return anomalias
    if (ruta.startsWith('/marcaciones/hoy')) return { fecha: '2026-10-21', marcaciones: [], siguiente: 'ingreso', ultima: null, jornada: null, dispositivo: 'sin_vincular', rostro_registrado: true, rostro_requerido: true }
    throw new Error(`ruta inesperada ${ruta}`)
  }) as never)
}
beforeEach(() => servidor())

const pantalla = (cerrarSesion = async () => {}, ruta = '/usuario') => renderConAuth(
  <Routes>
    <Route path="/usuario" element={<UsuarioLayout />}>
      <Route index element={<p>Contenido de inicio</p>} />
      <Route path="historial" element={<h1>Historial</h1>} />
      <Route path="avisos" element={<h1>Avisos</h1>} />
      <Route path="perfil" element={<Perfil />} />
    </Route>
  </Routes>,
  { perfil: perfilDe('usuario') as never, cerrarSesion }, ruta,
)

describe('UsuarioLayout', () => {
  it('ofrece Inicio, Historial, Avisos y Perfil (menú lateral, pestañas y barra inferior comparten las mismas entradas)', () => {
    pantalla()
    for (const texto of ['Inicio', 'Historial', 'Avisos', 'Perfil']) {
      expect(screen.getAllByRole('link', { name: texto }).length).toBeGreaterThanOrEqual(1)
    }
    expect(screen.getByText('Contenido de inicio')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Inicio' })[0]).toHaveAttribute('aria-current', 'page')
  })

  it('Perfil permite cerrar sesión', async () => {
    const salir = vi.fn(async () => {})
    pantalla(salir, '/usuario/historial')
    expect(screen.getByRole('heading', { name: 'Historial' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('link', { name: 'Perfil' })[0]!)
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(salir).toHaveBeenCalled()
  })

  it('«Avisos» muestra cuántas anomalías puede explicar la persona (solo las que siguen abiertas)', async () => {
    servidor([anomalia('1'), anomalia('2'), anomalia('3', false)])
    pantalla()
    expect((await screen.findAllByRole('link', { name: 'Avisos, 2 por explicar' })).length).toBeGreaterThanOrEqual(1)
  })

  it('sin anomalías por explicar «Avisos» no lleva número', async () => {
    servidor([anomalia('3', false)])
    pantalla()
    await waitFor(() => expect(api).toHaveBeenCalledWith('/anomalias'))
    expect(screen.getAllByRole('link', { name: 'Avisos' }).length).toBeGreaterThanOrEqual(1)
  })

  it('el avatar abre un menú con el nombre y «Cerrar sesión», y se cierra con Escape o al elegir', async () => {
    const salir = vi.fn(async () => {})
    pantalla(salir)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }))
    expect(screen.getByRole('button', { name: 'Menú de usuario' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('menu')).toHaveTextContent('Ana María Pérez Loor')
    expect(screen.getAllByRole('menuitem')).toHaveLength(1)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }))
    expect(salir).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('un clic afuera cierra el menú', async () => {
    pantalla()
    await userEvent.click(screen.getByRole('button', { name: 'Menú de usuario' }))
    await userEvent.click(screen.getByText('Contenido de inicio'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
