import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CamposHorario, type ValorHorario } from './CamposHorario'

function Prueba({ inicial, alCambiar }: { inicial: ValorHorario; alCambiar?: (v: ValorHorario) => void }) {
  const [v, setV] = useState(inicial)
  return <CamposHorario valor={v} onCambio={(n) => { setV(n); alCambiar?.(n) }} />
}
const BASE = { inicio: '08:00', fin: '17:00', dias: [1, 2, 3, 4, 5] }

describe('CamposHorario', () => {
  it('marca los días elegidos y deja sin marcar el fin de semana', () => {
    render(<Prueba inicial={BASE} />)
    for (const d of ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes']) expect(screen.getByRole('checkbox', { name: d })).toBeChecked()
    for (const d of ['Sábado', 'Domingo']) expect(screen.getByRole('checkbox', { name: d })).not.toBeChecked()
  })

  it('al tocar un día lo agrega y lo quita, siempre en orden', async () => {
    const alCambiar = vi.fn()
    render(<Prueba inicial={BASE} alCambiar={alCambiar} />)
    const u = userEvent.setup()
    await u.click(screen.getByRole('checkbox', { name: 'Sábado' }))
    expect(alCambiar).toHaveBeenLastCalledWith({ ...BASE, dias: [1, 2, 3, 4, 5, 6] })
    await u.click(screen.getByRole('checkbox', { name: 'Lunes' }))
    expect(alCambiar).toHaveBeenLastCalledWith({ ...BASE, dias: [2, 3, 4, 5, 6] })
    await u.click(screen.getByRole('checkbox', { name: 'Domingo' }))
    expect(alCambiar).toHaveBeenLastCalledWith({ ...BASE, dias: [2, 3, 4, 5, 6, 7] })
  })

  it('muestra la jornada', () => {
    render(<Prueba inicial={BASE} />)
    expect(screen.getByLabelText('Hora de entrada')).toHaveValue('08:00')
    expect(screen.getByLabelText('Hora de salida')).toHaveValue('17:00')
  })
})
