import { screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { render } from '@testing-library/react'
import * as novedades from './novedadesBandeja'
import { TarjetaJustificadasHoy } from './TarjetaJustificadasHoy'

vi.mock('./novedadesBandeja', () => ({ contarJustificadasHoy: vi.fn() }))

const mostrar = () => render(<MemoryRouter><TarjetaJustificadasHoy /></MemoryRouter>)

describe('TarjetaJustificadasHoy', () => {
  it('dice cuántas justificaron hoy y cuántas esperan tu decisión, y lleva a esos casos', async () => {
    vi.mocked(novedades.contarJustificadasHoy).mockResolvedValue({ total: 5, porResolver: 3 })
    mostrar()
    const enlace = await screen.findByRole('link', { name: /Justificadas hoy: 5/ })
    expect(enlace).toHaveAttribute('href', '/admin/anomalias?estado=todas&justificada=hoy')
    expect(screen.getByText('3 esperan tu decisión · 2 ya resueltas')).toBeInTheDocument()
  })

  it('en singular y con todo resuelto', async () => {
    vi.mocked(novedades.contarJustificadasHoy).mockResolvedValue({ total: 1, porResolver: 1 })
    mostrar()
    expect(await screen.findByText('1 espera tu decisión')).toBeInTheDocument()
  })

  it('si todas están resueltas lo dice', async () => {
    vi.mocked(novedades.contarJustificadasHoy).mockResolvedValue({ total: 2, porResolver: 0 })
    mostrar()
    expect(await screen.findByText('Todas están resueltas')).toBeInTheDocument()
  })

  it('sin nadie que haya justificado, lo dice sin alarmar', async () => {
    vi.mocked(novedades.contarJustificadasHoy).mockResolvedValue({ total: 0, porResolver: 0 })
    mostrar()
    expect(await screen.findByText('Nadie ha justificado todavía hoy')).toBeInTheDocument()
  })

  it('si no se puede contar, no se dibuja', async () => {
    vi.mocked(novedades.contarJustificadasHoy).mockRejectedValue(new Error('x'))
    const { container } = mostrar()
    await waitFor(() => expect(novedades.contarJustificadasHoy).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
