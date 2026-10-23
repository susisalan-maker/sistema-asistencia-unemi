import { ApiError } from '../api'
import type { RespuestaMarcar } from '../marcacion'
import type { Almacen, Pendiente } from './tipos'

/** Manda una marcación guardada al servidor. Lanza `ApiError` si no se pudo. */
export type Enviar = (pendiente: Pendiente, selfie: string) => Promise<RespuestaMarcar>

export interface ResultadoSincronizacion {
  /** Las que el servidor aceptó (o ya tenía) en esta pasada. */
  enviadas: { id: string; respuesta: RespuestaMarcar }[]
  /** Las que el servidor rechazó para siempre: se quedan marcadas hasta que la persona las vea. */
  descartadas: { id: string; motivo: string }[]
  /** Por qué se paró antes de terminar (el resto se intenta en la próxima pasada). */
  detenida: 'sin_red' | 'servidor' | 'sesion' | null
}

type Clasificacion =
  | { accion: 'reintentar'; motivo: 'sin_red' | 'servidor' | 'sesion'; mensaje: string }
  | { accion: 'descartar'; mensaje: string }

/**
 * ¿Vale la pena volver a intentarlo? Sin red, servidor caído o saturado → sí, y la marcación se queda en la cola.
 * Sesión vencida → sí, cuando la persona vuelva a entrar. Un rechazo del servidor (la regla no se cumple, el
 * dispositivo no es el vinculado, pasó el plazo…) → no: repetirlo daría la misma respuesta.
 */
export function clasificar(e: unknown): Clasificacion {
  if (e instanceof ApiError) {
    if (e.status === 0) return { accion: 'reintentar', motivo: 'sin_red', mensaje: e.message }
    if (e.status === 401 || e.codigo === 'cuenta_inhabilitada') return { accion: 'reintentar', motivo: 'sesion', mensaje: e.message }
    if (e.status >= 500 || e.status === 408 || e.status === 429) return { accion: 'reintentar', motivo: 'servidor', mensaje: e.message }
    return { accion: 'descartar', mensaje: e.message }
  }
  // Un error que no conocemos no debe costar una marcación: se conserva y se vuelve a intentar.
  return { accion: 'reintentar', motivo: 'servidor', mensaje: e instanceof Error ? e.message : String(e) }
}

async function pasada(almacen: Almacen, usuarioId: string, enviar: Enviar): Promise<ResultadoSincronizacion> {
  const resultado: ResultadoSincronizacion = { enviadas: [], descartadas: [], detenida: null }
  // De la más antigua a la más reciente: el servidor valida la secuencia del día y que no haya nada posterior.
  const turno = (await almacen.listar(usuarioId)).filter((p) => p.estado === 'pendiente')
  for (const p of turno) {
    const selfie = await almacen.selfie(p.id)
    if (!selfie) {
      const motivo = 'La foto de esta marcación ya no está en el celular'
      await almacen.descartar(p.id, motivo)
      resultado.descartadas.push({ id: p.id, motivo })
      continue
    }
    try {
      const respuesta = await enviar(p, selfie)
      await almacen.eliminar(p.id)   // aceptada (o ya estaba): la selfie se borra del celular
      resultado.enviadas.push({ id: p.id, respuesta })
    } catch (e) {
      const c = clasificar(e)
      if (c.accion === 'descartar') {
        await almacen.descartar(p.id, c.mensaje)
        resultado.descartadas.push({ id: p.id, motivo: c.mensaje })
        continue   // las siguientes no dependen de esta: se siguen enviando
      }
      await almacen.registrarIntento(p.id, c.mensaje)
      resultado.detenida = c.motivo
      break        // se conserva el orden: no se envía una más reciente antes que esta
    }
  }
  return resultado
}

// Una sola pasada a la vez. Si piden otra mientras corre una, se junta con las demás en UNA que arranca al terminar
// (así la que se guardó justo después de empezar también sale, y varios avisos seguidos no hacen varias peticiones).
let enCurso: { usuarioId: string; promesa: Promise<ResultadoSincronizacion> } | null = null
let siguiente: { usuarioId: string; promesa: Promise<ResultadoSincronizacion> } | null = null

export function sincronizar(almacen: Almacen, usuarioId: string, enviar: Enviar): Promise<ResultadoSincronizacion> {
  if (!enCurso) {
    const promesa: Promise<ResultadoSincronizacion> = pasada(almacen, usuarioId, enviar).finally(() => {
      if (enCurso?.promesa === promesa) enCurso = null
    })
    enCurso = { usuarioId, promesa }
    return promesa
  }
  if (siguiente?.usuarioId === usuarioId) return siguiente.promesa
  const espera = enCurso.promesa.catch(() => undefined)
  const promesa: Promise<ResultadoSincronizacion> = espera.then(() => {
    if (siguiente?.promesa === promesa) siguiente = null
    return sincronizar(almacen, usuarioId, enviar)
  })
  siguiente = { usuarioId, promesa }
  return promesa
}
