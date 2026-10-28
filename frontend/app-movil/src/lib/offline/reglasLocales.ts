import { hoyLocal, TIPOS, type EstadoHoy, type MarcacionResumen } from '../marcacion'
import type { Pendiente } from './tipos'

/** Cómo se ve en pantalla una marcación que aún no se envió. */
export function comoMarcacion(p: Pendiente): MarcacionResumen {
  return {
    id: p.id, tipo: p.tipo, fecha_hora: p.fecha_hora, sede_id: null, bloque_id: null, origen: 'app',
    verificacion: 'pendiente', sin_conexion: true, en_cola: true,
  }
}

/**
 * Suma a lo último que se supo del servidor las marcaciones de hoy que siguen en el celular, y calcula cuál toca ahora.
 * Es solo para mostrar y para decidir qué botón ofrecer sin internet: el servidor vuelve a validar la secuencia al recibirlas.
 *
 * `base` puede ser de otro día (la copia guardada ayer): en ese caso hoy no se conoce ninguna marcación del servidor.
 */
const NOMBRES_DIA: Record<number, string> = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' }

/**
 * Si la copia guardada es de otro día, «hoy es laborable» hay que volver a calcularlo con el día de la semana de hoy.
 * Sin internet no se conocen los feriados: ahí solo cuenta el horario de la persona (el servidor igual los vigila).
 */
function diaLaborableDe(dias: number[], hoy: string): Pick<EstadoHoy, 'dia_laborable' | 'motivo_no_laborable'> {
  const [y, m, d] = hoy.split('-').map(Number)
  const dia = new Date(y, m - 1, d).getDay() || 7   // 1 = lunes … 7 = domingo
  if (dias.includes(dia)) return { dia_laborable: true, motivo_no_laborable: null }
  return { dia_laborable: false, motivo_no_laborable: `Hoy ${NOMBRES_DIA[dia]} no es un día laborable para ti.` }
}

export function aplicarPendientes(base: EstadoHoy, pendientes: Pendiente[], hoy: string = hoyLocal()): EstadoHoy {
  const locales = pendientes
    .filter((p) => p.estado === 'pendiente' && hoyLocal(new Date(p.fecha_hora)) === hoy)
    .map(comoMarcacion)
  if (base.fecha === hoy && locales.length === 0) return base

  const delServidor = base.fecha === hoy ? base.marcaciones : []
  const marcaciones = [...delServidor, ...locales].sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
  const ultimaLocal = locales.at(-1)
  return {
    ...base,
    ...(base.fecha !== hoy && base.dias_laborables ? diaLaborableDe(base.dias_laborables, hoy) : {}),
    fecha: hoy,
    marcaciones,
    siguiente: TIPOS[marcaciones.length]?.tipo ?? null,
    ultima: ultimaLocal && (!base.ultima || ultimaLocal.fecha_hora > base.ultima.fecha_hora) ? ultimaLocal : base.ultima,
  }
}
