import { Tabs } from 'expo-router'
import { BarraInferior } from '../../components/BarraInferior'

/**
 * Cuatro pestañas (Inicio, Historial, Avisos, Perfil) como en el mockup. Las demás pantallas del grupo
 * (marcar, justificar, registro del rostro) son rutas ocultas que se abren sin la barra inferior.
 */
export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <BarraInferior state={props.state} navigation={props.navigation as never} />}
    >
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="historial" options={{ title: 'Historial' }} />
      <Tabs.Screen name="avisos" options={{ title: 'Avisos' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
      <Tabs.Screen name="marcar" options={{ href: null }} />
      <Tabs.Screen name="registro-rostro" options={{ href: null }} />
      <Tabs.Screen name="justificar" options={{ href: null }} />
    </Tabs>
  )
}
