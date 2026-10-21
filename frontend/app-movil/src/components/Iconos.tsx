import Svg, { Circle, Path } from 'react-native-svg'

/** Iconos de línea (los mismos trazos del panel web) para la barra inferior. Son decorativos: el nombre va en la etiqueta. */
export type NombreIcono = 'inicio' | 'historial' | 'avisos' | 'perfil'

export function Icono({ nombre, color, grosor = 1.9, tamano = 24 }: { nombre: NombreIcono; color: string; grosor?: number; tamano?: number }) {
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor}
      strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {nombre === 'inicio' && (
        <>
          <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />
          <Path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </>
      )}
      {nombre === 'historial' && (
        <>
          <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <Path d="M3 3v5h5" />
          <Path d="M12 7v5l4 2" />
        </>
      )}
      {nombre === 'avisos' && (
        <>
          <Path d="M10.268 21a2 2 0 0 0 3.464 0" />
          <Path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" />
        </>
      )}
      {nombre === 'perfil' && (
        <>
          <Path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <Circle cx="12" cy="7" r="4" />
        </>
      )}
    </Svg>
  )
}
