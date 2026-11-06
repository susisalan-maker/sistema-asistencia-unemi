import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { hoyEcuador } from './anomaliasConsulta'
import {
  MAXIMO_DIAS, PERIODOS, PERIODO_INICIAL, diasDelRango, esDia, nombreDelPeriodo, rangoDe, type Periodo, type Rango,
} from './reportesPeriodo'

export interface Sede { id: string; nombre: string }

const esPeriodo = (v: string | null): v is Periodo => PERIODOS.some((p) => p.valor === v)

export type CambiarFiltros = (cambios: Record<string, string | null>, opciones?: { reemplazar?: boolean }) => void

export interface FiltrosPeriodo {
  /** Toda la dirección de la página: cada pantalla lee de aquí sus propios filtros (estado, tipo, página…). */
  params: URLSearchParams
  hoy: string
  periodo: Periodo
  rango: Rango
  /** El rango pasa del máximo permitido: no se consulta nada. */
  demasiado: boolean
  nombrePeriodo: string
  sedes: Sede[] | null
  /** Sede elegida; vacío = todas (una sede que ya no existe en la dirección se ignora). */
  sedeId: string
  sedeNombre: string | null
  cambiar: CambiarFiltros
}

/**
 * Los filtros que comparten el Dashboard y Reportes: periodo (semana, mes o rango) y sede. Viven en la dirección de la
 * página, así que se puede recargar o compartir el enlace y queda igual.
 */
export function useFiltrosPeriodo(): FiltrosPeriodo {
  const [params, setParams] = useSearchParams()
  const hoy = hoyEcuador()

  const periodo: Periodo = esPeriodo(params.get('periodo')) ? (params.get('periodo') as Periodo) : PERIODO_INICIAL
  const referencia = esDia(params.get('ref')) ? params.get('ref') : null
  const desdeTexto = params.get('desde')
  const hastaTexto = params.get('hasta')
  // Solo depende de lo que define las fechas: si dependiera de `params` entero, filtrar por estado, tipo o página
  // lo recalcularía y se volverían a pedir las cifras y las gráficas, no solo la tabla.
  const rango = useMemo(() => rangoDe(periodo, referencia, desdeTexto, hastaTexto, hoy), [periodo, referencia, desdeTexto, hastaTexto, hoy])
  const demasiado = diasDelRango(rango) > MAXIMO_DIAS

  const [sedes, setSedes] = useState<Sede[] | null>(null)
  const sedePedida = params.get('sede') ?? ''
  const sedeId = sedes === null || sedePedida === '' || sedes.some((s) => s.id === sedePedida) ? sedePedida : ''
  const sedeNombre = sedes?.find((s) => s.id === sedeId)?.nombre ?? null

  /** Cambia una o varias partes de la dirección; lo que vale lo de siempre no se escribe. Al cambiar un filtro se vuelve a la página 1. */
  const cambiar = useCallback<CambiarFiltros>((cambios, opciones = {}) => {
    setParams((actual) => {
      const nuevo = new URLSearchParams(actual)
      const sinPagina = !('pagina' in cambios)
      for (const [k, v] of Object.entries(cambios)) {
        if (v === null || v === '') nuevo.delete(k)
        else nuevo.set(k, v)
      }
      if (sinPagina) nuevo.delete('pagina')
      return nuevo
    }, { replace: opciones.reemplazar ?? false })
  }, [setParams])

  useEffect(() => {
    let vigente = true
    supabase.from('sedes').select('id, nombre').order('nombre').then(({ data }) => { if (vigente) setSedes((data ?? []) as Sede[]) })
    return () => { vigente = false }
  }, [])

  const nombrePeriodo = nombreDelPeriodo(periodo, rango)
  return { params, hoy, periodo, rango, demasiado, nombrePeriodo, sedes, sedeId, sedeNombre, cambiar }
}
