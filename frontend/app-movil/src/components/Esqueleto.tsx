import { useEffect, useRef } from 'react'
import { AccessibilityInfo, Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { colores } from '../theme'
import { Tarjeta2 } from './pestanas'

/**
 * Brillo que «respira» suave (de 0.55 a 1). Con «reducir movimiento» activado en el teléfono se queda quieto.
 * Lo comparten el esqueleto del mapa y los de las tarjetas.
 */
export function useRespiracion(): Animated.Value {
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
  return brillo
}

/** Una forma gris que respira: ocupa el lugar de un texto, un chip, un botón o una tarjeta mientras llega el dato. */
export function BloqueEsqueleto({ ancho = '100%', alto, radio = 8, estilo }: {
  ancho?: number | `${number}%`; alto: number; radio?: number; estilo?: StyleProp<ViewStyle>
}) {
  const brillo = useRespiracion()
  return <Animated.View style={[{ width: ancho, height: alto, borderRadius: radio, backgroundColor: colores.celesteBorde, opacity: brillo }, estilo]} />
}

/**
 * Lo que se ve en Inicio mientras llega la jornada de hoy: la misma forma que tendrá (tarjeta con chip, mapa y botón,
 * las dos cifras y la lista de marcaciones), para que la pantalla no «salte» al cargar.
 */
export function EsqueletoJornada() {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Cargando tu jornada" style={estilos.columna}>
      <Tarjeta2>
        <BloqueEsqueleto ancho={150} alto={24} radio={12} />
        <BloqueEsqueleto alto={220} radio={16} />
        <View style={{ gap: 8 }}>
          <BloqueEsqueleto ancho="70%" alto={20} />
          <BloqueEsqueleto ancho="90%" alto={14} />
        </View>
        <BloqueEsqueleto alto={54} radio={27} />
      </Tarjeta2>
      <View style={estilos.fila}>
        <View style={estilos.dato}><BloqueEsqueleto ancho="60%" alto={11} /><BloqueEsqueleto ancho="80%" alto={20} /></View>
        <View style={estilos.dato}><BloqueEsqueleto ancho="60%" alto={11} /><BloqueEsqueleto ancho="50%" alto={20} /></View>
      </View>
      <Tarjeta2 estilo={{ gap: 14 }}>
        <BloqueEsqueleto ancho="45%" alto={18} />
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={estilos.fila}>
            <BloqueEsqueleto ancho="40%" alto={16} />
            <BloqueEsqueleto ancho="22%" alto={16} />
          </View>
        ))}
      </Tarjeta2>
    </View>
  )
}

const estilos = StyleSheet.create({
  columna: { gap: 14 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  dato: { flex: 1, backgroundColor: colores.blanco, borderRadius: 18, borderWidth: 1, borderColor: colores.bordeSuave, padding: 14, gap: 8 },
})
