/** Piezas que se repiten en las pantallas de pestañas (Inicio, Historial, Avisos, Perfil): vienen del mockup. */
import { useCallback, useState, type ReactNode } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colores, fuentes } from '../theme'
import { Icono, type NombreIcono } from './Iconos'

/**
 * Pantalla con el título arriba (no centrado), como las pestañas del mockup.
 * Si recibe `alRefrescar`, la persona puede deslizar hacia abajo para volver a pedir los datos: aparece el circulito
 * de «actualizando» y se cierra solo cuando termina (haya salido bien o no; los errores los muestra cada pantalla).
 */
export function PantallaPestana({ antetitulo, titulo, subtitulo, derecha, alRefrescar, children }: {
  antetitulo?: string; titulo: string; subtitulo?: string; derecha?: ReactNode; alRefrescar?: () => Promise<unknown>; children: ReactNode
}) {
  const [refrescando, setRefrescando] = useState(false)
  const refrescar = useCallback(async () => {
    setRefrescando(true)
    try {
      await alRefrescar?.()
    } catch {
      // Cada pantalla muestra su propio error; aquí solo se cierra el circulito.
    } finally {
      setRefrescando(false)
    }
  }, [alRefrescar])
  return (
    <SafeAreaView style={estilos.pantalla} edges={['top']}>
      <ScrollView
        testID="pantalla-pestana"
        contentContainerStyle={estilos.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={alRefrescar ? (
          <RefreshControl refreshing={refrescando} onRefresh={refrescar} accessibilityLabel="Actualizando"
            tintColor={colores.marino} colors={[colores.marino]} progressBackgroundColor={colores.blanco} />
        ) : undefined}
      >
        <View style={estilos.cabecera}>
          <View style={{ flex: 1 }}>
            {antetitulo ? <Text style={estilos.antetitulo}>{antetitulo}</Text> : null}
            <Text accessibilityRole="header" style={estilos.titulo}>{titulo}</Text>
            {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
          </View>
          {derecha}
        </View>
        {children}
      </ScrollView>
    </SafeAreaView>
  )
}

export function Tarjeta2({ children, estilo }: { children: ReactNode; estilo?: StyleProp<ViewStyle> }) {
  return <View style={[estilos.tarjeta, estilo]}>{children}</View>
}

const TONOS = {
  ok: { fondo: colores.okFondo, borde: colores.okBorde, texto: colores.ok },
  aviso: { fondo: colores.avisoFondo, borde: colores.avisoBorde, texto: colores.aviso },
  error: { fondo: colores.errorFondo, borde: colores.errorBorde, texto: colores.error },
  neutro: { fondo: colores.lienzo, borde: colores.borde, texto: colores.textoSuave },
  celeste: { fondo: colores.celeste, borde: colores.celesteBorde, texto: colores.marino },
}
export type Tono = keyof typeof TONOS

/** Etiqueta redonda en mayúsculas: «SINCRONIZADO», «ABIERTO», «DENTRO DEL PERÍMETRO». */
export function Chip({ texto, tono = 'neutro', tamano = 'normal' }: { texto: string; tono?: Tono; tamano?: 'normal' | 'chico' }) {
  const t = TONOS[tono]
  return (
    <View style={[estilos.chip, tamano === 'chico' && estilos.chipChico, { backgroundColor: t.fondo, borderColor: t.borde }]}>
      <Text style={[estilos.chipTexto, tamano === 'chico' && { fontSize: 11 }, { color: t.texto }]}>{texto.toUpperCase()}</Text>
    </View>
  )
}

/** Círculo a la izquierda de una fila: lleva un icono de línea (preferible) o, como antes, un símbolo de texto (↓ ↑ ! ◎ ≡). */
export function IconoCirculo({ simbolo, icono, tono = 'celeste', tamano = 38 }: { simbolo?: string; icono?: NombreIcono; tono?: 'celeste' | 'aviso'; tamano?: number }) {
  const aviso = tono === 'aviso'
  const color = aviso ? colores.aviso : colores.marino
  return (
    <View style={{
      width: tamano, height: tamano, borderRadius: tamano / 2, alignItems: 'center', justifyContent: 'center',
      backgroundColor: aviso ? colores.avisoFondo : colores.celeste,
    }}>
      {icono
        ? <Icono nombre={icono} color={color} grosor={2} tamano={Math.round(tamano * 0.52)} />
        : <Text style={{ fontFamily: fuentes.extranegrita, fontSize: tamano > 40 ? 24 : 15, color: aviso ? colores.ambarIcono : colores.marino }}>{simbolo}</Text>}
    </View>
  )
}

/** Rótulo de sección en mayúsculas pequeñas: «ANTERIORES», «HOY · 3 SEP». */
export function Seccion({ texto }: { texto: string }) {
  return <Text accessibilityRole="header" style={estilos.seccion}>{texto.toUpperCase()}</Text>
}

/** Botón ámbar grande de las tarjetas del mockup. */
export function BotonAccion({ titulo, onPress, deshabilitado, cargando, variante = 'ambar' }: {
  titulo: string; onPress: () => void; deshabilitado?: boolean; cargando?: boolean; variante?: 'ambar' | 'blanco'
}) {
  const ambar = variante === 'ambar'
  const inactivo = !!(deshabilitado || cargando)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      disabled={inactivo}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.botonAccion,
        ambar ? estilos.botonAmbar : estilos.botonBlanco,
        { opacity: inactivo ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      <Text style={[estilos.botonAccionTexto, { color: ambar ? colores.ambarTinta : colores.marino }]}>{cargando ? 'Un momento…' : titulo}</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.lienzo },
  contenido: { padding: 20, paddingTop: 8, paddingBottom: 28, gap: 14 },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 2 },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 26, color: colores.marino, letterSpacing: -0.5 },
  antetitulo: { fontFamily: fuentes.seminegrita, fontSize: 13, color: colores.textoSuave, marginBottom: 2 },
  subtitulo: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave, marginTop: 2 },
  tarjeta: { backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.bordeSuave, padding: 20, gap: 14 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  chipChico: { paddingHorizontal: 10, paddingVertical: 5 },
  chipTexto: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 0.3 },
  seccion: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta, paddingLeft: 4, marginTop: 4 },
  botonAccion: { minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  botonAmbar: {
    backgroundColor: colores.ambar, shadowColor: colores.ambar, shadowOpacity: 0.32, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  botonBlanco: { backgroundColor: colores.blanco, borderWidth: 1, borderColor: colores.borde },
  botonAccionTexto: { fontFamily: fuentes.extranegrita, fontSize: 17 },
})
