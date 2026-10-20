import * as Application from 'expo-application'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'

const CLAVE = 'asistencia.dispositivo_id'

/**
 * Identificador de ESTE celular, el mismo cada vez. En Android es el ANDROID_ID; en iPhone, el identificador
 * del proveedor. Si el sistema no lo da (web, o un valor vacío), se crea uno aleatorio y se guarda.
 * Se envía al microservicio, que lo vincula a la cuenta; no es un dato personal.
 */
export async function idDispositivo(): Promise<string> {
  let nativo: string | null = null
  try {
    if (Platform.OS === 'android') nativo = Application.getAndroidId()
    else if (Platform.OS === 'ios') nativo = await Application.getIosIdForVendorAsync()
  } catch {
    nativo = null
  }
  if (nativo) return `${Platform.OS}:${nativo}`

  try {
    const guardado = localStorage.getItem(CLAVE)
    if (guardado) return guardado
    const nuevo = `${Platform.OS}:${Crypto.randomUUID()}`
    localStorage.setItem(CLAVE, nuevo)
    return nuevo
  } catch {
    return `${Platform.OS}:${Crypto.randomUUID()}` // sin almacenamiento: sirve para esta sesión
  }
}
