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
    fecha: hoy,
    marcaciones,
    siguiente: TIPOS[marcaciones.length]?.tipo ?? null,
    ultima: ultimaLocal && (!base.ultima || ultimaLocal.fecha_hora > base.ultima.fecha_hora) ? ultimaLocal : base.ultima,
  }
}
