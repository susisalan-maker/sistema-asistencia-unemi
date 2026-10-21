import {
  PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans'
import { SplashScreen, Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, puedeEntrar, useAuth } from '../auth/AuthContext'

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
  // La pantalla de carga se mantiene hasta tener fuentes y saber si hay sesión.
  if (fuentesListas && !auth.cargando) SplashScreen.hide()
  if (!fuentesListas || auth.cargando) return null

  const dentro = puedeEntrar(auth)
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={dentro}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!dentro}>
        <Stack.Screen name="login" />
        <Stack.Screen name="recuperar-contrasena" />
      </Stack.Protected>
    </Stack>
  )
}
