export interface Sede {
  id: string
  nombre: string
  latitud: number
  longitud: number
  radio_metros: number
  permite_fuera_geocerca: boolean
  activa: boolean
}

export interface Bloque {
  id: string
  sede_id: string
  nombre: string
  latitud: number
  longitud: number
  radio_metros: number
  activo: boolean
}
