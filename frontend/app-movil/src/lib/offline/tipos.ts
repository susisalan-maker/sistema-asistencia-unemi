import type { TipoMarcacion } from '../marcacion'

/** Lo que la app arma al marcar: es el cuerpo de POST /marcaciones (menos `origen` y `sin_conexion`, que añade el envío). */
export interface DatosMarcacion {
  id: string
  tipo: TipoMarcacion
  /** La hora del celular al tomar la foto (ISO 8601). Si la marcación se envía después, el servidor usa esta hora. */
  fecha_hora: string
  latitud: number
  longitud: number
  precision_m: number | null
  ubicacion_simulada: boolean
  dispositivo_id: string
  selfie_b64: string
}

/** `pendiente` espera su turno para enviarse; `descartada` el servidor la rechazó y la persona debe enterarse. */
export type EstadoPendiente = 'pendiente' | 'descartada'

/** Una marcación guardada en el celular. La selfie no viene aquí (pesa mucho): se pide aparte con `Almacen.selfie`. */
export interface Pendiente extends Omit<DatosMarcacion, 'selfie_b64'> {
  /** De quién es: en un celular compartido, cada persona solo envía lo suyo. */
  usuario_id: string
  estado: EstadoPendiente
  intentos: number
  /** Por qué falló el último intento (de red) o por qué la rechazó el servidor. */
  ultimo_error: string | null
  creada_en: string
}

/**
 * Dónde se guardan las marcaciones sin enviar y la copia de lo último que supo la app (para poder marcar sin internet).
 * La implementación real usa SQLite dentro del almacenamiento privado de la app; las pruebas usan una en memoria.
 */
export interface Almacen {
  /** Guarda la marcación con su selfie. Si el id ya existe no hace nada (reintentar no duplica). */
  insertar(pendiente: Pendiente, selfie: string): Promise<void>
  /** Las de una persona, de la más antigua a la más reciente por `fecha_hora`, sin la selfie. */
  listar(usuarioId: string): Promise<Pendiente[]>
  selfie(id: string): Promise<string | null>
  /** Suma un intento fallido y guarda el motivo. */
  registrarIntento(id: string, motivo: string | null): Promise<void>
  /** La marca como rechazada y BORRA la selfie (ya no sirve para nada). */
  descartar(id: string, motivo: string): Promise<void>
  /** Borra la marcación y su selfie. */
  eliminar(id: string): Promise<void>
  leerCache(clave: string): Promise<string | null>
  guardarCache(clave: string, valor: string): Promise<void>
}
