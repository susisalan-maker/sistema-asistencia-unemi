import { Tabs } from 'expo-router'
import { useAuth } from '../../auth/AuthContext'
import { BarraInferior } from '../../components/BarraInferior'
import { SincronizacionProvider } from '../../lib/offline/SincronizacionContext'

/**
 * Cuatro pestañas (Inicio, Historial, Avisos, Perfil) como en el mockup. Las demás pantallas del grupo
 * (marcar, justificar, registro del rostro) se abren sin la barra inferior (ella misma se oculta; ver más abajo).
 */
export default function AppLayout() {
  const { perfil } = useAuth()
  return (
    // La cola de marcaciones sin conexión vive aquí para que siga activa en todas las pantallas.
    <SincronizacionProvider usuarioId={perfil?.id ?? null}>
      <Tabs
        backBehavior="history"
        screenOptions={{ headerShown: false }}
        // Expo Router 58 ya no entrega `navigation`: da `navigateToTab` (por llave de ruta) y `emitter` (el evento «tabPress»).
        tabBar={(props) => (
          <BarraInferior
            state={props.state}
            navigation={{
              navigate: (nombre) => {
                const ruta = props.state.routes.find((r) => r.name === nombre)
                if (ruta) props.navigateToTab(ruta.key)
              },
              emit: (e) => props.emitter.emit(e),
            }}
          />
        )}
      >
        <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="historial" options={{ title: 'Historial' }} />
        <Tabs.Screen name="avisos" options={{ title: 'Avisos' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
        {/* Pantallas que se abren sin la barra (BarraInferior se oculta sola en ellas). NO usar `href: null`: desde el SDK 58 eso
            las marca como ocultas y el router redirige al Inicio al abrirlas (lo vigila src/__tests__/rutas-ocultas.test.tsx). */}
        <Tabs.Screen name="marcar" />
        <Tabs.Screen name="registro-rostro" />
        <Tabs.Screen name="justificar" />
      </Tabs>
    </SincronizacionProvider>
  )
}
