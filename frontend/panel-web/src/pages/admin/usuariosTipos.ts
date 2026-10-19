export interface SedeOpcion { id: string; nombre: string }

export interface FilaUsuario {
  id: string
  nombres: string
  apellidos: string
  email: string
  rol: 'usuario' | 'administrador'
  activo: boolean
  dispositivo_id: string | null
  fecha_registro_rostro: string | null
  sedes: { nombre: string } | null
}

export function filtrarUsuarios(
  filas: FilaUsuario[],
  { texto, sede, rol }: { texto: string; sede: string; rol: string },
  sedeIdDe: (f: FilaUsuario) => string | null,
): FilaUsuario[] {
  const t = texto.trim().toLowerCase()
  return filas.filter(
    (f) =>
      (!t || `${f.nombres} ${f.apellidos}`.toLowerCase().includes(t) || f.email.toLowerCase().includes(t)) &&
      (!sede || sedeIdDe(f) === sede) &&
      (!rol || f.rol === rol),
  )
}
