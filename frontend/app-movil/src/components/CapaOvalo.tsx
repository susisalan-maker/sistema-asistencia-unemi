import { useState } from 'react'
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native'
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg'

/** Azul noche del color de la app, con la opacidad justa para que el rostro sea lo único que destaque. */
export const FONDO_FUERA_DEL_OVALO = 'rgba(10,16,44,0.8)'
/** El óvalo es un poco más alto que ancho, como un rostro. */
const PROPORCION = 1.28
const ANCHO_MAXIMO = 340
const HALO = 9

interface Props {
  /** Alto máximo del óvalo (por ejemplo, el espacio libre entre el título y la hoja de abajo). */
  maxAlto?: number
  /** Dónde queda el centro del óvalo, de arriba hacia abajo. Por omisión, el centro de la capa. */
  centroY?: number
}

/**
 * Capa que se pone encima de la cámara: lo de afuera se oscurece en el azul de la app y dentro del óvalo la imagen queda
 * tal cual, nítida, con un borde blanco y un halo tenue. El óvalo ocupa casi todo el ancho.
 * Solo es diseño (una guía para centrar el rostro): no detecta ni valida nada, y no recibe toques.
 */
export function CapaOvalo({ maxAlto, centroY }: Props) {
  const [medida, setMedida] = useState<{ w: number; h: number } | null>(null)
  const alMedir = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout
    setMedida((m) => (m && m.w === width && m.h === height ? m : { w: width, h: height }))
  }

  let figura: { cx: number; cy: number; rx: number; ry: number } | null = null
  if (medida && medida.w > 0 && medida.h > 0) {
    let ancho = Math.min(medida.w * 0.82, ANCHO_MAXIMO)
    let alto = ancho * PROPORCION
    const limite = Math.min(maxAlto ?? Infinity, medida.h * 0.94) - 2 * HALO
    if (alto > limite) { alto = limite; ancho = alto / PROPORCION }
    const ry = alto / 2
    const cy = Math.min(Math.max(centroY ?? medida.h / 2, ry + HALO), medida.h - ry - HALO)
    figura = { cx: medida.w / 2, cy, rx: ancho / 2, ry }
  }

  return (
    <View testID="capa-ovalo" pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={alMedir} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {medida && figura && (
        <Svg width={medida.w} height={medida.h}>
          <Defs>
            <Mask id="hueco-ovalo">
              <Rect x={0} y={0} width={medida.w} height={medida.h} fill="white" />
              <Ellipse cx={figura.cx} cy={figura.cy} rx={figura.rx} ry={figura.ry} fill="black" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={medida.w} height={medida.h} fill={FONDO_FUERA_DEL_OVALO} mask="url(#hueco-ovalo)" />
          <Ellipse cx={figura.cx} cy={figura.cy} rx={figura.rx + HALO} ry={figura.ry + HALO} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={1.5} />
          <Ellipse cx={figura.cx} cy={figura.cy} rx={figura.rx} ry={figura.ry} testID="ovalo-borde" fill="none" stroke="#ffffff" strokeWidth={3} />
        </Svg>
      )}
    </View>
  )
}
