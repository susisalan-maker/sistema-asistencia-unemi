import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnomaliasPendientes } from '../lib/useAnomaliasPendientes'
import { colores, fuentes } from '../theme'

/** Las cuatro pestañas del mockup. El resto de pantallas (marcar, justificar…) se abren a pantalla completa, sin barra. */
export const PESTANAS = [
  { ruta: 'index', nombre: 'Inicio', forma: 'cuadro' },
  { ruta: 'historial', nombre: 'Historial', forma: 'cuadro' },
  { ruta: 'avisos', nombre: 'Avisos', forma: 'cuadro' },
  { ruta: 'perfil', nombre: 'Perfil', forma: 'circulo' },
] as const

interface Props {
  state: { index: number; routes: { key: string; name: string }[] }
  navigation: {
    navigate: (nombre: string) => void
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean }
  }
}

export function BarraInferior({ state, navigation }: Props) {
  const insets = useSafeAreaInsets()
  const pendientes = useAnomaliasPendientes()
  const actual = state.routes[state.index]
  // Se refresca el aviso cada vez que se cambia de pantalla (por ejemplo, al volver de justificar).
  useEffect(() => { void pendientes.recargar() }, [state.index, pendientes.recargar])

  if (!actual || !PESTANAS.some((p) => p.ruta === actual.name)) return null
  return (
    <View style={[estilos.barra, { paddingBottom: Math.max(insets.bottom, 14) + 4 }]} accessibilityRole="tablist">
      {PESTANAS.map((p) => {
        const ruta = state.routes.find((r) => r.name === p.ruta)
        if (!ruta) return null
        const activa = actual.name === p.ruta
        const color = activa ? colores.marino : colores.textoInactivo
        return (
          <Pressable
            key={p.ruta}
            accessibilityRole="tab"
            accessibilityLabel={p.nombre}
            accessibilityState={{ selected: activa }}
            style={estilos.pestana}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: ruta.key, canPreventDefault: true })
              if (!activa && !e.defaultPrevented) navigation.navigate(p.ruta)
            }}
          >
            <View>
              <View style={[
                estilos.icono, p.forma === 'circulo' && { borderRadius: 12 },
                activa ? { backgroundColor: colores.marino, borderColor: colores.marino } : { borderColor: colores.iconoInactivo },
              ]} />
              {p.ruta === 'avisos' && pendientes.cantidad > 0 && <View testID="punto-avisos" style={estilos.punto} />}
            </View>
            <Text style={[estilos.etiqueta, { color }]}>{p.nombre}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colores.blanco,
    borderTopWidth: 1, borderTopColor: colores.bordeSuave, paddingTop: 12, paddingHorizontal: 20,
  },
  pestana: { alignItems: 'center', gap: 5, width: 70 },
  icono: { width: 24, height: 24, borderRadius: 8, borderWidth: 2 },
  punto: { position: 'absolute', top: -3, right: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: colores.ambar, borderWidth: 2, borderColor: colores.blanco },
  etiqueta: { fontFamily: fuentes.negrita, fontSize: 11 },
})
