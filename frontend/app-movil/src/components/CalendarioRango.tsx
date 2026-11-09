import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { diaDelMes, diasDelRango, MAX_DIAS_EXPORTACION, mesLargo } from '../lib/exportar'
import { colores, fuentes } from '../theme'

const SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Calendario de un mes para elegir un rango de días. Primer toque = día inicial, segundo = día final.
 * Los días futuros y los que pasarían del máximo de días seguidos quedan bloqueados. Un tercer toque empieza de nuevo.
 */
export function CalendarioRango({ desde, hasta, hoy, alCambiar }: {
  desde: string | null; hasta: string | null; hoy: string; alCambiar: (desde: string | null, hasta: string | null) => void
}) {
  const [anioHoy, mesHoy] = hoy.split('-').map(Number) as [number, number]
  const [mostrado, setMostrado] = useState<{ a: number; m: number }>(() => {
    const base = (hasta ?? desde ?? hoy).split('-').map(Number) as [number, number]
    return { a: base[0], m: base[1] }
  })
  const esElMesActual = mostrado.a === anioHoy && mostrado.m === mesHoy
  const mover = (delta: number) => {
    const f = new Date(Date.UTC(mostrado.a, mostrado.m - 1 + delta, 1))
    setMostrado({ a: f.getUTCFullYear(), m: f.getUTCMonth() + 1 })
  }

  const primero = new Date(Date.UTC(mostrado.a, mostrado.m - 1, 1))
  const diasDelMesN = new Date(Date.UTC(mostrado.a, mostrado.m, 0)).getUTCDate()
  const hueco = (primero.getUTCDay() + 6) % 7   // lunes = 0
  const celdas: (number | null)[] = [...Array(hueco).fill(null), ...Array.from({ length: diasDelMesN }, (_, i) => i + 1)]
  while (celdas.length % 7 !== 0) celdas.push(null)

  const esperandoFinal = !!desde && !hasta
  const bloqueado = (iso: string) => {
    if (iso > hoy) return true
    if (esperandoFinal && iso >= desde! && diasDelRango(desde!, iso) > MAX_DIAS_EXPORTACION) return true
    return false
  }
  const tocar = (iso: string) => {
    if (!desde || hasta || iso < desde) alCambiar(iso, null)
    else alCambiar(desde, iso)
  }

  return (
    <View style={estilos.caja}>
      <View style={estilos.encabezado}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" onPress={() => mover(-1)} style={estilos.flecha}>
          <Text style={estilos.flechaTexto}>‹</Text>
        </Pressable>
        <Text accessibilityRole="header" style={estilos.mes}>{mesLargo(mostrado.a, mostrado.m)}</Text>
        <Pressable
          accessibilityRole="button" accessibilityLabel="Mes siguiente" accessibilityState={{ disabled: esElMesActual }}
          disabled={esElMesActual} onPress={() => mover(1)} style={[estilos.flecha, esElMesActual && { opacity: 0.3 }]}
        >
          <Text style={estilos.flechaTexto}>›</Text>
        </Pressable>
      </View>
      <View style={estilos.fila}>
        {SEMANA.map((s, i) => <Text key={i} style={estilos.semana}>{s}</Text>)}
      </View>
      {Array.from({ length: celdas.length / 7 }, (_, fila) => (
        <View key={fila} style={estilos.fila}>
          {celdas.slice(fila * 7, fila * 7 + 7).map((dia, i) => {
            if (dia === null) return <View key={i} style={estilos.celda} />
            const iso = `${mostrado.a}-${pad(mostrado.m)}-${pad(dia)}`
            const apagado = bloqueado(iso)
            const extremo = iso === desde || iso === hasta
            const enMedio = !!desde && !!hasta && iso > desde && iso < hasta
            return (
              <View key={i} style={[estilos.celda, enMedio && estilos.celdaMedio]}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${diaDelMes(iso)}${iso === desde ? ', día inicial' : iso === hasta ? ', día final' : ''}`}
                  accessibilityState={{ disabled: apagado, selected: extremo || enMedio }}
                  disabled={apagado} onPress={() => tocar(iso)}
                  style={[estilos.dia, extremo && estilos.diaExtremo]}
                >
                  <Text style={[estilos.diaTexto, apagado && { color: colores.iconoInactivo }, extremo && { color: colores.blanco }]}>{dia}</Text>
                </Pressable>
              </View>
            )
          })}
        </View>
      ))}
    </View>
  )
}

const estilos = StyleSheet.create({
  caja: { backgroundColor: colores.blanco, borderRadius: 16, borderWidth: 1, borderColor: colores.bordeSuave, padding: 10 },
  encabezado: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  flecha: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  flechaTexto: { fontFamily: fuentes.extranegrita, fontSize: 26, color: colores.marino, lineHeight: 30 },
  mes: { fontFamily: fuentes.extranegrita, fontSize: 15, color: colores.marino, textTransform: 'capitalize' },
  fila: { flexDirection: 'row' },
  semana: { flex: 1, textAlign: 'center', fontFamily: fuentes.extranegrita, fontSize: 12, color: colores.etiqueta, paddingVertical: 4 },
  celda: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' },
  celdaMedio: { backgroundColor: colores.celeste },
  dia: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  diaExtremo: { backgroundColor: colores.marino },
  diaTexto: { fontFamily: fuentes.negrita, fontSize: 14, color: colores.marino },
})
