import { useCallback, useState, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Confirmar } from '../../components/Confirmar'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import Feriados from './Feriados'
import Parametros from './Parametros'

const PESTANAS = [
  { id: 'parametros', texto: 'Parámetros' },
  { id: 'feriados', texto: 'Feriados' },
] as const
type Pestana = (typeof PESTANAS)[number]['id']

/** Reglas del sistema en dos pestañas. La pestaña vive en la dirección (`?tab=feriados`) para que atrás, recargar y los enlaces funcionen. */
export default function Configuracion() {
  const [params, setParams] = useSearchParams()
  const actual: Pestana = params.get('tab') === 'feriados' ? 'feriados' : 'parametros'
  const [sinGuardar, setSinGuardar] = useState(false)
  const [pendiente, setPendiente] = useState<Pestana | null>(null)
  const avisarCambios = useCallback((hay: boolean) => setSinGuardar(hay), [])

  function cambiarA(id: Pestana) {
    setSinGuardar(false)
    setPendiente(null)
    setParams(id === 'parametros' ? {} : { tab: id })
  }

  function ir(id: Pestana) {
    if (id === actual) return
    if (sinGuardar) setPendiente(id)
    else cambiarA(id)
  }

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    const i = PESTANAS.findIndex((p) => p.id === actual)
    let j = -1
    if (e.key === 'ArrowRight') j = (i + 1) % PESTANAS.length
    else if (e.key === 'ArrowLeft') j = (i - 1 + PESTANAS.length) % PESTANAS.length
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = PESTANAS.length - 1
    if (j < 0) return
    e.preventDefault()
    ir(PESTANAS[j].id)
    document.getElementById(`pestana-${PESTANAS[j].id}`)?.focus()
  }

  return (
    <>
      <EncabezadoPagina titulo="Configuración" detalle="Reglas del sistema y calendario de feriados · valen para todas las sedes"
        pie={
          <div role="tablist" aria-label="Secciones de configuración" onKeyDown={teclas} className="flex gap-6 overflow-x-auto px-4 sm:px-7">
            {PESTANAS.map((p) => {
              const activa = p.id === actual
              return (
                <button key={p.id} id={`pestana-${p.id}`} role="tab" type="button" aria-selected={activa} aria-controls={`panel-${p.id}`}
                  tabIndex={activa ? 0 : -1} onClick={() => ir(p.id)}
                  className={`-mb-px border-b-[3px] px-0.5 pb-3 pt-1 text-sm font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-celeste ${
                    activa ? 'border-ambar text-marino' : 'border-transparent text-texto-suave hover:text-marino'}`}>
                  {p.texto}
                </button>
              )
            })}
          </div>
        } />

      <div role="tabpanel" id={`panel-${actual}`} aria-labelledby={`pestana-${actual}`}>
        {actual === 'parametros' ? <Parametros onCambios={avisarCambios} /> : <Feriados />}
      </div>

      {pendiente && (
        <Confirmar titulo="Hay cambios sin guardar" confirmar="Descartar y continuar"
          texto="Cambiaste valores en Parámetros y todavía no los guardaste. Si sigues, se pierden."
          onCancelar={() => setPendiente(null)} onConfirmar={() => cambiarA(pendiente)} />
      )}
    </>
  )
}
