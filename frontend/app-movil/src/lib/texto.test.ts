import { iniciales, nombreCompleto } from './texto'

describe('texto', () => {
  it('iniciales: primer nombre + primer apellido', () => {
    expect(iniciales('Susana Leonela', 'Salán Calderón')).toBe('SS')
  })
  it('iniciales sin apellidos usa las dos primeras palabras', () => {
    expect(iniciales('Ana María')).toBe('AM')
  })
  it('nombreCompleto une nombres y apellidos', () => {
    expect(nombreCompleto({ nombres: 'Ana María', apellidos: 'Pérez Loor' })).toBe('Ana María Pérez Loor')
  })
})
