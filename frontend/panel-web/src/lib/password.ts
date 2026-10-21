/** Regla acordada: mínimo 8 caracteres, con letras y números. */
export function validarContrasena(valor: string, confirmacion: string): string | null {
  if (valor.length < 8) return 'La contraseña debe tener al menos 8 caracteres'
  if (!/[A-Za-z]/.test(valor) || !/\d/.test(valor)) return 'Debe incluir letras y números'
  if (valor !== confirmacion) return 'Las contraseñas no coinciden'
  return null
}
