import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Historial from './Historial'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const marca = (id: string, tipo: string, hora: string, extra: object = {}, dia = '2026-10-20') =>
  ({ id, tipo, fecha_hora: `${dia}T${hora}:00+00:00`, sede_id: null, bloque_id: null, origen: 'app', verificacion: 'ok', lugar: 'Facultad de Ingeniería', anomalia: null, ...extra })
const DATOS = {
  dias: [
    { fecha: '2026-10-20', marcaciones: [
      marca('a', 'ingreso', '12:56', { origen: 'web' }),
      marca('b', 'salida', '22:04', { anomalia: { tipo: 'fuera_horario', estado: 'en_revision' } }),
    ] },
    { fecha: '2026-10-19', marcaciones: [marca('c', 'ingreso', '13:00', {}, '2026-10-19')] },
  ],
  total: 3,
}
const pantalla = () => renderConAuth(<Historial />, { perfil: perfilDe('usuario') as never })

describe('Historial', () => {
  it('muestra un resumen y una fila por día con sus marcaciones, el lugar, el origen y la anomalía', async () => {
    vi.mocked(api).mockResolvedValue(DATOS as never)
    pantalla()
    expect(await screen.findByText('07:56')).toBeInTheDocument()
    const resumen = screen.getByText('Marcaciones').closest('dl')!
    expect(within(resumen).getByText('Marcaciones').nextSibling).toHaveTextContent('3')
    expect(within(resumen).getByText('Con anomalía').nextSibling).toHaveTextContent('1')
    expect(within(resumen).getByText('Por la web').nextSibling).toHaveTextContent('1')
    const dia = screen.getByRole('region', { name: /20 oct/ })
    expect(within(dia).getByText('Salida')).toBeInTheDocument()
    expect(within(dia).getByText('17:04')).toBeInTheDocument()
    expect(within(dia).getAllByText('Facultad de Ingeniería')).toHaveLength(1)   // mismo lugar todo el día: se dice una vez
    expect(within(dia).getByText('WEB')).toBeInTheDocument()
    expect(within(dia).getByText('Anomalía en revisión')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /19 oct/ })).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/marcaciones/historial?dias=7')
  })

  it('«Solo con anomalías» deja los días que tienen alguna', async () => {
    vi.mocked(api).mockResolvedValue(DATOS as never)
    pantalla()
    await screen.findByText('07:56')
    await userEvent.click(screen.getByRole('switch', { name: 'Solo con anomalías' }))
    expect(screen.getByRole('switch', { name: 'Solo con anomalías' })).toBeChecked()
    expect(screen.getByRole('region', { name: /20 oct/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /19 oct/ })).not.toBeInTheDocument()
  })

  it('en 30 días muestra 10 días y el resto con «Cargar más»', async () => {
    const dias = Array.from({ length: 14 }, (_, i) => {
      const dia = `2026-10-${String(20 - i).padStart(2, '0')}`
      return { fecha: dia, marcaciones: [marca(`m${i}`, 'ingreso', '13:00', {}, dia)] }
    })
    vi.mocked(api).mockResolvedValue({ dias, total: 14 } as never)
    pantalla()
    await screen.findAllByRole('region')
    await userEvent.click(screen.getByRole('button', { name: '30 días' }))
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(api).toHaveBeenCalledWith('/marcaciones/historial?dias=30')
    expect(await screen.findByText('Mostrando 10 de 14 días')).toBeInTheDocument()
    expect(screen.getAllByRole('region')).toHaveLength(10)
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }))
    expect(screen.getAllByRole('region')).toHaveLength(14)
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument()
  })

  it('sin marcaciones lo dice', async () => {
    vi.mocked(api).mockResolvedValue({ dias: [], total: 0 } as never)
    pantalla()
    expect(await screen.findByText('Aún no tienes marcaciones en los últimos 7 días.')).toBeInTheDocument()
  })

  it('si falla muestra el error', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(502, 'No se pudo cargar tu historial: caído'))
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('caído')
  })
})
