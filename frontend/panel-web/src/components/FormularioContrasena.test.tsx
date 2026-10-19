import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FormularioContrasena from './FormularioContrasena'

async function llenar(a: string, b: string) {
  const u = userEvent.setup()
  await u.type(screen.getByLabelText('Nueva contraseña'), a)
  await u.type(screen.getByLabelText('Confirmar contraseña'), b)
  await u.click(screen.getByRole('button', { name: 'Guardar' }))
}

describe('FormularioContrasena', () => {
  it('no llama a onGuardar si la contraseña es débil o no coincide', async () => {
    const onGuardar = vi.fn()
    render(<FormularioContrasena textoBoton="Guardar" onGuardar={onGuardar} />)
    await llenar('abc', 'abc')
    expect(screen.getByRole('alert')).toHaveTextContent('8 caracteres')
    expect(onGuardar).not.toHaveBeenCalled()
  })
  it('llama a onGuardar con la contraseña válida', async () => {
    const onGuardar = vi.fn().mockResolvedValue(null)
    render(<FormularioContrasena textoBoton="Guardar" onGuardar={onGuardar} />)
    await llenar('Clave2026x', 'Clave2026x')
    expect(onGuardar).toHaveBeenCalledWith('Clave2026x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
  it('muestra el error que devuelve onGuardar', async () => {
    render(<FormularioContrasena textoBoton="Guardar" onGuardar={async () => 'No se pudo guardar'} />)
    await llenar('Clave2026x', 'Clave2026x')
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo guardar')
  })
})
