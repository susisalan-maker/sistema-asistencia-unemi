/**
 * Un archivo de Excel (.xlsx) de varias hojas, escrito a mano: un .xlsx es un ZIP de archivos XML. Se guarda sin comprimir (método
 * «stored»): los reportes son chicos y así no hace falta ninguna librería. Todo texto va como texto (nunca como fórmula), así que lo que
 * escriba una persona (un nombre, un motivo) no se puede ejecutar al abrir el archivo.
 */

export type Celda = string | number | null
export interface Hoja {
  nombre: string
  /** La primera fila es el encabezado: va en negrita y queda fija al desplazarse. */
  filas: Celda[][]
  /** Ancho de cada columna en caracteres; si falta, se calcula con el contenido. */
  anchos?: number[]
}

const codificador = new TextEncoder()
const bytes = (t: string) => codificador.encode(t)

// ---- ZIP (sin compresión) ----------------------------------------------------------------------------------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Fecha y hora en el formato de 16 bits que usa ZIP (año desde 1980, sin segundos exactos). */
function fechaZip(d: Date): { fecha: number; hora: number } {
  return {
    fecha: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  }
}

export function crearZip(archivos: { nombre: string; contenido: Uint8Array }[], ahora = new Date()): Uint8Array {
  const { fecha, hora } = fechaZip(ahora)
  const partes: Uint8Array[] = []
  const central: Uint8Array[] = []
  let posicion = 0
  const u16 = (v: DataView, o: number, x: number) => v.setUint16(o, x, true)
  const u32 = (v: DataView, o: number, x: number) => v.setUint32(o, x, true)

  for (const a of archivos) {
    const nombre = bytes(a.nombre)
    const crc = crc32(a.contenido)
    const local = new Uint8Array(30 + nombre.length)
    const lv = new DataView(local.buffer)
    u32(lv, 0, 0x04034b50); u16(lv, 4, 20); u16(lv, 6, 0x0800); u16(lv, 8, 0); u16(lv, 10, hora); u16(lv, 12, fecha)
    u32(lv, 14, crc); u32(lv, 18, a.contenido.length); u32(lv, 22, a.contenido.length); u16(lv, 26, nombre.length); u16(lv, 28, 0)
    local.set(nombre, 30)

    const entrada = new Uint8Array(46 + nombre.length)
    const cv = new DataView(entrada.buffer)
    u32(cv, 0, 0x02014b50); u16(cv, 4, 20); u16(cv, 6, 20); u16(cv, 8, 0x0800); u16(cv, 10, 0); u16(cv, 12, hora); u16(cv, 14, fecha)
    u32(cv, 16, crc); u32(cv, 20, a.contenido.length); u32(cv, 24, a.contenido.length); u16(cv, 28, nombre.length)
    u32(cv, 42, posicion)
    entrada.set(nombre, 46)

    partes.push(local, a.contenido)
    central.push(entrada)
    posicion += local.length + a.contenido.length
  }

  const tamanoCentral = central.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const fv = new DataView(fin.buffer)
  u32(fv, 0, 0x06054b50); u16(fv, 8, archivos.length); u16(fv, 10, archivos.length); u32(fv, 12, tamanoCentral); u32(fv, 16, posicion)

  const todo = [...partes, ...central, fin]
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of todo) { salida.set(p, o); o += p.length }
  return salida
}

// ---- XLSX --------------------------------------------------------------------------------------------------------

/** «A», «B», … «Z», «AA»: el nombre de la columna número `n` (desde 0). */
export function letraDeColumna(n: number): string {
  let s = ''
  for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s
  return s
}

// eslint-disable-next-line no-control-regex
const INVALIDOS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g
const xml = (t: string) => t.replace(INVALIDOS, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Excel no admite en el nombre de una hoja `[ ] : * ? / \`, ni más de 31 caracteres, ni nombres repetidos. */
export function nombreDeHoja(nombre: string, usados: Set<string>): string {
  const base = nombre.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Hoja'
  let candidato = base
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = `${base.slice(0, 31 - String(n).length - 1)} ${n}`
  usados.add(candidato.toLowerCase())
  return candidato
}

function xmlHoja(h: Hoja): string {
  const columnas = Math.max(0, ...h.filas.map((f) => f.length))
  const anchos = Array.from({ length: columnas }, (_, c) => {
    if (h.anchos?.[c]) return h.anchos[c]!
    const mayor = Math.max(...h.filas.slice(0, 200).map((f) => String(f[c] ?? '').length), 8)
    return Math.min(60, mayor + 2)
  })
  const cols = columnas ? `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : ''
  const filas = h.filas.map((fila, r) => {
    const celdas = fila.map((v, c) => {
      if (v === null || v === '') return ''
      const ref = `${letraDeColumna(c)}${r + 1}`
      const estilo = r === 0 ? ' s="1"' : ''
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${estilo}><v>${v}</v></c>`
      return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`
    }).join('')
    return `<row r="${r + 1}">${celdas}</row>`
  }).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `${cols}<sheetData>${filas}</sheetData></worksheet>`
}

const ESTILOS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
  + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FF1B2A6E"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>'

export function crearXlsx(hojas: Hoja[], ahora = new Date()): Uint8Array {
  if (hojas.length === 0) throw new Error('Un libro de Excel necesita al menos una hoja')
  const usados = new Set<string>()
  const nombres = hojas.map((h) => nombreDeHoja(h.nombre, usados))
  const cabecera = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: cabecera + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        + hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
        + '</Types>',
    },
    {
      nombre: '_rels/.rels',
      contenido: cabecera + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: cabecera + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
        + nombres.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>',
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: cabecera + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
        + `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', contenido: ESTILOS },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: xmlHoja(h) })),
  ].map((a) => ({ nombre: a.nombre, contenido: bytes(a.contenido) }))
  return crearZip(archivos, ahora)
}

export const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
