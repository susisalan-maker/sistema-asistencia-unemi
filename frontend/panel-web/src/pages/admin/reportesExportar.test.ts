import { afterEach, describe, expect, it, vi } from 'vitest'
import { descargarBinario, fechaHoraCompleta } from './reportesExportar'

describe('fechaHoraCompleta', () => {
  it('usa la hora de Ecuador, aunque en UTC ya sea otro día', () => {
    expect(fechaHoraCompleta('2026-10-20T19:05:00Z')).toBe('2026-10-20 14:05')
    expect(fechaHoraCompleta('2026-10-21T03:30:00Z')).toBe('2026-10-20 22:30')
    expect(fechaHoraCompleta('2026-10-21T05:00:00Z')).toBe('2026-10-21 00:00')
  })
  it('sin fecha o con una fecha inválida, vacío', () => {
    expect(fechaHoraCompleta(null)).toBe('')
    expect(fechaHoraCompleta('ayer')).toBe('')
  })
})

describe('descargarBinario', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('crea un enlace temporal, lo pulsa con el nombre pedido y lo quita', () => {
    vi.useFakeTimers()
    const crear = vi.fn(() => 'blob:falso')
    const soltar = vi.fn()
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: soltar })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('r.xlsx')
      expect(this.href).toBe('blob:falso')
    })
    descargarBinario('r.xlsx', new Uint8Array([1, 2, 3]), 'application/octet-stream')
    expect(clic).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(soltar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(soltar).toHaveBeenCalledWith('blob:falso')
  })
})
