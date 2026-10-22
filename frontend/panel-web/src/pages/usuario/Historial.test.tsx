import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ApiError, api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Historial from './Historial'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const marca = (id: string, tipo: string, hora: string, extra: object = {}) =>
  ({ id, tipo, fecha_hora: `2026-10-20T${hora}:00+00:00`, sede_id: null, bloque_id: null, origen: 'app', verificacion: 'ok', lugar: 'Facultad de Ingeniería', anomalia: null, ...extra })
const DATOS = {
  dias: [{ fecha: '2026-10-20', marcaciones: [
    marca('a', 'ingreso', '12:56', { origen: 'web' }),
    marca('b', 'salida', '22:04', { anomalia: { tipo: 'fuera_horario', estado: 'en_revision' } }),
  ] }],
  total: 2,
}
const pantalla = () => renderConAuth(<Historial />, { perfil: perfilDe('usuario') as never })

describe('Historial', () => {
  it('lista las marcaciones por día con su lugar, su origen y su anomalía', async () => {
    vi.mocked(api).mockResolvedValue(DATOS as never)
    pantalla()
    expect(await screen.findByText('Ingreso 07:56')).toBeInTheDocument()
    expect(screen.getByText('Últimos 7 días · 2 marcaciones')).toBeInTheDocument()
    expect(screen.getAllByText('Facultad de Ingeniería')).toHaveLength(2)
    expect(screen.getByText('WEB')).toBeInTheDocument()
    expect(screen.getByText('Anomalía en revisión')).toBeInTheDocument()
    expect(api).toHaveBeenCalledWith('/marcaciones/historial?dias=7')
  })

  it('permite ver los últimos 30 días', async () => {
    vi.mocked(api).mockResolvedValue(DATOS as never)
    pantalla()
    await screen.findByText('Ingreso 07:56')
    await userEvent.click(screen.getByRole('button', { name: '30 días' }))
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
    expect(api).toHaveBeenCalledWith('/marcaciones/historial?dias=30')
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
