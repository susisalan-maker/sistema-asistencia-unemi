import { nuevoId } from './motivo'

describe('nuevoId', () => {
  it('es un UUID v4 distinto cada vez, también sin randomUUID (conexiones no seguras)', () => {
    const forma = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    expect(nuevoId()).toMatch(forma)
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      const a = nuevoId()
      expect(a).toMatch(forma)
      expect(nuevoId()).not.toBe(a)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
