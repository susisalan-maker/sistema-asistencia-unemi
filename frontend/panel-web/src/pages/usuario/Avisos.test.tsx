import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Avisos from './Avisos'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const abierta = { id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso el 14 de octubre.', creada: '2026-10-15T13:05:00+00:00', vence: new Date(Date.now() + 38 * 3_600_000 + 60_000).toISOString(), puede_justificar: true }
const cerrada = { id: 'a2', caso: 'A-9', tipo: 'fuera_geocerca', estado: 'justificada', detalle: null, creada: '2026-09-04T03:00:00+00:00', vence: '2026-09-06T03:00:00+00:00', puede_justificar: false }

const pantalla = () => renderConAuth(
  <Routes>
    <Route path="/usuario/avisos" element={<Avisos />} />
    <Route path="/usuario/avisos/:id" element={<p>Chat del caso</p>} />
  </Routes>,
  { perfil: perfilDe('usuario') as never }, '/usuario/avisos',
)

describe('Avisos', () => {
  it('separa lo que espera explicación de las anteriores y cuenta lo pendiente', async () => {
    vi.mocked(api).mockResolvedValue([abierta, cerrada] as never)
    pantalla()
    expect(await screen.findByText('1 anomalía requiere tu explicación')).toBeInTheDocument()
    expect(screen.getByText('Anomalía detectada')).toBeInTheDocument()
    expect(screen.getByText('Caso #A-12', { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/Te quedan 38 h para explicarlo/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Anteriores' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Caso #A-9, Marcaste fuera de la zona' })).toBeInTheDocument()
    expect(screen.getByText('Justificada')).toBeInTheDocument()
  })

  it('«Explicar» abre la conversación de ese caso', async () => {
    vi.mocked(api).mockResolvedValue([abierta] as never)
    pantalla()
    await userEvent.click(await screen.findByRole('link', { name: 'Explicar' }))
    expect(screen.getByText('Chat del caso')).toBeInTheDocument()
  })

  it('sin avisos lo dice', async () => {
    vi.mocked(api).mockResolvedValue([] as never)
    pantalla()
    expect(await screen.findByText('No tienes avisos. ¡Todo en orden!')).toBeInTheDocument()
    expect(screen.getByText('No tienes anomalías por explicar')).toBeInTheDocument()
  })

  it('si falla la carga muestra el error y permite reintentar', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(502, 'Servicio no disponible')).mockResolvedValueOnce([] as never)
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No tienes avisos. ¡Todo en orden!')).toBeInTheDocument()
  })
})
