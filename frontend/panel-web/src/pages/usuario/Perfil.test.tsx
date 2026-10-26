import { screen } from '@testing-library/react'
import { api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Perfil from './Perfil'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const hoy = (extra: object) => ({ fecha: '2026-10-21', marcaciones: [], siguiente: 'ingreso', ultima: null, jornada: null, dispositivo: 'sin_vincular', rostro_registrado: false, rostro_requerido: true, ...extra })

describe('Perfil', () => {
  it('muestra la cuenta, el estado del rostro y del celular, sin botón de cerrar sesión', async () => {
    vi.mocked(api).mockResolvedValue(hoy({}) as never)
    renderConAuth(<Perfil />, { perfil: perfilDe('usuario') as never })
    expect(screen.getByText('Ana María Pérez Loor')).toBeInTheDocument()
    expect(screen.getByText('a@x.com')).toBeInTheDocument()
    expect(await screen.findByText('PENDIENTE')).toBeInTheDocument()
    expect(screen.getByText('SIN VINCULAR')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
  })

  it('con rostro y celular registrados lo indica', async () => {
    vi.mocked(api).mockResolvedValue(hoy({ rostro_registrado: true, dispositivo: 'otro' }) as never)
    renderConAuth(<Perfil />, { perfil: perfilDe('usuario') as never })
    expect(await screen.findByText('REGISTRADO')).toBeInTheDocument()
    expect(screen.getByText('VINCULADO')).toBeInTheDocument()
  })
})
