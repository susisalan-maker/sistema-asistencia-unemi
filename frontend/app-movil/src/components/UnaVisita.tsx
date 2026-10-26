import { useIsFocused } from 'expo-router'
import { Fragment, useState, type ReactNode } from 'react'

/**
 * Las pantallas de una barra de pestañas NO se desmontan al salir de ellas: conservan su estado. Para «Marcar»,
 * «Registrar rostro» o «Justificar» eso es un error: al volver, la pantalla mostraba el resultado de la visita
 * anterior (por ejemplo «Salida guardada») y la nueva marcación no se hacía nunca.
 *
 * Con este envoltorio cada visita empieza desde cero: el contenido se monta al entrar y se desmonta al salir
 * (de paso, la cámara no queda encendida en segundo plano). Va por fuera del contenido:
 *
 *     export default function Marcar() { return <UnaVisita><MarcarPantalla /></UnaVisita> }
 */
export function UnaVisita({ children }: { children: ReactNode }) {
  const enfocada = useIsFocused()
  const [visita, setVisita] = useState(0)
  const [estabaEnfocada, setEstabaEnfocada] = useState(enfocada)
  // Ajuste de estado durante el render (patrón de React): cada vez que la pantalla vuelve a estar a la vista, otra visita.
  if (enfocada !== estabaEnfocada) {
    setEstabaEnfocada(enfocada)
    if (enfocada) setVisita((v) => v + 1)
  }
  return enfocada ? <Fragment key={visita}>{children}</Fragment> : null
}
