import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mensajeDeError } from '../lib/errores'
import RecuperarContrasena from './RecuperarContrasena'
import { renderConAuth } from '../test/helpers'

const reset = vi.fn()
vi.mock('../lib/supabase', () => ({ supabase: { auth: { resetPasswordForEmail: (...a: unknown[]) => reset(...a) } } }))

async function enviarCorreo() {
  renderConAuth(<RecuperarContrasena />)
  const u = userEvent.setup()
  await u.type(screen.getByLabelText('Correo institucional'), 'Ana@Unemi.edu.ec')
  await u.click(screen.getByRole('button', { name: 'Enviar enlace' }))
}

describe('RecuperarContrasena', () => {
  beforeEach(() => reset.mockReset())

  it('si Supabase acepta, muestra el aviso neutro y envía el correo en minúsculas', async () => {
    reset.mockResolvedValue({ error: null })
    await enviarCorreo()
    expect(await screen.findByText(/recibirás un enlace/i)).toBeInTheDocument()
    expect(reset.mock.calls[0]![0]).toBe('ana@unemi.edu.ec')
  })

  it('si Supabase rechaza por límite de correos, lo dice (no finge que se envió)', async () => {
    reset.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' } })
    await enviarCorreo()
    expect(await screen.findByText(/límite de correos/i)).toBeInTheDocument()
    expect(screen.queryByText(/recibirás un enlace/i)).not.toBeInTheDocument()
  })

  it('con otro error muestra un mensaje general', () => {
    expect(mensajeDeError({ status: 500, message: 'boom' })).toMatch(/No se pudo enviar/)
  })
})
