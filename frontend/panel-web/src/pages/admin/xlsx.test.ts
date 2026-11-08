import { describe, expect, it } from 'vitest'
import { crc32, crearXlsx, crearZip, letraDeColumna, nombreDeHoja } from './xlsx'

const texto = (b: Uint8Array) => new TextDecoder().decode(b)

/** Lee un ZIP «stored» por su directorio central: nombre → contenido (y comprueba el CRC de cada uno). */
function leerZip(zip: Uint8Array): Map<string, string> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  const fin = zip.length - 22
  expect(v.getUint32(fin, true)).toBe(0x06054b50)
  const cantidad = v.getUint16(fin + 10, true)
  let o = v.getUint32(fin + 16, true)
  const salida = new Map<string, string>()
  for (let i = 0; i < cantidad; i++) {
    expect(v.getUint32(o, true)).toBe(0x02014b50)
    const crc = v.getUint32(o + 16, true)
    const tam = v.getUint32(o + 20, true)
    const largoNombre = v.getUint16(o + 28, true)
    const local = v.getUint32(o + 42, true)
    const nombre = texto(zip.slice(o + 46, o + 46 + largoNombre))
    const datos = zip.slice(local + 30 + largoNombre, local + 30 + largoNombre + tam)
    expect(crc32(datos)).toBe(crc)
    salida.set(nombre, texto(datos))
    o += 46 + largoNombre
  }
  return salida
}

describe('crc32', () => {
  it('coincide con el valor de referencia del estándar', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('letraDeColumna', () => {
  it('A…Z, AA… como Excel', () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(letraDeColumna)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })
})

describe('nombreDeHoja', () => {
  it('quita lo que Excel no admite, recorta a 31 y no repite', () => {
    const usados = new Set<string>()
    expect(nombreDeHoja('Casos [2026]: a/b?', usados)).toBe('Casos 2026 a b')
    expect(nombreDeHoja('x'.repeat(40), usados)).toHaveLength(31)
    expect(nombreDeHoja('casos 2026 a b', usados)).toBe('casos 2026 a b 2')
    expect(nombreDeHoja('   ', usados)).toBe('Hoja')
  })
})

describe('crearZip', () => {
  it('guarda cada archivo tal cual, con su CRC, y se puede leer de vuelta', () => {
    const zip = crearZip([{ nombre: 'a.txt', contenido: new TextEncoder().encode('hola') }, { nombre: 'dir/b.txt', contenido: new TextEncoder().encode('añá') }])
    const archivos = leerZip(zip)
    expect([...archivos.keys()]).toEqual(['a.txt', 'dir/b.txt'])
    expect(archivos.get('dir/b.txt')).toBe('añá')
  })
})

describe('crearXlsx', () => {
  const libro = () => leerZip(crearXlsx([
    { nombre: 'Resumen', filas: [['Dato', 'Valor'], ['Casos', 46], ['Nota', '<b>=SUMA(A1)</b> & "x"'], ['Vacío', null]] },
    { nombre: 'Casos', filas: [['Caso'], ['A-1']] },
  ], new Date(2026, 10, 5, 10, 0, 0)))

  it('trae las partes de un libro de Excel y una hoja por cada una', () => {
    const l = libro()
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      expect(l.has(n)).toBe(true)
    }
    expect(l.get('xl/workbook.xml')).toContain('name="Resumen"')
    expect(l.get('xl/workbook.xml')).toContain('name="Casos"')
  })

  it('los números van como números y el texto como texto: nada se vuelve fórmula ni HTML', () => {
    const h = libro().get('xl/worksheets/sheet1.xml')!
    expect(h).toContain('<c r="B2"><v>46</v></c>')
    expect(h).toContain('&lt;b&gt;=SUMA(A1)&lt;/b&gt; &amp; &quot;x&quot;')
    expect(h).not.toContain('<f>')
    expect(h).toContain('t="inlineStr"')
    expect(h).not.toContain('r="B4"')   // lo vacío no se escribe
  })

  it('el encabezado va con estilo y queda fijo al desplazarse', () => {
    const h = libro().get('xl/worksheets/sheet1.xml')!
    expect(h).toContain('<c r="A1" t="inlineStr" s="1">')
    expect(h).toContain('state="frozen"')
  })

  it('sin hojas no se puede armar un libro', () => {
    expect(() => crearXlsx([])).toThrow()
  })
})
