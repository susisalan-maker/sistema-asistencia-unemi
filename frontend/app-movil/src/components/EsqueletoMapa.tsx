import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { colores, fuentes } from '../theme'

/**
 * Marcador de posición del mapa mientras se busca la ubicación o se bajan los mosaicos: una caja que «respira» suave.
 * Con «reducir movimiento» activado en el teléfono se queda quieta.
 */
export function EsqueletoMapa({ alto = 220, estilo }: { alto?: number; estilo?: StyleProp<ViewStyle> }) {
  const brillo = useRef(new Animated.Value(0.55)).current
  useEffect(() => {
    let animacion: Animated.CompositeAnimation | null = null
    let activo = true
    const arrancar = async () => {
      let quieto = false
      try { quieto = await AccessibilityInfo.isReduceMotionEnabled() } catch { /* sin dato: se anima */ }
      if (!activo || quieto) return
      animacion = Animated.loop(Animated.sequence([
        Animated.timing(brillo, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(brillo, { toValue: 0.55, duration: 850, useNativeDriver: true }),
      ]))
      animacion.start()
    }
    void arrancar()
    return () => { activo = false; animacion?.stop() }
  }, [brillo])

  return (
    <View testID="esqueleto-mapa" accessibilityRole="progressbar" accessibilityLabel="Cargando el mapa"
      style={[estilos.caja, { height: alto }, estilo]}>
      <Animated.View style={[StyleSheet.absoluteFill, estilos.relleno, { opacity: brillo }]} />
      <Text style={estilos.texto}>Cargando mapa…</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  caja: { borderRadius: 16, overflow: 'hidden', backgroundColor: colores.celeste, alignItems: 'center', justifyContent: 'center' },
  relleno: { backgroundColor: colores.celesteBorde },
  texto: { fontFamily: fuentes.negrita, fontSize: 13, color: colores.marinoSuave },
})
