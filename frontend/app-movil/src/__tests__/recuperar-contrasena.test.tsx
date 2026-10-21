import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import RecuperarContrasena from '../app/recuperar-contrasena'

const mockEnviarCorreo = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }))
jest.mock('../lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: (...a: unknown[]) => mockEnviarCorreo(...a) } },
  URL_PANEL_WEB: 'https://panel.test',
}))

async function enviar() {
  await render(<RecuperarContrasena />)
  await fireEvent.changeText(screen.getByLabelText('Correo institucional'), 'Ana@Unemi.edu.ec')
  await fireEvent.press(screen.getByLabelText('Enviar enlace'))
}

describe('Recuperar contraseña (app móvil)', () => {
  beforeEach(() => mockEnviarCorreo.mockReset())

  it('envía el correo en minúsculas con el enlace al panel web', async () => {
    mockEnviarCorreo.mockResolvedValue({ error: null })
    await enviar()
    await waitFor(() => expect(screen.getByText(/recibirás un enlace/i)).toBeTruthy())
    expect(mockEnviarCorreo).toHaveBeenCalledWith('ana@unemi.edu.ec', { redirectTo: 'https://panel.test/restablecer-contrasena' })
  })

  it('si Supabase rechaza por límite de correos, lo dice', async () => {
    mockEnviarCorreo.mockResolvedValue({ error: { status: 429, code: 'over_email_send_rate_limit' } })
    await enviar()
    await waitFor(() => expect(screen.getByText(/límite de correos/i)).toBeTruthy())
    expect(screen.queryByText(/recibirás un enlace/i)).toBeNull()
  })
})
