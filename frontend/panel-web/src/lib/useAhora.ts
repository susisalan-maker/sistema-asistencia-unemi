import { useEffect, useState } from 'react'

/** La hora de ahora, que se renueva sola cada minuto: para textos como «Vence en 5 h» que deben seguir al reloj. */
export function useAhora(cadaMs = 60_000): Date {
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), cadaMs)
    return () => clearInterval(id)
  }, [cadaMs])
  return ahora
}
