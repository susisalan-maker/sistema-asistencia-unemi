import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { calcularIndicadores, leerAgregado } from './reportesDatos'
import { SedeContraSede } from './SedeContraSede'
import type { FilaSede } from './sedesComparar'

const ind = (actual: object, antes: object | null) => calcularIndicadores(leerAgregado(actual), antes ? leerAgregado(antes) : null)
const FILAS: FilaSede[] = [
  { sede_id: 's1', sede: 'Matriz', ind: ind({ total: 20 }, { total: 25 }) },
  { sede_id: 's2', sede: 'Campus Norte', ind: ind({ total: 8 }, { total: 4 }) },
  { sede_id: 's3', sede: 'Sin datos', ind: ind({ total: 0 }, null) },
]

describe('SedeContraSede', () => {
  it('una fila por sede, con la flecha de cuánto cambió y su lectura para quien no ve colores', () => {
    render(<SedeContraSede filas={FILAS} error={false} onReintentar={() => {}} />)
    const region = screen.getByRole('region', { name: 'Sede contra sede' })
    const [matriz, norte, sin] = Array.from(region.querySelectorAll('.tabla-fila')) as HTMLElement[]
    expect(within(matriz!).getByText('Matriz')).toBeInTheDocument()
    expect(within(matriz!).getByText('▼ 20 %')).toBeInTheDocument()       // bajaron: mejora
    expect(within(matriz!).getByText(/bajó 20 % frente al periodo anterior/)).toBeInTheDocument()
    expect(within(norte!).getByText('▲ 100 %')).toBeInTheDocument()       // subieron: empeora
    expect(within(sin!).getByText('—', { selector: '[aria-hidden="true"]' })).toBeInTheDocument()
  })

  it('«subió» en anomalías es rojo y «bajó» es verde: el color nunca va sin la flecha', () => {
    render(<SedeContraSede filas={FILAS} error={false} onReintentar={() => {}} />)
    expect(screen.getByText('▼ 20 %').parentElement).toHaveClass('text-ok')
    expect(screen.getByText('▲ 100 %').parentElement).toHaveClass('text-error')
  })

  it('mientras carga muestra un esqueleto y no la tabla', () => {
    render(<SedeContraSede filas={null} error={false} onReintentar={() => {}} />)
    expect(document.querySelector('.tabla-fila')).toBeNull()
    expect(screen.queryByText(/No se pudo cargar/)).not.toBeInTheDocument()
  })

  it('si falla, lo dice y deja reintentar', async () => {
    const reintentar = vi.fn()
    render(<SedeContraSede filas={null} error onReintentar={reintentar} />)
    expect(screen.getByText(/No se pudo cargar el comparativo/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(reintentar).toHaveBeenCalledTimes(1)
  })
})
