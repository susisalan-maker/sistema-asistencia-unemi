import * as SQLite from 'expo-sqlite'
import { PREFIJO, cifrarFoto, descifrarFoto, estaCifrada } from './cifradoFoto'
import type { Almacen, Pendiente, RelojDeMarcacion } from './tipos'

/**
 * Las marcaciones hechas sin conexión viven en una base SQLite propia de la app (almacenamiento privado: otras apps
 * no la ven, y `allowBackup` está apagado en app.json para que tampoco viaje en copias de seguridad).
 * La selfie se guarda CIFRADA (AES-256-GCM, ver `cifradoFoto.ts`) dentro de la misma fila y se pone en NULL en cuanto se envía
 * o se rechaza. Se descifra solo en memoria, al pedirla para enviarla.
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
    creada_en          TEXT NOT NULL,
    reloj              TEXT,
    firma              TEXT
  );
  CREATE INDEX IF NOT EXISTS pendientes_usuario_idx ON marcaciones_pendientes (usuario_id, fecha_hora);
  CREATE TABLE IF NOT EXISTS cache (
    clave TEXT PRIMARY KEY NOT NULL,
    valor TEXT NOT NULL
  );
`

/** Las columnas de la lista: todas menos la selfie. */
export const COLUMNAS = 'id, usuario_id, tipo, fecha_hora, latitud, longitud, precision_m, ubicacion_simulada, dispositivo_id, estado, intentos, ultimo_error, creada_en, reloj, firma'

/**
 * Columnas que se añadieron después de la primera versión del esquema. `CREATE TABLE IF NOT EXISTS` no las agrega a un
 * celular que ya tiene la tabla, así que se añaden aquí (una sola vez, sin tocar las marcaciones guardadas).
 */
export const COLUMNAS_NUEVAS: { nombre: string; definicion: string }[] = [
  { nombre: 'reloj', definicion: 'TEXT' },
  { nombre: 'firma', definicion: 'TEXT' },
]

type Fila = Omit<Pendiente, 'ubicacion_simulada' | 'reloj'> & { ubicacion_simulada: number; reloj: string | null }
function leerReloj(texto: string | null): RelojDeMarcacion | null {
  if (!texto) return null
  try {
    return JSON.parse(texto) as RelojDeMarcacion
  } catch {
    return null   // una prueba ilegible equivale a no tenerla: la marcación se envía igual, con la hora del celular
  }
}
const aPendiente = (f: Fila): Pendiente => ({ ...f, ubicacion_simulada: f.ubicacion_simulada === 1, reloj: leerReloj(f.reloj) })

export class AlmacenSqlite implements Almacen {
  private abierta: Promise<SQLite.SQLiteDatabase> | null = null

  private bd() {
    this.abierta ??= (async () => {
      const bd = await SQLite.openDatabaseAsync(NOMBRE_BD)
      await bd.execAsync(ESQUEMA)
      const existentes = await bd.getAllAsync<{ name: string }>('PRAGMA table_info(marcaciones_pendientes)')
      for (const c of COLUMNAS_NUEVAS) {
        if (!existentes.some((e) => e.name === c.nombre)) {
          await bd.execAsync(`ALTER TABLE marcaciones_pendientes ADD COLUMN ${c.nombre} ${c.definicion}`)
        }
      }
      await this.cifrarLasQueQuedaronSinCifrar(bd)
      return bd
    })().catch((e) => {
      this.abierta = null   // si falló al abrir, el próximo intento vuelve a probar
      throw e
    })
    return this.abierta
  }

  /** Fotos guardadas por una versión anterior de la app (sin cifrar): se cifran la primera vez que se abre la base. */
  private async cifrarLasQueQuedaronSinCifrar(bd: SQLite.SQLiteDatabase) {
    try {
      const filas = await bd.getAllAsync<{ id: string; selfie_b64: string }>(
        `SELECT id, selfie_b64 FROM marcaciones_pendientes WHERE selfie_b64 IS NOT NULL AND selfie_b64 NOT LIKE '${PREFIJO}%'`,
      )
      for (const f of filas) {
        await bd.runAsync('UPDATE marcaciones_pendientes SET selfie_b64 = ? WHERE id = ?', [await cifrarFoto(f.selfie_b64, f.id), f.id])
      }
    } catch (e) {
      // Sin clave no se pierde nada: quedan como estaban y se cifran en la próxima apertura (siguen enviándose).
      console.warn('No se pudieron cifrar las fotos guardadas antes', e)
    }
  }

  async insertar(p: Pendiente, selfie: string) {
    // Si no se puede cifrar, la marcación NO se guarda: preferimos avisar a dejar una foto en claro en el celular.
    const cifrada = await cifrarFoto(selfie, p.id)
    const bd = await this.bd()
    await bd.runAsync(
      `INSERT OR IGNORE INTO marcaciones_pendientes
         (id, usuario_id, tipo, fecha_hora, latitud, longitud, precision_m, ubicacion_simulada, dispositivo_id,
          selfie_b64, estado, intentos, ultimo_error, creada_en, reloj, firma)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.usuario_id, p.tipo, p.fecha_hora, p.latitud, p.longitud, p.precision_m, p.ubicacion_simulada ? 1 : 0,
        p.dispositivo_id, cifrada, p.estado, p.intentos, p.ultimo_error, p.creada_en, p.reloj ? JSON.stringify(p.reloj) : null, p.firma ?? null],
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
    if (!f?.selfie_b64) return null
    if (!estaCifrada(f.selfie_b64)) return f.selfie_b64   // la dejó una versión anterior y aún no se alcanzó a cifrar
    try {
      return await descifrarFoto(f.selfie_b64, id)
    } catch (e) {
      // Alterada o sin su clave: no se envía una foto que no se puede comprobar. El sincronizador la marca como perdida.
      console.warn('No se pudo descifrar la foto de la marcación', id, e)
      return null
    }
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
