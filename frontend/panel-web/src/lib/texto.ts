export function iniciales(nombres: string, apellidos = ''): string {
  const n = nombres.trim().split(/\s+/).filter(Boolean)
  const a = apellidos.trim().split(/\s+/).filter(Boolean)
  const letras = a.length ? [n[0], a[0]] : n.slice(0, 2)
  return letras.filter(Boolean).map((p) => p![0]!.toUpperCase()).join('')
}

export function nombreCompleto(p: { nombres: string; apellidos: string }): string {
  return `${p.nombres} ${p.apellidos}`.trim()
}
