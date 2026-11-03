import { useRef, useState, type ComponentRef } from 'react'
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { colores, fuentes } from '../theme'

/**
 * Círculo con las iniciales de la persona: al tocarlo se despliega, justo debajo, un menú con su nombre, su correo y
 * «Cerrar sesión». Se cierra al tocar fuera, con el botón atrás de Android o al elegir la opción.
 */
export function MenuAvatar({ iniciales, nombre, correo, onCerrarSesion }: {
  iniciales: string; nombre: string; correo?: string; onCerrarSesion: () => void
}) {
  const circulo = useRef<ComponentRef<typeof View>>(null)
  const { width } = useWindowDimensions()
  const [abierto, setAbierto] = useState(false)
  // Dónde cae el menú: debajo del círculo y alineado a su borde derecho. Se mide al abrir; mientras llega la medida, un valor razonable.
  const [lugar, setLugar] = useState({ arriba: 96, derecha: 20 })

  function abrir() {
    setAbierto(true)
    circulo.current?.measureInWindow((x, y, ancho, alto) => {
      if (Number.isFinite(x + y + ancho + alto)) setLugar({ arriba: y + alto + 8, derecha: Math.max(width - (x + ancho), 12) })
    })
  }
  const cerrar = () => setAbierto(false)

  return (
    <>
      {/* La medida se pide a un View que envuelve al botón (el ref de Pressable no expone measureInWindow). */}
      <View ref={circulo} collapsable={false}>
        <Pressable accessibilityRole="button" accessibilityLabel="Menú de la cuenta"
          accessibilityState={{ expanded: abierto }} onPress={abrir} style={estilos.avatar}>
          <Text style={estilos.avatarTexto}>{iniciales}</Text>
        </Pressable>
      </View>
      <Modal visible={abierto} transparent animationType="fade" onRequestClose={cerrar} statusBarTranslucent>
        <Pressable accessibilityLabel="Cerrar el menú" style={StyleSheet.absoluteFill} onPress={cerrar} />
        <View style={[estilos.menu, { top: lugar.arriba, right: lugar.derecha }]}>
          <View style={estilos.identidad}>
            <Text numberOfLines={1} style={estilos.nombre}>{nombre}</Text>
            {correo ? <Text numberOfLines={1} style={estilos.correo}>{correo}</Text> : null}
          </View>
          <View style={estilos.separador} />
          <Pressable accessibilityRole="button" accessibilityLabel="Cerrar sesión" style={({ pressed }) => [estilos.opcion, pressed && { backgroundColor: colores.lienzo }]}
            onPress={() => { cerrar(); onCerrarSesion() }}>
            <Text style={estilos.opcionTexto}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  )
}

const estilos = StyleSheet.create({
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.bordeSuave, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontFamily: fuentes.extranegrita, fontSize: 15, color: colores.marino },
  menu: {
    position: 'absolute', width: 250, backgroundColor: colores.blanco, borderRadius: 18, borderWidth: 1, borderColor: colores.bordeSuave, padding: 8,
    shadowColor: colores.marino, shadowOpacity: 0.16, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8,
  },
  identidad: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  nombre: { fontFamily: fuentes.extranegrita, fontSize: 15, color: colores.marino },
  correo: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave },
  separador: { height: 1, backgroundColor: colores.bordeSuave, marginVertical: 4 },
  opcion: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12 },
  opcionTexto: { fontFamily: fuentes.extranegrita, fontSize: 15, color: colores.marino },
})
