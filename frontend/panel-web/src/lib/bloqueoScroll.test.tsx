import { render } from '@testing-library/react'
import { useBloquearScroll } from './bloqueoScroll'

function Ventana() { useBloquearScroll(); return <p>ventana</p> }

describe('useBloquearScroll', () => {
  it('bloquea el scroll de la página mientras hay una ventana abierta y lo devuelve al cerrarla', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<Ventana />)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.documentElement.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
    expect(document.documentElement.style.overflow).toBe('')
  })

  it('con dos ventanas a la vez, el bloqueo se levanta solo al cerrarse la última', () => {
    const a = render(<Ventana />)
    const b = render(<Ventana />)
    a.unmount()
    expect(document.body.style.overflow).toBe('hidden')
    b.unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })
})
