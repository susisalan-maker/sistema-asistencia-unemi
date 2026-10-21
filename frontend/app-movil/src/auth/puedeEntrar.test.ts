import type { Session } from '@supabase/supabase-js'
import { puedeEntrar, type Perfil } from './AuthContext'

jest.mock('../lib/supabase', () => ({ supabase: {} }))

const sesion = { user: { id: 'u1' } } as unknown as Session
const perfil = (activo: boolean): Perfil => ({ id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol: 'usuario', activo })

describe('puedeEntrar', () => {
  it('sin sesión no entra', () => expect(puedeEntrar({ session: null, perfil: null })).toBe(false))
  it('con sesión pero sin perfil no entra', () => expect(puedeEntrar({ session: sesion, perfil: null })).toBe(false))
  it('con cuenta desactivada no entra', () => expect(puedeEntrar({ session: sesion, perfil: perfil(false) })).toBe(false))
  it('con sesión y cuenta activa entra', () => expect(puedeEntrar({ session: sesion, perfil: perfil(true) })).toBe(true))
})
