import * as Device from 'expo-device'

/**
 * Milisegundos que lleva encendido el celular (desde el último arranque), o null si no se puede leer.
 *
 * Es un contador que NO se cambia desde Ajustes → Fecha y hora, a diferencia de `Date.now()`. En Android no cuenta
 * el tiempo con el celular en reposo profundo, y se reinicia al apagarlo: por eso el servidor lo usa solo como cota
 * inferior (ver backend `app/reloj.py`). Con una compilación propia de la app se puede sustituir por
 * `SystemClock.elapsedRealtime()` (Android) o un reloj monotónico que incluya el reposo (iOS): este es el único lugar
 * que habría que cambiar.
 */
export async function arranqueMs(): Promise<number | null> {
  try {
    const ms = await Device.getUptimeAsync()
    return Number.isFinite(ms) && ms >= 0 ? Math.round(ms) : null
  } catch {
    return null
  }
}
