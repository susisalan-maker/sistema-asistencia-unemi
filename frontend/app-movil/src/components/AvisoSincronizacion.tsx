import { StyleSheet, Text } from 'react-native'
import { horaLocal, nombreDeTipo } from '../lib/marcacion'
import { useSincronizacion } from '../lib/offline/SincronizacionContext'
import { colores, fuentes } from '../theme'
import { Chip, Tarjeta2 } from './pestanas'
import { Aviso, Boton } from './ui'

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

/**
 * Lo que la persona necesita saber de sus marcaciones sin conexión: que no hay red (pero puede marcar igual),
 * cuántas siguen guardadas en el celular (con el botón para enviarlas ya) y cuáles rechazó el servidor.
 * No muestra nada si todo está en orden.
 */
export function AvisoSincronizacion() {
  const { enLinea, pendientes, descartadas, sincronizando, sincronizarAhora, descartar } = useSincronizacion()
  const ultimoError = pendientes.map((p) => p.ultimo_error).find(Boolean) ?? null

  return (
    <>
      {!enLinea && (
        <Aviso tipo="aviso">
          Sin conexión a internet. Puedes marcar igual: tu marcación se guarda en el celular y se envía sola cuando vuelva la señal.
        </Aviso>
      )}

      {pendientes.length > 0 && (
        <Tarjeta2 estilo={estilos.tarjeta}>
          <Chip texto="Pendiente de enviar" tono="aviso" />
          <Text style={estilos.titulo}>
            {pendientes.length} {plural(pendientes.length, 'marcación guardada', 'marcaciones guardadas')} en tu celular
          </Text>
          <Text style={estilos.sub}>
            {enLinea ? 'Se envían solas; también puedes enviarlas ahora.' : 'Se enviarán solas cuando vuelva el internet.'}
          </Text>
          {enLinea && ultimoError && <Text style={estilos.error}>Último intento: {ultimoError}</Text>}
          <Boton titulo="Sincronizar ahora" variante="borde" cargando={sincronizando} onPress={() => void sincronizarAhora()} />
        </Tarjeta2>
      )}

      {descartadas.map((d) => (
        <Tarjeta2 key={d.id} estilo={estilos.tarjeta}>
          <Aviso tipo="error">
            {nombreDeTipo(d.tipo)} de las {horaLocal(d.fecha_hora)} no se pudo registrar: {d.ultimo_error ?? 'el servidor la rechazó'}
          </Aviso>
          <Text style={estilos.sub}>Si fue un error tuyo o no pudiste evitarlo, explícalo desde Avisos o con Talento Humano.</Text>
          <Boton titulo="Entendido" variante="borde" onPress={() => void descartar(d.id)} />
        </Tarjeta2>
      ))}
    </>
  )
}

const estilos = StyleSheet.create({
  tarjeta: { gap: 10 },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.marino },
  sub: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave },
  error: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.aviso },
})
