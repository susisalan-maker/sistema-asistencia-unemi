import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { htmlDelMapa, type DatosMapa } from '../lib/mapa'
import { colores } from '../theme'
import { EsqueletoMapa } from './EsqueletoMapa'

/** Si los mosaicos no avisan que cargaron (sin internet, por ejemplo), se muestra el mapa igual pasado este tiempo. */
const ESPERA_MAX_MS = 10_000

/** Mapa de la zona de marcación y de dónde está la persona. Necesita internet para bajar los mosaicos del mapa. */
export function MapaGeocerca({ datos, alto = 220 }: { datos: DatosMapa; alto?: number }) {
  const { centro, radio_m, usuario, dentro } = datos
  const html = useMemo(
    () => htmlDelMapa({ centro, radio_m, usuario, dentro }),
    [centro.latitud, centro.longitud, radio_m, usuario?.latitud, usuario?.longitud, dentro],   // eslint-disable-line react-hooks/exhaustive-deps
  )
  const [cargado, setCargado] = useState(false)
  useEffect(() => {
    setCargado(false)
    const reloj = setTimeout(() => setCargado(true), ESPERA_MAX_MS)
    return () => clearTimeout(reloj)
  }, [html])
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
        onMessage={(e) => { if (e.nativeEvent.data === 'listo') setCargado(true) }}
        onError={() => setCargado(true)}
      />
      {!cargado && <EsqueletoMapa alto={alto} estilo={StyleSheet.absoluteFill} />}
    </View>
  )
}

const estilos = StyleSheet.create({
  caja: { borderRadius: 16, overflow: 'hidden', backgroundColor: colores.celeste },
  mapa: { flex: 1, backgroundColor: colores.celeste },
})
