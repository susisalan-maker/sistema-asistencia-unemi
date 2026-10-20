import { filtrarUsuarios, type FilaUsuario } from './usuariosTipos'

const f = (id: string, nombre: string, rol: FilaUsuario['rol'], sede: string): FilaUsuario & { sede_id: string } => ({
  id, nombres: nombre.split(' ')[0]!, apellidos: nombre.split(' ').slice(1).join(' ') || 'Apellido', email: `${nombre.split(' ')[0]!.toLowerCase()}@u.edu`, rol, activo: true,
  dispositivo_id: null, fecha_registro_rostro: null, jornada_inicio: '08:00:00', jornada_fin: '17:00:00', dias_laborables: [1, 2, 3, 4, 5],
  sedes: { nombre: sede }, sede_id: sede,
})
const filas = [f('1', 'Rocío Molina', 'usuario', 'A'), f('2', 'Andrés Vaca', 'usuario', 'B'), f('3', 'Mónica Terán', 'administrador', 'A')]
const sedeDe = (x: FilaUsuario) => (x as FilaUsuario & { sede_id: string }).sede_id

describe('filtrarUsuarios', () => {
  it('sin filtros devuelve todo', () => {
    expect(filtrarUsuarios(filas, { texto: '', sede: '', rol: '' }, sedeDe)).toHaveLength(3)
  })
  it('busca por nombre o email sin distinguir mayúsculas', () => {
    expect(filtrarUsuarios(filas, { texto: 'ROCÍO', sede: '', rol: '' }, sedeDe).map((x) => x.id)).toEqual(['1'])
    expect(filtrarUsuarios(filas, { texto: 'vaca@', sede: '', rol: '' }, sedeDe)).toHaveLength(0)
    expect(filtrarUsuarios(filas, { texto: 'andrés@u', sede: '', rol: '' }, sedeDe).map((x) => x.id)).toEqual(['2'])
  })
  it('combina sede y rol', () => {
    expect(filtrarUsuarios(filas, { texto: '', sede: 'A', rol: 'administrador' }, sedeDe).map((x) => x.id)).toEqual(['3'])
  })
})
