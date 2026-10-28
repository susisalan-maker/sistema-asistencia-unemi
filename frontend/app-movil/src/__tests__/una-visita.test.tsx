import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, Text } from 'react-native'
import AppLayout from '../app/(app)/_layout'
import { UnaVisita } from '../components/UnaVisita'

jest.mock('../auth/AuthContext', () => ({ useAuth: () => ({ perfil: null }) }))
jest.mock('../lib/offline/SincronizacionContext', () => ({
  SincronizacionProvider: ({ children }: { children: unknown }) => children,
}))
jest.mock('../components/BarraInferior', () => ({ BarraInferior: () => null }))

/** Una pantalla con estado, como «Marcar»: al pulsar pasa de «Lista» a «Guardada». */
function Marcador() {
  const [guardada, setGuardada] = useState(false)
  return (
    <Pressable accessibilityRole="button" onPress={() => setGuardada(true)}>
      <Text>{guardada ? 'Guardada' : 'Lista para marcar'}</Text>
    </Pressable>
  )
}

const pantalla = (texto: string) => () => <Text>{texto}</Text>

async function abrir(marcar: () => React.JSX.Element) {
  await renderRouter({
    '(app)/_layout': AppLayout,
    '(app)/index': pantalla('Pantalla de inicio'),
    '(app)/historial': pantalla('Pantalla de historial'),
    '(app)/avisos': pantalla('Pantalla de avisos'),
    '(app)/perfil': pantalla('Pantalla de perfil'),
    '(app)/registro-rostro': pantalla('Pantalla del registro'),
    '(app)/marcar': marcar,
    '(app)/justificar': pantalla('Pantalla de justificar'),
  }, { initialUrl: '/' })
  expect(await screen.findByText('Pantalla de inicio')).toBeTruthy()
}

async function marcarYVolver() {
  await act(async () => { router.push('/marcar') })
  await fireEvent.press(await screen.findByText('Lista para marcar'))
  expect(await screen.findByText('Guardada')).toBeTruthy()
  await act(async () => { router.navigate('/') })
  expect(await screen.findByText('Pantalla de inicio')).toBeTruthy()
}

describe('Las pantallas fuera de la barra empiezan de cero en cada visita', () => {
  it('sin el envoltorio, «Marcar» vuelve con la marcación anterior (el error que se vio en el celular)', async () => {
    await abrir(() => <Marcador />)
    await marcarYVolver()
    await act(async () => { router.push('/marcar') })
    expect(await screen.findByText('Guardada')).toBeTruthy()
  })

  it('con UnaVisita, la segunda visita empieza lista para marcar', async () => {
    await abrir(() => <UnaVisita><Marcador /></UnaVisita>)
    await marcarYVolver()
    await act(async () => { router.push('/marcar') })
    expect(await screen.findByText('Lista para marcar')).toBeTruthy()
    expect(screen.queryByText('Guardada')).toBeNull()
  })

  it('con UnaVisita, el contenido no queda montado cuando la pantalla no está a la vista', async () => {
    await abrir(() => <UnaVisita><Marcador /></UnaVisita>)
    expect(screen.queryByText('Lista para marcar')).toBeNull()
  })
})
