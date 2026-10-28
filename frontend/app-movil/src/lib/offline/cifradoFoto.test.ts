import * as SecureStore from 'expo-secure-store'
import {
  CLAVE_EN_SECURE_STORE, ErrorDeCifrado, PREFIJO, base64ABytes, bytesABase64, cifrarFoto, descifrarFoto, estaCifrada,
  olvidarClaveEnMemoria,
} from './cifradoFoto'

const simulado = SecureStore as unknown as { __guardado: Map<string, string>; __estado: { disponible: boolean } }
const guardado = simulado.__guardado
// Una "foto" cualquiera en base64 (bytes con todos los valores, para probar el relleno y los bytes altos).
const bytesFoto = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7 + 3) % 256)
const FOTO = bytesABase64(bytesFoto)

beforeEach(() => {
  guardado.clear()
  simulado.__estado.disponible = true
  olvidarClaveEnMemoria()
})

describe('base64', () => {
  it.each([0, 1, 2, 3, 4, 5, 100])('ida y vuelta con %i bytes', (n) => {
    const b = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256)
    expect(Array.from(base64ABytes(bytesABase64(b)))).toEqual(Array.from(b))
    expect(bytesABase64(b)).toBe(btoa(String.fromCharCode(...b)))
  })
  it('rechaza texto que no es base64', () => {
    expect(() => base64ABytes('###')).toThrow(ErrorDeCifrado)
  })
})

describe('cifradoFoto', () => {
  it('descifra lo mismo que cifró', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    expect(await descifrarFoto(c, 'm-1')).toBe(FOTO)
  })

  it('lo guardado no contiene la foto ni se parece a ella', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    expect(estaCifrada(c)).toBe(true)
    expect(c.startsWith(PREFIJO)).toBe(true)
    expect(c).not.toContain(FOTO.slice(0, 40))
    expect(estaCifrada(FOTO)).toBe(false)
  })

  it('la misma foto cifrada dos veces da textos distintos (nonce propio)', async () => {
    expect(await cifrarFoto(FOTO, 'm-1')).not.toBe(await cifrarFoto(FOTO, 'm-1'))
  })

  it('crea la clave una sola vez, la guarda en el almacén seguro y la reutiliza', async () => {
    expect(guardado.has(CLAVE_EN_SECURE_STORE)).toBe(false)
    const c = await cifrarFoto(FOTO, 'm-1')
    const clave = guardado.get(CLAVE_EN_SECURE_STORE)!
    expect(base64ABytes(clave)).toHaveLength(32)
    olvidarClaveEnMemoria()   // como si la app se reiniciara
    expect(await descifrarFoto(c, 'm-1')).toBe(FOTO)
    await cifrarFoto(FOTO, 'm-2')
    expect(guardado.get(CLAVE_EN_SECURE_STORE)).toBe(clave)
  })

  it('con otra clave no se puede descifrar', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    guardado.clear()
    olvidarClaveEnMemoria()
    await expect(descifrarFoto(c, 'm-1')).rejects.toThrow(ErrorDeCifrado)
  })

  it('si se altera un solo carácter, falla (cifrado autenticado)', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    const i = PREFIJO.length + 60
    const alterado = c.slice(0, i) + (c[i] === 'A' ? 'B' : 'A') + c.slice(i + 1)
    await expect(descifrarFoto(alterado, 'm-1')).rejects.toThrow(ErrorDeCifrado)
  })

  it('si se recorta el texto, falla', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    await expect(descifrarFoto(c.slice(0, -8), 'm-1')).rejects.toThrow(ErrorDeCifrado)
    await expect(descifrarFoto(PREFIJO + 'AAAA', 'm-1')).rejects.toThrow(ErrorDeCifrado)
  })

  it('una foto no sirve en otra marcación (el id va atado)', async () => {
    const c = await cifrarFoto(FOTO, 'm-1')
    await expect(descifrarFoto(c, 'm-2')).rejects.toThrow(ErrorDeCifrado)
  })

  it('no descifra algo que nunca se cifró', async () => {
    await expect(descifrarFoto(FOTO, 'm-1')).rejects.toThrow(ErrorDeCifrado)
  })

  it('una clave guardada dañada no se reemplaza en silencio', async () => {
    guardado.set(CLAVE_EN_SECURE_STORE, bytesABase64(new Uint8Array(5)))
    await expect(cifrarFoto(FOTO, 'm-1')).rejects.toThrow(ErrorDeCifrado)
  })

  it('sin almacén seguro no cifra (y lo dice)', async () => {
    simulado.__estado.disponible = false
    await expect(cifrarFoto(FOTO, 'm-1')).rejects.toThrow(/almacenamiento seguro/)
    simulado.__estado.disponible = true
    // y el siguiente intento vuelve a probar
    expect(await descifrarFoto(await cifrarFoto(FOTO, 'm-1'), 'm-1')).toBe(FOTO)
  })

  it('devuelve exactamente la misma cadena, sea cual sea (la firma se calculó sobre ella)', async () => {
    for (const texto of ['x', 'FOTO', FOTO + '\n', 'sin-relleno', 'á€😀', '']) {
      expect(await descifrarFoto(await cifrarFoto(texto, 'm-1'), 'm-1')).toBe(texto)
    }
  })

  it('cifra una foto grande (3 MB)', async () => {
    const grande = bytesABase64(new Uint8Array(3_000_000).fill(7))
    expect(await descifrarFoto(await cifrarFoto(grande, 'm-1'), 'm-1')).toBe(grande)
  })
})
