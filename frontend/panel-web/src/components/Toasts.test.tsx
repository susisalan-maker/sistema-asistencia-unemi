import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthContext } from '../auth/AuthContext'
import { estadoBase, sesionFalsa } from '../test/helpers'
import { DURACION_TOAST_MS, MAXIMO_TOASTS, ToastProvider, useNotificar, type TipoToast } from './Toasts'

function Disparador({ tipo = 'ok', texto = 'Sede guardada' }: { tipo?: TipoToast; texto?: string }) {
  const notificar = useNotificar()
  return <button onClick={() => notificar(tipo, texto)}>avisar {texto}</button>
}
const pantalla = (...hijos: React.ReactNode[]) => render(<ToastProvider>{hijos}</ToastProvider>)
const avanzar = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })

describe('Toasts', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('el éxito aparece y se va solo a los 5 segundos', () => {
    pantalla(<Disparador />)
    fireEvent.click(screen.getByText('avisar Sede guardada'))
    expect(screen.getByRole('status')).toHaveTextContent('Sede guardada')
    avanzar(DURACION_TOAST_MS.ok! - 100)
    expect(screen.getByRole('status')).toBeInTheDocument()
    avanzar(200)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('un aviso dura más que un éxito', () => {
    pantalla(<Disparador tipo="aviso" texto="Revisa esto" />)
    fireEvent.click(screen.getByText('avisar Revisa esto'))
    avanzar(DURACION_TOAST_MS.ok! + 500)
    expect(screen.getByRole('status')).toHaveTextContent('Revisa esto')
    avanzar(DURACION_TOAST_MS.aviso! - DURACION_TOAST_MS.ok!)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('un error no se va solo: se anuncia como alerta y se queda hasta cerrarlo', () => {
    pantalla(<Disparador tipo="error" texto="Falló" />)
    fireEvent.click(screen.getByText('avisar Falló'))
    avanzar(60_000)
    expect(screen.getByRole('alert')).toHaveTextContent('Falló')
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('al pasar el cursor se detiene el tiempo, y al salir sigue con lo que le quedaba', async () => {
    pantalla(<Disparador />)
    fireEvent.click(screen.getByText('avisar Sede guardada'))
    avanzar(3000)
    fireEvent.mouseEnter(screen.getByRole('status'))
    avanzar(30_000)
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.mouseLeave(screen.getByRole('status'))
    avanzar(1900)
    expect(screen.getByRole('status')).toBeInTheDocument()
    avanzar(300)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('Esc cierra la más reciente', async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    pantalla(<Disparador texto="Primera" />, <Disparador texto="Segunda" />)
    await u.click(screen.getByText('avisar Primera'))
    await u.click(screen.getByText('avisar Segunda'))
    expect(screen.getAllByRole('status')).toHaveLength(2)
    await u.keyboard('{Escape}')
    const quedan = screen.getAllByRole('status')
    expect(quedan).toHaveLength(1)
    expect(quedan[0]).toHaveTextContent('Primera')
  })

  it('repetir el mismo mensaje no lo duplica y reinicia su tiempo', () => {
    pantalla(<Disparador />)
    fireEvent.click(screen.getByText('avisar Sede guardada'))
    avanzar(4000)
    fireEvent.click(screen.getByText('avisar Sede guardada'))
    expect(screen.getAllByRole('status')).toHaveLength(1)
    avanzar(4000)
    expect(screen.getByRole('status')).toBeInTheDocument()
    avanzar(1200)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it(`no muestra más de ${MAXIMO_TOASTS} a la vez: se va la más antigua`, () => {
    pantalla(<Disparador texto="Uno" />, <Disparador texto="Dos" />, <Disparador texto="Tres" />, <Disparador texto="Cuatro" />)
    for (const t of ['Uno', 'Dos', 'Tres', 'Cuatro']) fireEvent.click(screen.getByText(`avisar ${t}`))
    const textos = screen.getAllByRole('status').map((n) => n.textContent)
    expect(textos).toHaveLength(MAXIMO_TOASTS)
    expect(textos.join(' ')).not.toContain('Uno')
    expect(textos.join(' ')).toContain('Cuatro')
  })

  it('al cerrar la sesión se limpian las notificaciones, también las de error', () => {
    const arbol = (session: typeof estadoBase.session) => (
      <AuthContext.Provider value={{ ...estadoBase, session }}>
        <ToastProvider><Disparador tipo="error" texto="No se pudo guardar" /><Disparador texto="Sede guardada" /></ToastProvider>
      </AuthContext.Provider>
    )
    const { rerender } = render(arbol(sesionFalsa))
    fireEvent.click(screen.getByText('avisar No se pudo guardar'))
    fireEvent.click(screen.getByText('avisar Sede guardada'))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('status')).toBeInTheDocument()
    rerender(arbol(null))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sin proveedor no rompe (no hace nada)', () => {
    render(<Disparador />)
    expect(() => fireEvent.click(screen.getByText('avisar Sede guardada'))).not.toThrow()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
