import type { ReactNode } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type PressableProps, type TextInputProps,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colores, fuentes } from '../theme'

export function Logo({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <View style={estilos.logo}>
      <View style={estilos.logoCirculo}><Text style={estilos.logoSiglas}>UA</Text></View>
      <Text style={[estilos.logoTexto, { color: oscuro ? colores.blanco : colores.marino }]}>
        {'Asistencia\nUniversitaria'}
      </Text>
    </View>
  )
}

/** Pantalla con fondo del mockup, área segura y teclado que no tapa los campos. */
export function Pantalla({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={estilos.pantalla}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Tarjeta({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <View style={estilos.tarjeta}>
      <Text accessibilityRole="header" style={estilos.titulo}>{titulo}</Text>
      {subtitulo ? <Text style={estilos.subtitulo}>{subtitulo}</Text> : null}
      <View style={{ marginTop: 20, gap: 16 }}>{children}</View>
    </View>
  )
}

export function Campo({ etiqueta, ...resto }: TextInputProps & { etiqueta: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={estilos.etiqueta}>{etiqueta.toUpperCase()}</Text>
      <TextInput
        accessibilityLabel={etiqueta}
        placeholderTextColor={colores.placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        {...resto}
        style={[estilos.campo, resto.multiline && estilos.campoMultilinea]}
      />
    </View>
  )
}

export function Boton({
  titulo, cargando, variante = 'ambar', ...resto
}: Omit<PressableProps, 'children'> & { titulo: string; cargando?: boolean; variante?: 'ambar' | 'marino' | 'borde' }) {
  const fondo = { ambar: colores.ambar, marino: colores.marino, borde: colores.blanco }[variante]
  const color = { ambar: colores.ambarTinta, marino: colores.blanco, borde: colores.marino }[variante]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      {...resto}
      disabled={cargando || resto.disabled}
      style={({ pressed }) => [
        estilos.boton,
        { backgroundColor: fondo, opacity: cargando || resto.disabled ? 0.6 : pressed ? 0.85 : 1 },
        variante === 'borde' && { borderWidth: 1, borderColor: colores.borde },
      ]}
    >
      {cargando ? <ActivityIndicator color={color} /> : <Text style={[estilos.botonTexto, { color }]}>{titulo}</Text>}
    </Pressable>
  )
}

export function Enlace({ titulo, onPress }: { titulo: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} hitSlop={8}>
      <Text style={estilos.enlace}>{titulo}</Text>
    </Pressable>
  )
}

const tonos = {
  error: { fondo: colores.errorFondo, borde: colores.errorBorde, texto: colores.error },
  ok: { fondo: colores.okFondo, borde: colores.okBorde, texto: colores.ok },
  aviso: { fondo: colores.avisoFondo, borde: colores.avisoBorde, texto: colores.aviso },
}

export function Aviso({ tipo, children }: { tipo: keyof typeof tonos; children: ReactNode }) {
  const t = tonos[tipo]
  return (
    <View accessibilityRole="alert" style={[estilos.aviso, { backgroundColor: t.fondo, borderColor: t.borde }]}>
      <Text style={[estilos.avisoTexto, { color: t.texto }]}>{children}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.lienzo },
  contenido: { flexGrow: 1, padding: 20, justifyContent: 'center', gap: 24 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoCirculo: { width: 40, height: 40, borderRadius: 20, backgroundColor: colores.ambar, alignItems: 'center', justifyContent: 'center' },
  logoSiglas: { fontFamily: fuentes.extranegrita, fontSize: 14, color: colores.ambarTinta },
  logoTexto: { fontFamily: fuentes.extranegrita, fontSize: 14, lineHeight: 17 },
  tarjeta: {
    backgroundColor: colores.blanco, borderRadius: 22, borderWidth: 1, borderColor: colores.bordeSuave, padding: 24,
    shadowColor: colores.marino, shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 3,
  },
  titulo: { fontFamily: fuentes.extranegrita, fontSize: 25, color: colores.marino },
  subtitulo: { fontFamily: fuentes.seminegrita, fontSize: 14, color: colores.textoSuave, marginTop: 6 },
  etiqueta: { fontFamily: fuentes.extranegrita, fontSize: 12, letterSpacing: 1, color: colores.etiqueta },
  campo: {
    height: 52, borderRadius: 13, borderWidth: 1, borderColor: colores.borde, backgroundColor: colores.lienzo,
    paddingHorizontal: 16, fontSize: 15, fontFamily: fuentes.seminegrita, color: colores.marino,
  },
  campoMultilinea: { height: undefined, minHeight: 130, paddingTop: 14, paddingBottom: 14, textAlignVertical: 'top' },
  boton: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  botonTexto: { fontFamily: fuentes.extranegrita, fontSize: 16 },
  enlace: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.marino, textAlign: 'center', textDecorationLine: 'underline' },
  aviso: { borderRadius: 12, borderWidth: 1, padding: 12 },
  avisoTexto: { fontFamily: fuentes.seminegrita, fontSize: 14, lineHeight: 20 },
})
