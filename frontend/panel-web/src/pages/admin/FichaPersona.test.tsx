import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import { buscarPersonas, casosDePersona } from './fichaDatos'
import { FichaPersona } from './FichaPersona'

vi.mock('./fichaDatos', async (original) => ({
  ...(await original<typeof import('./fichaDatos')>()), buscarPersonas: vi.fn(), casosDePersona: vi.fn(),
}))

const SEDES = [{ id: 's1', nombre: 'Matriz' }]
const ANA = { id: 'u1', nombre: 'Ana Pérez', sede_id: 's1' }
const CASOS = [
  { id: 'a2', numero: 2, caso: 'A-2', tipo: 'fuera_geocerca', estado: 'justificada', created_at: '2026-11-03T14:00:00Z' },
  { id: 'a1', numero: 1, caso: 'A-1', tipo: 'verificacion_fallida', estado: 'rechazada', created_at: '2026-10-20T14:00:00Z' },
]
const pantalla = () => render(<MemoryRouter><FichaPersona sedes={SEDES} /></MemoryRouter>)
const escribir = async (t: string) => { await userEvent.type(screen.getByLabelText('Buscar persona'), t); await act(async () => { await new Promise((r) => setTimeout(r, 400)) }) }

beforeEach(() => {
  vi.mocked(buscarPersonas).mockReset().mockResolvedValue([ANA])
  vi.mocked(casosDePersona).mockReset().mockResolvedValue(CASOS as never)
})

describe('FichaPersona', () => {
  it('no busca con menos de dos letras', async () => {
    pantalla()
    await escribir('a')
    expect(buscarPersonas).not.toHaveBeenCalled()
  })

  it('busca al dejar de escribir (una sola vez) y lista las coincidencias', async () => {
    pantalla()
    await escribir('ana')
    expect(buscarPersonas).toHaveBeenCalledTimes(1)
    expect(buscarPersonas).toHaveBeenCalledWith('ana')
    expect(within(await screen.findByRole('list', { name: 'Coincidencias' })).getByRole('button', { name: 'Ana Pérez' })).toBeInTheDocument()
  })

  it('al elegir a alguien muestra su sede, el resumen y sus casos, cada uno con enlace a su revisión', async () => {
    pantalla()
    await escribir('ana')
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    const casos = await screen.findByRole('list', { name: 'Casos de Ana Pérez' })
    expect(screen.getByText('Matriz')).toBeInTheDocument()
    expect(screen.getByText('2 casos')).toBeInTheDocument()
    expect(screen.getByText('1 justificado')).toBeInTheDocument()
    expect(screen.getByText('1 rechazado')).toBeInTheDocument()
    expect(within(casos).getByRole('link', { name: 'Marcación fuera de la zona' })).toHaveAttribute('href', '/admin/anomalias/a2')
    expect(casosDePersona).toHaveBeenCalledWith('u1')
  })

  it('si nadie coincide, lo dice', async () => {
    vi.mocked(buscarPersonas).mockResolvedValue([])
    pantalla()
    await escribir('zzz')
    expect(await screen.findByText('Nadie coincide con «zzz».')).toBeInTheDocument()
  })

  it('una persona sin casos lo dice', async () => {
    vi.mocked(casosDePersona).mockResolvedValue([])
    pantalla()
    await escribir('ana')
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    expect(await screen.findByText('No tiene casos en los últimos 90 días.')).toBeInTheDocument()
  })

  it('si la búsqueda o los casos fallan, lo dice sin romperse', async () => {
    vi.mocked(buscarPersonas).mockRejectedValueOnce(new Error('x'))
    pantalla()
    await escribir('ana')
    expect(await screen.findByText('No se pudo buscar. Intenta de nuevo.')).toBeInTheDocument()
    vi.mocked(buscarPersonas).mockResolvedValue([ANA])
    vi.mocked(casosDePersona).mockRejectedValue(new Error('x'))
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'a')
    await act(async () => { await new Promise((r) => setTimeout(r, 400)) })
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    expect(await screen.findByText('No se pudieron cargar sus casos.')).toBeInTheDocument()
  })

  it('al volver a escribir se descarta la persona elegida', async () => {
    pantalla()
    await escribir('ana')
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    await screen.findByRole('list', { name: 'Casos de Ana Pérez' })
    await userEvent.type(screen.getByLabelText('Buscar persona'), 'x')
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Casos de Ana Pérez' })).not.toBeInTheDocument())
  })
  it('con muchos casos muestra los 8 más recientes y se pueden ver todos (para no alargar la ficha)', async () => {
    const muchos = Array.from({ length: 20 }, (_, i) => ({ id: `a${i + 1}`, numero: i + 1, caso: `A-${i + 1}`, tipo: 'fuera_geocerca', estado: 'pendiente', created_at: '2026-11-03T14:00:00Z' }))
    vi.mocked(casosDePersona).mockResolvedValue(muchos as never)
    pantalla()
    await escribir('ana')
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    const lista = await screen.findByRole('list', { name: 'Casos de Ana Pérez' })
    expect(within(lista).getAllByRole('link')).toHaveLength(8)
    await userEvent.click(screen.getByRole('button', { name: 'Ver los 20 casos' }))
    expect(within(lista).getAllByRole('link')).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(within(lista).getAllByRole('link')).toHaveLength(8)
  })

  it('con 8 casos o menos no ofrece «Ver todos»', async () => {
    pantalla()
    await escribir('ana')
    await userEvent.click(await screen.findByRole('button', { name: 'Ana Pérez' }))
    await screen.findByRole('list', { name: 'Casos de Ana Pérez' })
    expect(screen.queryByRole('button', { name: /Ver los/ })).not.toBeInTheDocument()
  })
})
