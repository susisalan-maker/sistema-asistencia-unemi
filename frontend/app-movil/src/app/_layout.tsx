import {
  PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans'
import { SplashScreen, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, puedeEntrar, useAuth } from '../auth/AuthContext'
import { Bienvenida } from '../components/Bienvenida'

SplashScreen.preventAutoHideAsync()

export default function RaizLayout() {
  const [fuentesListas] = useFonts({
    PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  })
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Navegador fuentesListas={fuentesListas} />
      </AuthProvider>
    </SafeAreaProvider>
  )
}

function Navegador({ fuentesListas }: { fuentesListas: boolean }) {
  const auth = useAuth()
  // La pantalla de carga (blanca) se quita en cuanto hay fuentes: la bienvenida, también blanca, toma su lugar sin que se note
  // el cambio y se queda hasta que se sepa si hay sesión.
  if (fuentesListas) SplashScreen.hide()
  if (!fuentesListas) return null

  const dentro = puedeEntrar(auth)
  return (
    <>
      {!auth.cargando && (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={dentro}>
            <Stack.Screen name="(app)" />
          </Stack.Protected>
          <Stack.Protected guard={!dentro}>
            <Stack.Screen name="login" />
            <Stack.Screen name="recuperar-contrasena" />
          </Stack.Protected>
        </Stack>
      )}
      <Bienvenida lista={!auth.cargando} />
    </>
  )
}
