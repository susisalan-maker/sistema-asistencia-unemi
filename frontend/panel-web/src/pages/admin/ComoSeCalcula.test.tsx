import { render, screen } from '@testing-library/react'
import { ComoSeCalcula } from './ComoSeCalcula'

describe('ComoSeCalcula', () => {
  it('explica cada indicador, con las metas de referencia', () => {
    render(<ComoSeCalcula />)
    const region = screen.getByRole('region', { name: 'Cómo se calcula' })
    for (const t of ['Puntualidad', 'Justificadas a tiempo', 'Tiempo medio de resolución', 'Rechazo facial', 'Flechas ▲ ▼', 'Qué hace la IA']) {
      expect(region.querySelector('summary')?.textContent).toBeTruthy()
      expect(screen.getByText(t, { selector: 'summary' })).toBeInTheDocument()
    }
    expect(region.textContent).toContain('Meta de referencia: 95 %')
    expect(region.textContent).toContain('Meta de referencia: 90 %')
  })

  it('deja claro que la IA nunca decide un caso', () => {
    render(<ComoSeCalcula />)
    expect(screen.getByText(/Nunca decide un caso: lo decide una persona/)).toBeInTheDocument()
  })

  it('solo la primera explicación viene abierta', () => {
    render(<ComoSeCalcula />)
    const abiertos = Array.from(document.querySelectorAll('details')).filter((d) => d.open)
    expect(abiertos).toHaveLength(1)
    expect(abiertos[0]!.textContent).toContain('Puntualidad')
  })
})
