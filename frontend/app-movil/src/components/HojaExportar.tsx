import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  diasDelRango, errorDeRango, exportarMarcaciones, fechaCorta, MAX_DIAS_EXPORTACION, mensajeDeErrorExportacion, rangoDePeriodo,
  type FormatoExportacion, type PeriodoExportacion, type Rango,
} from '../lib/exportar'
import { colores, fuentes } from '../theme'
import { CalendarioRango } from './CalendarioRango'
import { Aviso, Boton } from './ui'

const PERIODOS: { id: PeriodoExportacion; texto: string }[] = [
  { id: '7', texto: 'Últimos 7 días' },
  { id: '30', texto: 'Últimos 30 días' },
  { id: 'mes_anterior', texto: 'Mes anterior' },
  { id: 'personalizado', texto: 'Personalizado' },
]
const FORMATOS: { id: FormatoExportacion; texto: string; detalle: string }[] = [
  { id: 'pdf', texto: 'PDF', detalle: 'Para leer o imprimir' },
  { id: 'xlsx', texto: 'Excel', detalle: 'Para filtrar y calcular' },
]

/** Hoja inferior para exportar las marcaciones propias: período, formato y «Generar y compartir». */
export function HojaExportar({ visible, hoy, alCerrar }: { visible: boolean; hoy: string; alCerrar: () => void }) {
  const [periodo, setPeriodo] = useState<PeriodoExportacion>('30')
  const [formato, setFormato] = useState<FormatoExportacion>('pdf')
  const [desde, setDesde] = useState<string | null>(null)
  const [hasta, setHasta] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vacio, setVacio] = useState(false)

  const rango: Rango | null = periodo === 'personalizado'
    ? (desde && hasta ? { desde, hasta } : null)
    : rangoDePeriodo(periodo, hoy)
  const errorRango = periodo === 'personalizado' ? errorDeRango(desde, hasta, hoy) : null
  const puedeGenerar = !!rango && !errorRango && !generando

  const limpiar = () => { setError(null); setVacio(false) }
  const elegirPeriodo = (p: PeriodoExportacion) => { setPeriodo(p); limpiar() }

  const generar = async () => {
    if (!rango) return
    limpiar()
    setGenerando(true)
    try {
      const r = await exportarMarcaciones(rango, formato)
      if (r.total === 0) setVacio(true)
      else alCerrar()
    } catch (e) {
      setError(mensajeDeErrorExportacion(e))
    } finally {
      setGenerando(false)
    }
  }

  const resumen = rango
    ? `Del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)} · ${diasDelRango(rango.desde, rango.hasta)} ${diasDelRango(rango.desde, rango.hasta) === 1 ? 'día' : 'días'}`
    : 'Elige el día inicial y el final en el calendario.'

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={alCerrar} statusBarTranslucent>
      <View style={estilos.fondo}>
        <Pressable accessibilityLabel="Cerrar" style={estilos.cortina} onPress={generando ? undefined : alCerrar} />
        <SafeAreaView edges={['bottom']} style={estilos.hoja}>
          <View style={estilos.agarre} />
          <View style={estilos.cabecera}>
            <Text accessibilityRole="header" style={estilos.titulo}>Exportar marcaciones</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Cerrar hoja" disabled={generando} onPress={alCerrar} style={estilos.cerrar}>
              <Text style={estilos.cerrarTexto}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={estilos.cuerpo} keyboardShouldPersistTaps="handled">
            <Text style={estilos.rotulo}>PERÍODO</Text>
            <View style={estilos.opciones}>
              {PERIODOS.map((p) => (
                <Pressable
                  key={p.id} accessibilityRole="radio" accessibilityLabel={p.texto} accessibilityState={{ selected: periodo === p.id }}
                  onPress={() => elegirPeriodo(p.id)} style={[estilos.opcion, periodo === p.id && estilos.opcionActiva]}
                >
                  <Text style={[estilos.opcionTexto, periodo === p.id && { color: colores.blanco }]}>{p.texto}</Text>
                </Pressable>
              ))}
            </View>

            {periodo === 'personalizado' && (
              <View style={{ gap: 10 }}>
                <View style={estilos.campos}>
                  <Campo etiqueta="Desde" valor={desde ? fechaCorta(desde) : 'Elige un día'} />
                  <Campo etiqueta="Hasta" valor={hasta ? fechaCorta(hasta) : 'Elige un día'} />
                </View>
                <CalendarioRango desde={desde} hasta={hasta} hoy={hoy} alCambiar={(d, h) => { setDesde(d); setHasta(h); limpiar() }} />
                <Text style={estilos.nota}>Máximo {MAX_DIAS_EXPORTACION} días seguidos (unos 3 meses). Los días futuros no se pueden elegir.</Text>
              </View>
            )}

            <Text style={estilos.rotulo}>FORMATO</Text>
            <View style={estilos.opciones}>
              {FORMATOS.map((f) => (
                <Pressable
                  key={f.id} accessibilityRole="radio" accessibilityLabel={`${f.texto}, ${f.detalle}`} accessibilityState={{ selected: formato === f.id }}
                  onPress={() => { setFormato(f.id); limpiar() }} style={[estilos.formato, formato === f.id && estilos.formatoActivo]}
                >
                  <Text style={estilos.formatoTitulo}>{f.texto}</Text>
                  <Text style={estilos.formatoDetalle}>{f.detalle}</Text>
                </Pressable>
              ))}
            </View>

            <View style={estilos.resumen}>
              <Text style={estilos.resumenTitulo}>{resumen}</Text>
              <Text style={estilos.resumenTexto}>Incluye fecha, tipo, hora, lugar y si tuvo alguna observación. No incluye fotos ni coordenadas.</Text>
            </View>

            {errorRango && periodo === 'personalizado' && desde && hasta ? <Aviso tipo="aviso">{errorRango}</Aviso> : null}
            {error ? <Aviso tipo="error">{error}</Aviso> : null}
            {vacio ? <Aviso tipo="aviso">No tienes marcaciones en ese período. Prueba con otro.</Aviso> : null}

            <Boton titulo="Generar y compartir" cargando={generando} disabled={!puedeGenerar} onPress={generar} />
            <Text style={estilos.nota}>Se abrirá el menú de compartir de tu celular para guardar el archivo o enviarlo.</Text>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

function Campo({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={estilos.campo} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.campoValor}>{valor}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  fondo: { flex: 1, justifyContent: 'flex-end' },
  cortina: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20, 32, 74, 0.45)' },
  hoja: { backgroundColor: colores.lienzo, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%' },
  agarre: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colores.borde, marginTop: 10 },
  cabecera: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8 },
  titulo: { flex: 1, fontFamily: fuentes.extranegrita, fontSize: 20, color: colores.marino },
  cerrar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -10 },
  cerrarTexto: { fontFamily: fuentes.extranegrita, fontSize: 18, color: colores.textoSuave },
  cuerpo: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4, gap: 12 },
  rotulo: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta, marginTop: 4 },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: {
    minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colores.borde,
    backgroundColor: colores.blanco, alignItems: 'center', justifyContent: 'center',
  },
  opcionActiva: { backgroundColor: colores.marino, borderColor: colores.marino },
  opcionTexto: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.texto },
  formato: { flex: 1, minHeight: 64, borderRadius: 16, borderWidth: 2, borderColor: colores.borde, backgroundColor: colores.blanco, padding: 12, justifyContent: 'center' },
  formatoActivo: { borderColor: colores.marino, backgroundColor: colores.celeste },
  formatoTitulo: { fontFamily: fuentes.extranegrita, fontSize: 16, color: colores.marino },
  formatoDetalle: { fontFamily: fuentes.seminegrita, fontSize: 12, color: colores.textoSuave },
  campos: { flexDirection: 'row', gap: 10 },
  campo: { flex: 1, backgroundColor: colores.blanco, borderRadius: 14, borderWidth: 1, borderColor: colores.borde, paddingHorizontal: 14, paddingVertical: 10 },
  campoEtiqueta: { fontFamily: fuentes.extranegrita, fontSize: 11, letterSpacing: 0.8, color: colores.etiqueta },
  campoValor: { fontFamily: fuentes.negrita, fontSize: 15, color: colores.marino },
  resumen: { backgroundColor: colores.celeste, borderRadius: 16, borderWidth: 1, borderColor: colores.celesteBorde, padding: 14, gap: 4 },
  resumenTitulo: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.marino },
  resumenTexto: { fontFamily: fuentes.seminegrita, fontSize: 13, lineHeight: 18, color: colores.texto },
  nota: { fontFamily: fuentes.seminegrita, fontSize: 12, lineHeight: 17, color: colores.textoSuave, textAlign: 'center' },
})
