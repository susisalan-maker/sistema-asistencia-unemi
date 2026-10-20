import { useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { htmlDelMapa, type DatosMapa } from '../lib/mapa'
import { colores } from '../theme'

/** Mapa de la zona de marcación y de dónde está la persona. Necesita internet para bajar los mosaicos del mapa. */
export function MapaGeocerca({ datos, alto = 220 }: { datos: DatosMapa; alto?: number }) {
  const { centro, radio_m, usuario, dentro } = datos
  const html = useMemo(
    () => htmlDelMapa({ centro, radio_m, usuario, dentro }),
    [centro.latitud, centro.longitud, radio_m, usuario?.latitud, usuario?.longitud, dentro],   // eslint-disable-line react-hooks/exhaustive-deps
  )
  return (
    <View style={[estilos.caja, { height: alto }]} accessibilityLabel="Mapa de tu ubicación y de la zona de marcación">
      {/* baseUrl: los mosaicos de OpenStreetMap exigen un origen; sin él, algunos dispositivos reciben un 403. */}
      <WebView
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://asistencia.unemi.local' }}
        style={estilos.mapa}
        javaScriptEnabled
        scrollEnabled={false}
        androidLayerType="hardware"
      />
    </View>
  )
}

const estilos = StyleSheet.create({
  caja: { borderRadius: 16, overflow: 'hidden', backgroundColor: colores.celeste },
  mapa: { flex: 1, backgroundColor: colores.celeste },
})
