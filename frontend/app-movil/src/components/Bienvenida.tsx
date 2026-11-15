import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { colores, fuentes } from '../theme'

/** Cuánto se queda la frase a la vista como mínimo (ms), contando desde que aparece. */
export const BIENVENIDA_MIN_MS = 1500
const ENTRADA_MS = 550
const SALIDA_MS = 300

// Solo al abrir la app desde cero: al volver desde segundo plano la pantalla ya existe y no se repite.
let yaSeMostro = false
/** Para las pruebas: vuelve a mostrar la bienvenida como si la app se abriera de nuevo. */
export const olvidarBienvenida = () => { yaSeMostro = false }

/**
 * Pantalla de bienvenida: fondo blanco (igual al de carga del celular, así el paso no se nota) con la frase que aparece
 * suavemente. Se cierra cuando ya pasó el tiempo mínimo y la app está lista para mostrar la primera pantalla.
 */
export function Bienvenida({ lista }: { lista: boolean }) {
  const [visible, setVisible] = useState(!yaSeMostro)
  const [pasoElMinimo, setPasoElMinimo] = useState(false)
  const entrada = useRef(new Animated.Value(0)).current
  const raya = useRef(new Animated.Value(0)).current
  const salida = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (!visible) return
    yaSeMostro = true
    Animated.parallel([
      Animated.timing(entrada, { toValue: 1, duration: ENTRADA_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(raya, { toValue: 1, duration: ENTRADA_MS, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start()
    const t = setTimeout(() => setPasoElMinimo(true), BIENVENIDA_MIN_MS)
    return () => clearTimeout(t)
  }, [visible, entrada, raya])

  useEffect(() => {
    if (!visible || !lista || !pasoElMinimo) return
    Animated.timing(salida, { toValue: 0, duration: SALIDA_MS, useNativeDriver: true }).start(() => setVisible(false))
  }, [visible, lista, pasoElMinimo, salida])

  if (!visible) return null
  return (
    <Animated.View testID="bienvenida" style={[estilos.fondo, { opacity: salida }]} accessibilityViewIsModal>
      <Animated.View style={{ alignItems: 'center', opacity: entrada, transform: [{ translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
        <Text accessibilityRole="header" style={estilos.frase}>{'Tu asistencia,\nsimple y segura'}</Text>
      </Animated.View>
      <Animated.View style={[estilos.raya, { transform: [{ scaleX: raya }] }]} />
      <View style={estilos.pie}><Text style={estilos.pieTexto}>Asistencia Universitaria</Text></View>
    </Animated.View>
  )
}

const estilos = StyleSheet.create({
  fondo: { ...StyleSheet.absoluteFill, zIndex: 100, backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center' },
  frase: { fontFamily: fuentes.extranegrita, fontSize: 30, lineHeight: 36, letterSpacing: -0.5, color: colores.marino, textAlign: 'center', paddingHorizontal: 40 },
  raya: { width: 56, height: 5, borderRadius: 3, backgroundColor: colores.ambar, marginTop: 20 },
  pie: { position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' },
  pieTexto: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
})
