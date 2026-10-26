import { act, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { Text } from 'react-native'
import AppLayout from '../app/(app)/_layout'

jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ perfil: null }) }))
jest.mock('../lib/offline/SincronizacionContext', () => ({
  SincronizacionProvider: ({ children }: { children: unknown }) => children,
}))
jest.mock('../components/BarraInferior', () => ({ BarraInferior: () => null }))

/**
 * Con Expo Router 58, una pantalla declarada con `href: null` queda «oculta» y, al abrirla, el router redirige al Inicio
 * (el botón «Registrar mi rostro» parecía recargar el Inicio). Esta prueba usa el layout real.
 */
const pantalla = (texto: string) => () => <Text>{texto}</Text>

describe('Rutas fuera de la barra (marcar, registro del rostro, justificar)', () => {
  it.each([
    ['/historial', 'Pantalla de historial'],
    ['/registro-rostro', 'Pantalla del registro'],
    ['/marcar', 'Pantalla de marcar'],
    ['/justificar', 'Pantalla de justificar'],
  ])('%s se abre y no devuelve al Inicio', async (ruta, texto) => {
    await renderRouter({
      '(app)/_layout': AppLayout,
      '(app)/index': pantalla('Pantalla de inicio'),
      '(app)/historial': pantalla('Pantalla de historial'),
      '(app)/avisos': pantalla('Pantalla de avisos'),
      '(app)/perfil': pantalla('Pantalla de perfil'),
      '(app)/registro-rostro': pantalla('Pantalla del registro'),
      '(app)/marcar': pantalla('Pantalla de marcar'),
      '(app)/justificar': pantalla('Pantalla de justificar'),
    }, { initialUrl: '/' })
    expect(await screen.findByText('Pantalla de inicio')).toBeTruthy()
    await act(async () => { router.push(ruta) })
    expect(await screen.findByText(texto)).toBeTruthy()
    expect(screen.queryByText('Pantalla de inicio')).toBeNull()
  })
})
