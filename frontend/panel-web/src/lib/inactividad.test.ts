import { renderHook } from '@testing-library/react'
import { INACTIVIDAD_MS, useInactividad } from './inactividad'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useInactividad', () => {
  it('llama cuando pasa el tiempo sin actividad', () => {
    const vencer = vi.fn()
    renderHook(() => useInactividad(vencer, 1000))
    vi.advanceTimersByTime(999)
    expect(vencer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2)
    expect(vencer).toHaveBeenCalledTimes(1)
  })

  it('la actividad reinicia la cuenta', () => {
    const vencer = vi.fn()
    renderHook(() => useInactividad(vencer, 1000))
    vi.advanceTimersByTime(800)
    window.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(800)
    expect(vencer).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(vencer).toHaveBeenCalledTimes(1)
  })

  it('al desmontar ya no llama', () => {
    const vencer = vi.fn()
    const { unmount } = renderHook(() => useInactividad(vencer, 1000))
    unmount()
    vi.advanceTimersByTime(5000)
    expect(vencer).not.toHaveBeenCalled()
  })

  it('el tiempo por omisión es de diez minutos', () => {
    expect(INACTIVIDAD_MS).toBe(10 * 60 * 1000)
  })
})
