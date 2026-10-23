import NetInfo from '@react-native-community/netinfo'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppState } from 'react-native'
import { api } from '../api'
import type { RespuestaMarcar } from '../marcacion'
import { obtenerAlmacen } from './almacen'
import { sincronizar, type Enviar, type ResultadoSincronizacion } from './sincronizador'
import type { DatosMarcacion, Pendiente } from './tipos'

/** Cada cuánto se reintenta mientras la app está abierta y quedan marcaciones por enviar. */
export const REINTENTO_MS = 60_000
/** Una marcación lleva una foto: se le da más tiempo que a una consulta normal. */
const ESPERA_ENVIO_MS = 30_000

export type ResultadoGuardado =
  | { estado: 'guardada' }
  | { estado: 'enviada'; respuesta: RespuestaMarcar }
  | { estado: 'rechazada'; motivo: string }

export interface Sincronizacion {
  /** null fuera de sesión (y en las pruebas sin proveedor): entonces no se guarda nada en el celular. */
  usuarioId: string | null
  /** false solo cuando el celular no tiene ninguna red (modo avión, sin datos ni Wi-Fi). */
  enLinea: boolean
  pendientes: Pendiente[]
  descartadas: Pendiente[]
  sincronizando: boolean
  /** Sube cada vez que algo llegó al servidor: las pantallas lo miran para volver a cargar sus datos. */
  version: number
  /** Envía ya lo que haya guardado. Devuelve null si no hay sesión o falló algo inesperado. */
  sincronizarAhora: () => Promise<ResultadoSincronizacion | null>
  /** Guarda la marcación en el celular. Con `enviarYa`, además intenta mandar la cola entera ahora mismo. */
  guardar: (datos: DatosMarcacion, opciones?: { enviarYa?: boolean }) => Promise<ResultadoGuardado>
  /** «Entendido» sobre una marcación rechazada: la quita de la lista. */
  descartar: (id: string) => Promise<void>
}

const SIN_PROVEEDOR: Sincronizacion = {
  usuarioId: null, enLinea: true, pendientes: [], descartadas: [], sincronizando: false, version: 0,
  sincronizarAhora: async () => null,
  guardar: async () => { throw new Error('La sincronización no está disponible') },
  descartar: async () => {},
}

const Contexto = createContext<Sincronizacion>(SIN_PROVEEDOR)
export const useSincronizacion = () => useContext(Contexto)

/** Lo que se manda al servidor por cada marcación guardada: la hora es la del celular y `sin_conexion` lo avisa. */
const enviarAlServidor: Enviar = (p, selfie) =>
  api<RespuestaMarcar>('/marcaciones', {
    method: 'POST',
    esperaMaxMs: ESPERA_ENVIO_MS,
    body: {
      id: p.id, tipo: p.tipo, fecha_hora: p.fecha_hora, latitud: p.latitud, longitud: p.longitud,
      precision_m: p.precision_m, ubicacion_simulada: p.ubicacion_simulada, origen: 'app',
      dispositivo_id: p.dispositivo_id, sin_conexion: true, selfie_b64: selfie,
    },
  })

/**
 * Lleva la cola de marcaciones hechas sin conexión de la persona que tiene la sesión abierta. Envía lo guardado
 * (en orden) cuando vuelve la red, cuando la app pasa a primer plano, cada minuto mientras quede algo y cuando la
 * persona lo pide. No hay envío en segundo plano: eso requiere una compilación propia de la app (ver docs).
 */
export function SincronizacionProvider({ usuarioId, children }: { usuarioId: string | null; children: ReactNode }) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [descartadas, setDescartadas] = useState<Pendiente[]>([])
  const [enLinea, setEnLinea] = useState(true)
  const [sincronizando, setSincronizando] = useState(false)
  const [version, setVersion] = useState(0)
  const activas = useRef(0)
  const estabaEnLinea = useRef(true)

  const refrescar = useCallback(async () => {
    if (!usuarioId) { setPendientes([]); setDescartadas([]); return }
    try {
      const todas = await obtenerAlmacen().listar(usuarioId)
      setPendientes(todas.filter((p) => p.estado === 'pendiente'))
      setDescartadas(todas.filter((p) => p.estado === 'descartada'))
    } catch (e) {
      console.warn('No se pudieron leer las marcaciones guardadas', e)
    }
  }, [usuarioId])

  const sincronizarAhora = useCallback(async () => {
    if (!usuarioId) return null
    activas.current += 1
    setSincronizando(true)
    try {
      const r = await sincronizar(obtenerAlmacen(), usuarioId, enviarAlServidor)
      if (r.enviadas.length > 0) setVersion((v) => v + 1)
      return r
    } catch (e) {
      console.warn('No se pudo sincronizar', e)
      return null
    } finally {
      activas.current -= 1
      setSincronizando(activas.current > 0)
      await refrescar()
    }
  }, [usuarioId, refrescar])

  const guardar = useCallback<Sincronizacion['guardar']>(async (datos, { enviarYa = false } = {}) => {
    if (!usuarioId) throw new Error('No hay una sesión abierta')
    const { selfie_b64, ...resto } = datos
    await obtenerAlmacen().insertar(
      { ...resto, usuario_id: usuarioId, estado: 'pendiente', intentos: 0, ultimo_error: null, creada_en: new Date().toISOString() },
      selfie_b64,
    )
    await refrescar()
    if (!enviarYa) return { estado: 'guardada' }
    const r = await sincronizarAhora()
    const enviada = r?.enviadas.find((e) => e.id === datos.id)
    if (enviada) return { estado: 'enviada', respuesta: enviada.respuesta }
    const rechazada = r?.descartadas.find((d) => d.id === datos.id)
    if (rechazada) {
      // La pantalla de marcar le dice el motivo a la persona ahora mismo: no hace falta repetirlo en la lista.
      await obtenerAlmacen().eliminar(datos.id)
      await refrescar()
      return { estado: 'rechazada', motivo: rechazada.motivo }
    }
    return { estado: 'guardada' }
  }, [usuarioId, refrescar, sincronizarAhora])

  const descartar = useCallback(async (id: string) => {
    await obtenerAlmacen().eliminar(id)
    await refrescar()
  }, [refrescar])

  // Al entrar (o al cambiar de persona): se muestra lo guardado y se intenta enviarlo.
  useEffect(() => {
    void refrescar()
    void sincronizarAhora()
  }, [refrescar, sincronizarAhora])

  // Cuando vuelve la red.
  useEffect(() => {
    const dejarDeEscuchar = NetInfo.addEventListener((estado) => {
      const hayRed = estado.isConnected !== false
      setEnLinea(hayRed)
      if (hayRed && !estabaEnLinea.current) void sincronizarAhora()
      estabaEnLinea.current = hayRed
    })
    return () => dejarDeEscuchar()
  }, [sincronizarAhora])

  // Cuando se vuelve a la app.
  useEffect(() => {
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizarAhora()
    })
    return () => suscripcion.remove()
  }, [sincronizarAhora])

  // Mientras quede algo por enviar y la app esté abierta, se reintenta cada tanto (cubre un servidor que tardó en volver).
  const hayPendientes = pendientes.length > 0
  useEffect(() => {
    if (!usuarioId || !hayPendientes) return
    const t = setInterval(() => { void sincronizarAhora() }, REINTENTO_MS)
    return () => clearInterval(t)
  }, [usuarioId, hayPendientes, sincronizarAhora])

  const valor = useMemo<Sincronizacion>(
    () => ({ usuarioId, enLinea, pendientes, descartadas, sincronizando, version, sincronizarAhora, guardar, descartar }),
    [usuarioId, enLinea, pendientes, descartadas, sincronizando, version, sincronizarAhora, guardar, descartar],
  )
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
