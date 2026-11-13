/** Un paso «bonito» para el eje de una gráfica: el menor de la lista con el que `max` cabe en 5 tramos o menos. */
export function pasoDeEje(max: number): number {
  return [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((p) => Math.ceil(max / p) <= 5) ?? 1000
}

/** El eje completo: el valor más alto (múltiplo del paso, nunca menor al paso) y sus marcas de 0 hasta el tope. */
export function ejeDe(max: number): { paso: number; tope: number; marcas: number[] } {
  const paso = pasoDeEje(max)
  const tope = Math.max(paso, Math.ceil(max / paso) * paso)
  const marcas: number[] = []
  for (let v = 0; v <= tope; v += paso) marcas.push(v)
  return { paso, tope, marcas }
}
