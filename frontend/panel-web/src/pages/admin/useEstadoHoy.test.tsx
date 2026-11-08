import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({ supabase: { channel: vi.fn(), removeChannel: vi.fn() } }))
vi.mock('./estadoHoy', async (importar) => ({
  ...(await importar<typeof import('./estadoHoy')>()),
  consultarEstadoHoy: vi.fn(),
  consultarAtencion: vi.fn(),
}))

import { supabase } from '../../lib/supabase'
import { consultarAtencion, consultarEstadoHoy, leerAtencion, leerEstadoHoy } from './estadoHoy'
import { ESPERA_AVISO_MS, REFRESCO_MS, useEstadoHoy } from './useEstadoHoy'

const estado = (esperadas: number) => leerEstadoHoy({ esperadas })
let avisar: () => void
let estadoDeLaConexion: (s: string) => void
const canalFalso = { name: 'canal' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(consultarEstadoHoy).mockReset().mockResolvedValue(estado(5))
  vi.mocked(consultarAtencion).mockReset().mockResolvedValue(leerAtencion({}))
  vi.mocked(supabase.removeChannel).mockReset()
  vi.mocked(supabase.channel).mockReset().mockImplementation((() => {
    const canal: Record<string, unknown> = canalFalso
    canal.on = (_t: string, filtro: { table: string }, cb: () => void) => { if (filtro.table === 'marcaciones') avisar = cb; return canal }
    canal.subscribe = (cb: (s: string) => void) => { estadoDeLaConexion = cb; return canal }
    return canal
  }) as never)
})
afterEach(() => { vi.useRealTimers() })

const vaciar = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

describe('useEstadoHoy', () => {
  it('al abrir pide el estado y lo que requiere atención', async () => {
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    expect(result.current.estado?.esperadas).toBe(5)
    expect(result.current.atencion).not.toBeNull()
    expect(result.current.actualizadoEn).not.toBeNull()
    expect(result.current.errorEstado).toBe(false)
  })

  it('escucha las marcaciones nuevas y los cambios de casos, y dice cuándo la conexión está en vivo', async () => {
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    expect(supabase.channel).toHaveBeenCalledTimes(1)
    expect(result.current.enVivo).toBe(false)
    act(() => estadoDeLaConexion('SUBSCRIBED'))
    expect(result.current.enVivo).toBe(true)
    act(() => estadoDeLaConexion('CHANNEL_ERROR'))
    expect(result.current.enVivo).toBe(false)
  })

  it('un aviso vuelve a pedir, pero solo una vez aunque lleguen varios seguidos', async () => {
    renderHook(() => useEstadoHoy())
    await vaciar()
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(1)
    act(() => { avisar(); avisar(); avisar() })
    await act(async () => { await vi.advanceTimersByTimeAsync(ESPERA_AVISO_MS - 100) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(1)   // todavía espera por si llegan más
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(2)
  })

  it('cada minuto vuelve a pedir, aunque no llegue ningún aviso (quien llega tarde no genera marcación)', async () => {
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    vi.mocked(consultarEstadoHoy).mockResolvedValue(estado(6))
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(2)
    expect(result.current.estado?.esperadas).toBe(6)
  })

  it('al volver a la pestaña vuelve a pedir; si sigue oculta, no', async () => {
    renderHook(() => useEstadoHoy())
    await vaciar()
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get')
    visibilidad.mockReturnValue('hidden')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(1)
    visibilidad.mockReturnValue('visible')
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(2)
    visibilidad.mockRestore()
  })

  it('si falla una petición, conserva lo último que llegó y lo avisa; la siguiente lo repara', async () => {
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    vi.mocked(consultarEstadoHoy).mockRejectedValueOnce(new Error('sin red'))
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS) })
    expect(result.current.errorEstado).toBe(true)
    expect(result.current.estado?.esperadas).toBe(5)
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS) })
    expect(result.current.errorEstado).toBe(false)
  })

  it('lo de atención y lo de hoy fallan por separado', async () => {
    vi.mocked(consultarAtencion).mockRejectedValue(new Error('x'))
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    expect(result.current.estado?.esperadas).toBe(5)
    expect(result.current.errorEstado).toBe(false)
    expect(result.current.errorAtencion).toBe(true)
    expect(result.current.atencion).toBeNull()
  })

  it('una respuesta vieja que llega tarde no pisa a la más nueva', async () => {
    let soltarVieja: (e: ReturnType<typeof estado>) => void = () => {}
    vi.mocked(consultarEstadoHoy).mockReset()
      .mockImplementationOnce(() => new Promise((ok) => { soltarVieja = ok }))
      .mockResolvedValue(estado(9))
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS) })   // la segunda llega primero
    expect(result.current.estado?.esperadas).toBe(9)
    await act(async () => { soltarVieja(estado(1)) })                           // la primera llega después
    expect(result.current.estado?.esperadas).toBe(9)
  })

  it('si Realtime no está disponible, sigue funcionando con el refresco de cada minuto', async () => {
    vi.mocked(supabase.channel).mockImplementation((() => { throw new Error('sin realtime') }) as never)
    const { result } = renderHook(() => useEstadoHoy())
    await vaciar()
    expect(result.current.enVivo).toBe(false)
    expect(result.current.estado?.esperadas).toBe(5)
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(2)
  })

  it('al salir de la pantalla cierra la conexión y deja de pedir', async () => {
    const { unmount } = renderHook(() => useEstadoHoy())
    await vaciar()
    act(() => avisar())
    unmount()
    expect(supabase.removeChannel).toHaveBeenCalledWith(canalFalso)
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESCO_MS * 3) })
    expect(consultarEstadoHoy).toHaveBeenCalledTimes(1)
  })
})
