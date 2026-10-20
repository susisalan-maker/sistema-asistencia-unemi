import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TarjetaAnomalia } from './TarjetaAnomalia'
import type { FilaAnomalia } from './anomaliasTipos'

const fila: FilaAnomalia = {
  id: 'abc', numero: 7, tipo: 'fuera_horario', estado: 'en_revision', detalle: 'Ingreso a las 10:35',
  created_at: '2026-10-20T15:35:00Z',
  usuarios: { nombres: 'Byron Joel', apellidos: 'Yaguar Ríos', email: 'byaguarr@unemi.edu.ec' },
  justificaciones: { clasificacion_ia: 'sospechosa' },
}

const dibujar = (f: FilaAnomalia = fila) => render(<MemoryRouter><TarjetaAnomalia fila={f} /></MemoryRouter>)

describe('TarjetaAnomalia', () => {
  it('muestra caso, título, persona y enlaza al detalle', () => {
    dibujar()
    expect(screen.getByText('#A-7')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Fuera de horario' })).toBeInTheDocument()
    expect(screen.getByText('byaguarr@unemi.edu.ec')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar el caso A-7' })).toHaveAttribute('href', '/admin/anomalias/abc')
  })

  it('lleva la barra naranja solo junto al título y el efecto de elevación al pasar el cursor', () => {
    const { container } = dibujar()
    const barras = container.querySelectorAll('.bg-ambar')
    expect(barras).toHaveLength(1)
    expect(barras[0].nextElementSibling?.tagName).toBe('H2')
    expect(container.querySelector('article')?.className).toContain('hover:-translate-y-0.5')
  })

  it('sin detalle ni persona no se rompe', () => {
    dibujar({ ...fila, detalle: null, usuarios: null, justificaciones: null })
    expect(screen.getByText('Sin detalle')).toBeInTheDocument()
  })
})
