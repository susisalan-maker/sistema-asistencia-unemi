import { validarContrasena } from './password'

describe('validarContrasena', () => {
  it('acepta 8+ caracteres con letras y números', () => {
    expect(validarContrasena('Clave2026x', 'Clave2026x')).toBeNull()
  })
  it('rechaza menos de 8 caracteres', () => {
    expect(validarContrasena('Ab1', 'Ab1')).toMatch(/8 caracteres/)
  })
  it('exige letras y números', () => {
    expect(validarContrasena('soloLetrasAqui', 'soloLetrasAqui')).toMatch(/letras y números/)
    expect(validarContrasena('12345678', '12345678')).toMatch(/letras y números/)
  })
  it('exige que coincidan', () => {
    expect(validarContrasena('Clave2026x', 'Clave2026y')).toMatch(/no coinciden/)
  })
})
