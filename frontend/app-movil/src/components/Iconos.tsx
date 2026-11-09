import Svg, { Circle, Path } from 'react-native-svg'

/** Iconos de línea (los mismos trazos del panel web) para la barra inferior y las filas de marcaciones. Son decorativos: el nombre va en la etiqueta. */
export type NombreIcono = 'inicio' | 'historial' | 'avisos' | 'perfil' | 'entrada' | 'salida' | 'almuerzo' | 'alerta' | 'subida' | 'abajo' | 'exportar'

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
      {nombre === 'entrada' && (
        <>
          <Path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <Path d="M10 17l5-5-5-5" />
          <Path d="M15 12H3" />
        </>
      )}
      {nombre === 'salida' && (
        <>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <Path d="M16 17l5-5-5-5" />
          <Path d="M21 12H9" />
        </>
      )}
      {nombre === 'almuerzo' && (
        <>
          <Path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
          <Path d="M7 2v20" />
          <Path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
        </>
      )}
      {nombre === 'alerta' && (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M12 8v5" />
          <Path d="M12 16.5h.01" />
        </>
      )}
      {nombre === 'abajo' && <Path d="M6 9l6 6 6-6" />}
      {nombre === 'exportar' && (
        <>
          <Path d="M12 15V3" />
          <Path d="M7 8l5-5 5 5" />
          <Path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </>
      )}
      {nombre === 'subida' && (
        <>
          <Path d="M12 19V5" />
          <Path d="M5 12l7-7 7 7" />
        </>
      )}
    </Svg>
  )
}
