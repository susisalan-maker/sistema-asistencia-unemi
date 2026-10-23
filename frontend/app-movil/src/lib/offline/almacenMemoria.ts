import type { Almacen, Pendiente } from './tipos'

/** Un `Almacen` en memoria. Lo usan las pruebas; no se usa en la app. */
export class AlmacenMemoria implements Almacen {
  filas = new Map<string, { pendiente: Pendiente; selfie: string | null }>()
  cache = new Map<string, string>()

  async insertar(pendiente: Pendiente, selfie: string) {
    if (!this.filas.has(pendiente.id)) this.filas.set(pendiente.id, { pendiente: { ...pendiente }, selfie })
  }

  async listar(usuarioId: string) {
    return [...this.filas.values()]
      .map((f) => ({ ...f.pendiente }))
      .filter((p) => p.usuario_id === usuarioId)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora) || a.creada_en.localeCompare(b.creada_en))
  }

  async selfie(id: string) {
    return this.filas.get(id)?.selfie ?? null
  }

  async registrarIntento(id: string, motivo: string | null) {
    const f = this.filas.get(id)
    if (f) { f.pendiente.intentos += 1; f.pendiente.ultimo_error = motivo }
  }

  async descartar(id: string, motivo: string) {
    const f = this.filas.get(id)
    if (f) { f.pendiente.estado = 'descartada'; f.pendiente.ultimo_error = motivo; f.selfie = null }
  }

  async eliminar(id: string) {
    this.filas.delete(id)
  }

  async leerCache(clave: string) {
    return this.cache.get(clave) ?? null
  }

  async guardarCache(clave: string, valor: string) {
    this.cache.set(clave, valor)
  }
}
