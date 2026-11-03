/**
 * Marcador de posición mientras llega un dato: una forma gris que «respira» suave.
 * Con «reducir movimiento» activado en el equipo se queda quieta (`motion-safe`).
 */
export function Esqueleto({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`rounded-lg bg-borde-suave motion-safe:animate-pulse ${className}`} />
}
