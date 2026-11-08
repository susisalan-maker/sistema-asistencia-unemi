import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { PanelLateral } from './PanelLateral'

function Caja({ cerrado = false }: { cerrado?: boolean }) {
  const [abierto, setAbierto] = useState(!cerrado)
  return (
    <div>
      <button type="button" onClick={() => setAbierto(true)}>Abrir</button>
      <PanelLateral titulo="Mi panel" abierto={abierto} alCerrar={() => setAbierto(false)}>
        <input aria-label="Buscar" />
      </PanelLateral>
    </div>
  )
}

describe('PanelLateral', () => {
  it('cerrado no se ve ni se puede leer, pero sigue montado', () => {
    render(<Caja cerrado />)
    expect(screen.queryByRole('dialog', { name: 'Mi panel' })).not.toBeInTheDocument()
    expect(document.querySelector('input[aria-label="Buscar"]')).not.toBeNull()
  })

  it('abierto es un diálogo con su título y el foco en «Cerrar»', () => {
    render(<Caja />)
    expect(screen.getByRole('dialog', { name: 'Mi panel' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mi panel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cerrar Mi panel' })).toHaveFocus()
  })

  it('se cierra con su botón', async () => {
    render(<Caja />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar Mi panel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('se cierra con Escape', async () => {
    render(<Caja />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('se cierra tocando fuera, sobre el fondo', async () => {
    render(<Caja />)
    await userEvent.click(document.querySelector('[aria-hidden="true"]') as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('lo escrito dentro se conserva al cerrarlo y volver a abrirlo', async () => {
    render(<Caja />)
    await userEvent.type(screen.getByLabelText('Buscar'), 'ana')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    expect(screen.getByLabelText('Buscar')).toHaveValue('ana')
  })

  it('cerrado, Escape no hace nada', async () => {
    render(<Caja cerrado />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
