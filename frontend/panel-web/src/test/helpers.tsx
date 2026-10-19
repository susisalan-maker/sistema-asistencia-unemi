import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext, type AuthState } from '../auth/AuthContext'

export const estadoBase: AuthState = {
  cargando: false,
  session: null,
  perfil: null,
  iniciarSesion: async () => null,
  cerrarSesion: async () => {},
}

export function renderConAuth(ui: ReactElement, estado: Partial<AuthState> = {}, ruta = '/') {
  return render(
    <AuthContext.Provider value={{ ...estadoBase, ...estado }}>
      <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
    </AuthContext.Provider>,
  )
}

export const sesionFalsa = { user: { id: 'u1' } } as unknown as AuthState['session']
export const perfilDe = (rol: 'usuario' | 'administrador', activo = true) =>
  ({ id: 'u1', nombres: 'Ana María', apellidos: 'Pérez Loor', email: 'a@x.com', rol, activo })

/** Simula una consulta encadenada de supabase-js: select().eq().order()... y al esperarla devuelve `resultado`. */
export function cadenaSupabase(resultado: { data: unknown; error: unknown }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'maybeSingle']) c[m] = () => c
  c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
  return c
}
