import { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAnomaliasPendientes } from '../lib/useAnomaliasPendientes'
import { colores, fuentes } from '../theme'
import { Icono, type NombreIcono } from './Iconos'

/** Las cuatro pestañas del mockup. El resto de pantallas (marcar, justificar…) se abren a pantalla completa, sin barra. */
export const PESTANAS: readonly { ruta: string; nombre: string; icono: NombreIcono }[] = [
  { ruta: 'index', nombre: 'Inicio', icono: 'inicio' },
  { ruta: 'historial', nombre: 'Historial', icono: 'historial' },
  { ruta: 'avisos', nombre: 'Avisos', icono: 'avisos' },
  { ruta: 'perfil', nombre: 'Perfil', icono: 'perfil' },
]

/** El globo de Avisos muestra el número; de 10 en adelante, «9+», para que no crezca. */
export const textoGlobo = (cantidad: number) => (cantidad > 9 ? '9+' : String(cantidad))

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
        // Gris más oscuro que antes: el inactivo se lee bien sobre blanco. La activa se distingue por color, trazo más grueso y la «píldora».
        const color = activa ? colores.marino : colores.textoSuave
        const conAviso = p.ruta === 'avisos' && pendientes.cantidad > 0
        return (
          <Pressable
            key={p.ruta}
            accessibilityRole="tab"
            accessibilityLabel={conAviso ? `${p.nombre}, ${pendientes.cantidad} por justificar` : p.nombre}
            accessibilityState={{ selected: activa }}
            style={estilos.pestana}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: ruta.key, canPreventDefault: true })
              if (!activa && !e.defaultPrevented) navigation.navigate(p.ruta)
            }}
          >
            <View>
              <View testID={activa ? 'pildora-activa' : undefined} style={[estilos.pildora, activa && { backgroundColor: colores.celeste }]}>
                <Icono nombre={p.icono} color={color} grosor={activa ? 2.3 : 1.9} />
              </View>
              {conAviso && (
                <View testID="globo-avisos" style={estilos.globo}>
                  <Text style={estilos.globoTexto}>{textoGlobo(pendientes.cantidad)}</Text>
                </View>
              )}
            </View>
            <Text style={[estilos.etiqueta, { color, fontFamily: activa ? fuentes.extranegrita : fuentes.negrita }]}>{p.nombre}</Text>
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
  pestana: { alignItems: 'center', gap: 4, minWidth: 70, minHeight: 48 },
  pildora: { width: 56, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  globo: {
    position: 'absolute', top: -4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colores.ambar, borderWidth: 2, borderColor: colores.blanco,
  },
  globoTexto: { fontFamily: fuentes.extranegrita, fontSize: 10, lineHeight: 12, color: colores.ambarTinta },
  etiqueta: { fontSize: 11 },
})
