import type { RespuestaMarcar } from '../marcacion'
import type { Pendiente } from './tipos'

/** Una marcación guardada en el celular, para las pruebas. `hora` es la hora de Ecuador del 15 de octubre de 2026. */
export function pendiente(id: string, tipo: Pendiente['tipo'], hora: string, extra: Partial<Pendiente> = {}): Pendiente {
  return {
    id, usuario_id: 'u-1', tipo, fecha_hora: `2026-10-15T${hora}:00-05:00`, latitud: -2.14, longitud: -79.6, precision_m: 8,
    ubicacion_simulada: false, dispositivo_id: 'cel-1', estado: 'pendiente', intentos: 0, ultimo_error: null,
    creada_en: `2026-10-15T${hora}:30-05:00`, ...extra,
  }
}

export const respuestaOk = (id: string, tipo: Pendiente['tipo'] = 'ingreso'): RespuestaMarcar => ({
  marcacion: { id, tipo, fecha_hora: '2026-10-15T13:00:00+00:00', sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada', sin_conexion: true },
  anomalias: [], reintento: false,
})
