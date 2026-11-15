import { Animated } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { Bienvenida, BIENVENIDA_MIN_MS, olvidarBienvenida } from '../components/Bienvenida'

// Las animaciones usan cuadros de pantalla que no avanzan con relojes falsos: se dan por terminadas al instante.
const instantanea = { start: (fin?: (r: { finished: boolean }) => void) => fin?.({ finished: true }), stop: () => {}, reset: () => {} }
beforeEach(() => {
  jest.useFakeTimers(); olvidarBienvenida()
  jest.spyOn(Animated, 'timing').mockReturnValue(instantanea as unknown as Animated.CompositeAnimation)
  jest.spyOn(Animated, 'parallel').mockReturnValue(instantanea as unknown as Animated.CompositeAnimation)
})
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks() })

describe('Bienvenida', () => {
  it('muestra la frase al abrir la app', async () => {
    await render(<Bienvenida lista={false} />)
    expect(screen.getByText(/Tu asistencia,/)).toBeTruthy()
    expect(screen.getByText('Asistencia Universitaria')).toBeTruthy()
  })

  it('no se cierra antes del tiempo mínimo aunque la app ya esté lista', async () => {
    await render(<Bienvenida lista />)
    await act(async () => { jest.advanceTimersByTime(BIENVENIDA_MIN_MS - 200) })
    expect(screen.getByTestId('bienvenida')).toBeTruthy()
  })

  it('no se cierra mientras la app no esté lista', async () => {
    await render(<Bienvenida lista={false} />)
    await act(async () => { jest.advanceTimersByTime(BIENVENIDA_MIN_MS + 5000) })
    expect(screen.getByTestId('bienvenida')).toBeTruthy()
  })

  it('se cierra cuando pasó el mínimo y la app está lista', async () => {
    await render(<Bienvenida lista />)
    await act(async () => { jest.advanceTimersByTime(BIENVENIDA_MIN_MS + 1000) })
    expect(screen.queryByTestId('bienvenida')).toBeNull()
  })

  it('solo se muestra una vez por apertura de la app', async () => {
    const a = await render(<Bienvenida lista />)
    await act(async () => { jest.advanceTimersByTime(BIENVENIDA_MIN_MS + 1000) })
    a.unmount()
    await render(<Bienvenida lista />)
    expect(screen.queryByTestId('bienvenida')).toBeNull()
  })
})
