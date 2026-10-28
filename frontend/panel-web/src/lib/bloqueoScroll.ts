import { useEffect } from 'react'

let usos = 0
let previo: { html: string; body: string; relleno: string } | null = null

/**
 * Mientras hay una ventana abierta (modal u hoja inferior), la página de atrás no debe moverse: se bloquea su scroll.
 * Si hay varias ventanas a la vez, el bloqueo se levanta al cerrarse la última. En escritorio se compensa el ancho de la
 * barra de scroll que desaparece, para que el contenido de atrás no «salte» hacia un lado.
 */
export function useBloquearScroll() {
  useEffect(() => {
    if (usos++ === 0) {
      const { documentElement: html, body } = document
      previo = { html: html.style.overflow, body: body.style.overflow, relleno: body.style.paddingRight }
      const barra = window.innerWidth - html.clientWidth
      html.style.overflow = 'hidden'
      body.style.overflow = 'hidden'
      if (barra > 0) body.style.paddingRight = `${barra}px`
    }
    return () => {
      if (--usos === 0 && previo) {
        document.documentElement.style.overflow = previo.html
        document.body.style.overflow = previo.body
        document.body.style.paddingRight = previo.relleno
        previo = null
      }
    }
  }, [])
}
