import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Avisos from './Avisos'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const en = (horas: number) => new Date(Date.now() + horas * 3_600_000 + 60_000).toISOString()
const abierta = { id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso el 14 de octubre.', creada: '2026-10-15T13:05:00+00:00', vence: en(38), puede_justificar: true }
const cerrada = { id: 'a2', caso: 'A-9', tipo: 'fuera_geocerca', estado: 'justificada', detalle: null, creada: '2026-09-04T03:00:00+00:00', vence: '2026-09-06T03:00:00+00:00', puede_justificar: false }
const anterior = (n: number, estado = 'en_revision', dia = 10) => ({
  id: `h${n}`, caso: `A-${100 + n}`, tipo: 'fuera_horario', estado, detalle: null,
  creada: `2026-09-${String(dia).padStart(2, '0')}T13:00:00+00:00`, vence: '2026-09-30T00:00:00+00:00', puede_justificar: false,
})

const pantalla = () => renderConAuth(
  <Routes>
    <Route path="/usuario/avisos" element={<Avisos />} />
    <Route path="/usuario/avisos/:id" element={<p>Chat del caso</p>} />
  </Routes>,
  { perfil: perfilDe('usuario') as never }, '/usuario/avisos',
)

describe('Avisos', () => {
  it('abre en «Por explicar» con una fila compacta por anomalía y cuenta cada grupo', async () => {
    vi.mocked(api).mockResolvedValue([abierta, cerrada] as never)
    pantalla()
    expect(await screen.findByText('1 anomalía requiere tu explicación')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Por explicar/, selected: true })).toHaveTextContent('1')
    expect(screen.getByRole('tab', { name: /Anteriores/, selected: false })).toHaveTextContent('1')
    expect(screen.getByText('No marcaste ese día')).toBeInTheDocument()
    expect(screen.getByText(/No registraste tu ingreso el 14 de octubre/)).toBeInTheDocument()
    expect(screen.getByText(/Caso #A-12/)).toBeInTheDocument()
    expect(screen.getByText(/Te quedan 38 h para explicarlo/)).toBeInTheDocument()
    expect(screen.queryByText('Marcaste fuera de la zona')).not.toBeInTheDocument()   // las anteriores están en la otra pestaña
  })

  it('«Explicar» abre la conversación de ese caso', async () => {
    vi.mocked(api).mockResolvedValue([abierta] as never)
    pantalla()
    await userEvent.click(await screen.findByRole('link', { name: 'Explicar' }))
    expect(screen.getByText('Chat del caso')).toBeInTheDocument()
  })

  it('las pendientes van de la más urgente a la menos urgente y la urgente se avisa', async () => {
    const lejana = { ...abierta, id: 'lejos', caso: 'A-1', vence: en(40) }
    const cercana = { ...abierta, id: 'cerca', caso: 'A-2', vence: en(3) }
    vi.mocked(api).mockResolvedValue([lejana, cercana] as never)
    pantalla()
    await screen.findByText('2 anomalías requieren tu explicación')
    const filas = screen.getAllByRole('article')
    expect(within(filas[0]!).getByText(/Caso #A-2/)).toBeInTheDocument()
    expect(within(filas[0]!).getByText(/Te quedan 3 h/)).toHaveClass('text-error')
    expect(within(filas[1]!).getByText(/Caso #A-1/)).toBeInTheDocument()
  })

  it('sin pendientes abre directamente en «Anteriores»', async () => {
    vi.mocked(api).mockResolvedValue([cerrada] as never)
    pantalla()
    expect(await screen.findByRole('link', { name: 'Caso #A-9, Marcaste fuera de la zona' })).toBeInTheDocument()
    expect(screen.getByText('Justificada')).toBeInTheDocument()
    expect(screen.getByText('No tienes anomalías por explicar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /Por explicar/ }))
    expect(screen.getByText('No tienes anomalías por explicar. ¡Todo en orden!')).toBeInTheDocument()
  })

  it('«Anteriores» se filtra por estado y muestra de a 8 con «Cargar más»', async () => {
    const muchas = [
      ...Array.from({ length: 10 }, (_, i) => anterior(i + 1, 'en_revision', 10 + i)),
      ...Array.from({ length: 3 }, (_, i) => anterior(20 + i, 'justificada', 1 + i)),
    ]
    vi.mocked(api).mockResolvedValue(muchas as never)
    pantalla()
    // Sin pendientes abre en «Anteriores»: 8 de 13, de la más reciente a la más antigua.
    expect(await screen.findByText('Mostrando 8 de 13 avisos')).toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(8)
    expect(screen.getAllByRole('link')[0]).toHaveAccessibleName(/Caso #A-110/)
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(screen.getAllByRole('link')).toHaveLength(13)
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^Justificadas/ }))
    expect(screen.getAllByRole('link')).toHaveLength(3)
    expect(screen.getByRole('button', { name: /^Justificadas/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: /^Rechazadas/ })).not.toBeInTheDocument()   // sin avisos de ese estado no se ofrece
    await userEvent.click(screen.getByRole('button', { name: /^Todas/ }))
    expect(screen.getByText('Mostrando 8 de 13 avisos')).toBeInTheDocument()                // al cambiar de filtro vuelve a 8
  })

  it('sin avisos lo dice', async () => {
    vi.mocked(api).mockResolvedValue([] as never)
    pantalla()
    expect(await screen.findByText('No tienes avisos. ¡Todo en orden!')).toBeInTheDocument()
    expect(screen.getByText('No tienes anomalías por explicar')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('si falla la carga muestra el error y permite reintentar', async () => {
    vi.mocked(api).mockRejectedValueOnce(new ApiError(502, 'Servicio no disponible')).mockResolvedValueOnce([] as never)
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('No tienes avisos. ¡Todo en orden!')).toBeInTheDocument()
  })
})
