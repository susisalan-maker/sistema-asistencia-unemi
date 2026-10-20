import { StyleSheet, Text, View } from 'react-native'
import { ESTADOS, type EstadoAnomalia } from '../lib/anomalias'
import { colores, fuentes } from '../theme'

/** Etiqueta de color con el estado de una anomalía. */
export function Insignia({ estado }: { estado: EstadoAnomalia }) {
  const { texto, tono } = ESTADOS[estado]
  const c = {
    aviso: [colores.avisoFondo, colores.aviso], ok: [colores.okFondo, colores.ok],
    error: [colores.errorFondo, colores.error], neutro: [colores.celeste, colores.marino],
  }[tono]
  return (
    <View style={[estilos.insignia, { backgroundColor: c[0] }]}>
      <Text style={[estilos.insigniaTexto, { color: c[1] }]}>{texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  insignia: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  insigniaTexto: { fontFamily: fuentes.negrita, fontSize: 12 },
})
