import * as SQLite from 'expo-sqlite'
import type { Almacen, Pendiente } from './tipos'

/**
 * Las marcaciones hechas sin conexión viven en una base SQLite propia de la app (almacenamiento privado: otras apps
 * no la ven, y `allowBackup` está apagado en app.json para que tampoco viaje en copias de seguridad).
 * La selfie se guarda en base64 dentro de la misma fila y se pone en NULL en cuanto se envía o se rechaza.
 */
const NOMBRE_BD = 'marcaciones-sin-conexion.db'

export const ESQUEMA = `
  CREATE TABLE IF NOT EXISTS marcaciones_pendientes (
    id                 TEXT PRIMARY KEY NOT NULL,
    usuario_id         TEXT NOT NULL,
    tipo               TEXT NOT NULL,
    fecha_hora         TEXT NOT NULL,
    latitud            REAL NOT NULL,
    longitud           REAL NOT NULL,
    precision_m        REAL,
    ubicacion_simulada INTEGER NOT NULL DEFAULT 0,
    dispositivo_id     TEXT NOT NULL,
    selfie_b64         TEXT,
    estado             TEXT NOT NULL DEFAULT 'pendiente',
    intentos           INTEGER NOT NULL DEFAULT 0,
    ultimo_error       TEXT,
    creada_en          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS pendientes_usuario_idx ON marcaciones_pendientes (usuario_id, fecha_hora);
  CREATE TABLE IF NOT EXISTS cache (
    clave TEXT PRIMARY KEY NOT NULL,
    valor TEXT NOT NULL
  );
`

/** Las columnas de la lista: todas menos la selfie. */
export const COLUMNAS = 'id, usuario_id, tipo, fecha_hora, latitud, longitud, precision_m, ubicacion_simulada, dispositivo_id, estado, intentos, ultimo_error, creada_en'

type Fila = Omit<Pendiente, 'ubicacion_simulada'> & { ubicacion_simulada: number }
const aPendiente = (f: Fila): Pendiente => ({ ...f, ubicacion_simulada: f.ubicacion_simulada === 1 })

export class AlmacenSqlite implements Almacen {
  private abierta: Promise<SQLite.SQLiteDatabase> | null = null

  private bd() {
    this.abierta ??= (async () => {
      const bd = await SQLite.openDatabaseAsync(NOMBRE_BD)
      await bd.execAsync(ESQUEMA)
      return bd
    })().catch((e) => {
      this.abierta = null   // si falló al abrir, el próximo intento vuelve a probar
      throw e
    })
    return this.abierta
  }

  async insertar(p: Pendiente, selfie: string) {
    const bd = await this.bd()
    await bd.runAsync(
      `INSERT OR IGNORE INTO marcaciones_pendientes
         (id, usuario_id, tipo, fecha_hora, latitud, longitud, precision_m, ubicacion_simulada, dispositivo_id,
          selfie_b64, estado, intentos, ultimo_error, creada_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.usuario_id, p.tipo, p.fecha_hora, p.latitud, p.longitud, p.precision_m, p.ubicacion_simulada ? 1 : 0,
        p.dispositivo_id, selfie, p.estado, p.intentos, p.ultimo_error, p.creada_en],
    )
  }

  async listar(usuarioId: string) {
    const bd = await this.bd()
    const filas = await bd.getAllAsync<Fila>(
      `SELECT ${COLUMNAS} FROM marcaciones_pendientes WHERE usuario_id = ? ORDER BY fecha_hora ASC, creada_en ASC`,
      [usuarioId],
    )
    return filas.map(aPendiente)
  }

  async selfie(id: string) {
    const bd = await this.bd()
    const f = await bd.getFirstAsync<{ selfie_b64: string | null }>('SELECT selfie_b64 FROM marcaciones_pendientes WHERE id = ?', [id])
    return f?.selfie_b64 ?? null
  }

  async registrarIntento(id: string, motivo: string | null) {
    const bd = await this.bd()
    await bd.runAsync('UPDATE marcaciones_pendientes SET intentos = intentos + 1, ultimo_error = ? WHERE id = ?', [motivo, id])
  }

  async descartar(id: string, motivo: string) {
    const bd = await this.bd()
    await bd.runAsync("UPDATE marcaciones_pendientes SET estado = 'descartada', ultimo_error = ?, selfie_b64 = NULL WHERE id = ?", [motivo, id])
  }

  async eliminar(id: string) {
    const bd = await this.bd()
    await bd.runAsync('DELETE FROM marcaciones_pendientes WHERE id = ?', [id])
  }

  async leerCache(clave: string) {
    const bd = await this.bd()
    const f = await bd.getFirstAsync<{ valor: string }>('SELECT valor FROM cache WHERE clave = ?', [clave])
    return f?.valor ?? null
  }

  async guardarCache(clave: string, valor: string) {
    const bd = await this.bd()
    await bd.runAsync('INSERT OR REPLACE INTO cache (clave, valor) VALUES (?, ?)', [clave, valor])
  }
}

let unico: Almacen | null = null
/** El almacén de la app (uno solo). Las pruebas reemplazan este módulo entero (ver jest.setup.ts). */
export function obtenerAlmacen(): Almacen {
  unico ??= new AlmacenSqlite()
  return unico
}
