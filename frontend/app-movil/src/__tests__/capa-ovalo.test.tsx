import { fireEvent, render, screen } from '@testing-library/react-native'
import { CapaOvalo } from '../components/CapaOvalo'

const oculto = { includeHiddenElements: true }

describe('CapaOvalo', () => {
  it('no estorba: no recibe toques ni la leen los lectores de pantalla (es solo una guía visual)', async () => {
    await render(<CapaOvalo />)
    const capa = screen.getByTestId('capa-ovalo', oculto)
    expect(capa.props.pointerEvents).toBe('none')
    expect(capa.props.accessibilityElementsHidden).toBe(true)
    expect(capa.props.importantForAccessibility).toBe('no-hide-descendants')
  })

  it('dibuja el óvalo solo cuando ya conoce su tamaño', async () => {
    await render(<CapaOvalo maxAlto={500} />)
    expect(screen.queryByTestId('ovalo-borde', oculto)).toBeNull()
    await fireEvent(screen.getByTestId('capa-ovalo', oculto), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } })
    expect(screen.getByTestId('ovalo-borde', oculto)).toBeTruthy()
  })
})
