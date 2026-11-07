import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso, Chip } from '../../components/ui'
import {
  POR_PAGINA_AUDITORIA, SISTEMA, consultarAdministradores, consultarBitacora, nombresDeRegistros,
  type Administrador, type FilaAuditoria, type FiltrosAuditoria,
} from './auditoriaDatos'
import {
  ENTIDADES, EVENTOS, LISTA_EVENTOS, esEntidad, esEvento, fechaHoraCompleta, formatearValor, nombreDeCampo, nombreDelRegistro,
  singularDeEntidad,
} from './auditoriaTipos'
import { BarraFiltros, avisoRangoLargo, botonPagina, selector } from './PiezasReporte'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'

const COLUMNAS = '@4xl:grid @4xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1fr)] @4xl:gap-3'

const nombreDe = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`.trim()

interface Pagina { filas: FilaAuditoria[]; total: number; nombres: Map<string, string> }

/** El registro afectado: su nombre (con un enlace si tiene pantalla propia) y, debajo, de qué tipo es. */
function Registro({ fila, nombres }: { fila: FilaAuditoria; nombres: Map<string, string> }) {
  const nombre = nombreDelRegistro(fila.entidad, fila.entidad_id, nombres)
  const enlace = fila.entidad === 'anomalias' ? `/admin/anomalias/${fila.entidad_id}` : fila.entidad === 'sedes' ? `/admin/sedes/${fila.entidad_id}` : null
  return (
    <>
      {enlace
        ? <Link to={enlace} className="break-words font-extrabold text-marino underline-offset-2 hover:underline">{nombre}</Link>
        : <span className="break-words font-extrabold text-marino">{nombre}</span>}
      <span className="block text-[11px] font-bold uppercase tracking-[.06em] text-etiqueta">{singularDeEntidad(fila.entidad)}</span>
    </>
  )
}

function Valor({ campo, valor, evento, nombres }: { campo: string | null; valor: string | null; evento: FilaAuditoria['evento']; nombres: Map<string, string> }) {
  const v = formatearValor(campo, valor, evento, nombres)
  return <span title={v.completo} className={v.texto === '—' ? 'text-etiqueta' : ''}>{v.texto}</span>
}

/**
 * La bitácora del sistema: quién cambió qué, cuándo y con qué valores. Es solo lectura —no hay nada que editar ni borrar,
 * y la base de datos lo impide aunque se intentara— y solo la ve el administrador. Lo que se ve (periodo, evento, entidad,
 * quién y página) vive en la dirección de la página, igual que en el Dashboard y Reportes.
 */
export default function Auditoria() {
  const f = useFiltrosPeriodo({ conSedes: false })
  const { params, rango, demasiado, nombrePeriodo, cambiar } = f

  const evento = esEvento(params.get('evento')) ? (params.get('evento') as FiltrosAuditoria['evento']) : ''
  const entidad = esEntidad(params.get('entidad')) ? (params.get('entidad') as string) : ''
  const porPedido = params.get('por') ?? ''
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina'))) || 1)

  // «Realizado por»: el sistema o uno de los administradores. Un administrador que ya no aparece se ignora.
  const [administradores, setAdministradores] = useState<Administrador[] | null>(null)
  useEffect(() => {
    let vigente = true
    consultarAdministradores().then((a) => { if (vigente) setAdministradores(a) }).catch(() => { if (vigente) setAdministradores([]) })
    return () => { vigente = false }
  }, [])
  const por = porPedido === SISTEMA || administradores === null || administradores.some((a) => a.id === porPedido) ? porPedido : ''

  // Solo depende de lo que se filtra: cambiar de página o de periodo vuelve a pedir la tabla, nada más.
  const filtros: FiltrosAuditoria = useMemo(() => ({ rango, evento, entidad, por }), [rango, evento, entidad, por])
  const [resultado, setResultado] = useState<Pagina | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (demasiado) return
    let vigente = true
    setCargando(true)
    consultarBitacora(filtros, pagina)
      .then(async (r) => ({ ...r, nombres: await nombresDeRegistros(r.filas).catch(() => new Map<string, string>()) }))
      .then((r) => { if (vigente) { setResultado(r); setError(null) } })
      .catch(() => { if (vigente) { setResultado(null); setError('No se pudo cargar la bitácora') } })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [filtros, pagina, demasiado, intento])

  const total = resultado?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_AUDITORIA))
  // Si la dirección pide una página que ya no existe (se cambió un filtro, o se escribió a mano), se va a la última.
  useEffect(() => {
    if (!cargando && resultado && resultado.filas.length === 0 && resultado.total > 0 && pagina > 1) {
      cambiar({ pagina: paginas > 1 ? String(paginas) : null }, { reemplazar: true })
    }
  }, [cargando, resultado, pagina, paginas, cambiar])

  const hayFiltros = !!(evento || entidad || por)
  const desdeFila = (pagina - 1) * POR_PAGINA_AUDITORIA

  return (
    <>
      <EncabezadoPagina titulo="Auditoría" detalle={`Registro inmutable de los cambios en el sistema · ${nombrePeriodo}`} />

      <div className="space-y-5 p-4 sm:p-7">
        <BarraFiltros f={f} conSede={false} />

        {demasiado && <Aviso tipo="error">{avisoRangoLargo}</Aviso>}

        {!demasiado && (
          <section aria-label="Cambios registrados" className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="text-[17px] font-extrabold text-marino">Cambios del periodo</h2>
              {resultado && <span className="rounded-full bg-celeste px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-marino">{total} {total === 1 ? 'cambio' : 'cambios'}</span>}
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <select aria-label="Evento" value={evento} onChange={(e) => cambiar({ evento: e.target.value })} className={selector}>
                  <option value="">Evento: todos</option>
                  {LISTA_EVENTOS.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
                </select>
                <select aria-label="Entidad" value={entidad} onChange={(e) => cambiar({ entidad: e.target.value })} className={selector}>
                  <option value="">Entidad: todas</option>
                  {ENTIDADES.map((e) => <option key={e.valor} value={e.valor}>{e.texto}</option>)}
                </select>
                <select aria-label="Realizado por" value={por} onChange={(e) => cambiar({ por: e.target.value })} className={selector}>
                  <option value="">Realizado por: todos</option>
                  <option value={SISTEMA}>Sistema</option>
                  {(administradores ?? []).map((a) => <option key={a.id} value={a.id}>{nombreDe(a)}</option>)}
                </select>
                {hayFiltros && (
                  <button type="button" onClick={() => cambiar({ evento: null, entidad: null, por: null })}
                    className="rounded-[11px] border border-marino bg-white px-3.5 py-2.5 text-[13px] font-extrabold text-marino hover:bg-lienzo">Borrar filtros</button>
                )}
              </div>
            </div>

            {error && (
              <Aviso tipo="error">
                {error}.{' '}
                <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button>
              </Aviso>
            )}

            <div aria-busy={cargando} className={`@container tabla-ancha overflow-hidden rounded-[18px] border border-borde-suave bg-white transition-opacity ${cargando && resultado ? 'opacity-60' : ''}`}>
              <div className={`${COLUMNAS} tabla-cabecera border-b border-lienzo bg-cabecera px-5 py-3 text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta`}>
                <div>Fecha y hora</div><div>Evento</div><div>Registro afectado</div><div>Campo</div><div>Valor anterior</div><div>Valor nuevo</div><div>Realizado por</div><div>Motivo</div>
              </div>
              {cargando && !resultado && !error && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
              {!cargando && !error && total === 0 && (
                <p className="p-6 text-sm font-semibold text-texto-suave">{hayFiltros ? 'No hay cambios que coincidan con esos filtros.' : 'No hubo cambios en este periodo.'}</p>
              )}
              {(resultado?.filas ?? []).map((fila) => (
                <div key={fila.id} className={`${COLUMNAS} tabla-fila items-start border-b border-lienzo px-4 py-4 text-sm font-semibold text-texto @4xl:px-5 @4xl:py-3.5`}>
                  <div data-etiqueta="Fecha y hora" className="whitespace-nowrap text-[13px]">{fechaHoraCompleta(fila.created_at)}</div>
                  <div data-etiqueta="Evento"><Chip tono={EVENTOS[fila.evento]?.tono ?? 'neutro'}>{EVENTOS[fila.evento]?.texto ?? fila.evento}</Chip></div>
                  <div data-etiqueta="Registro afectado" data-ancho="completo" className="text-[13px]"><Registro fila={fila} nombres={resultado!.nombres} /></div>
                  <div data-etiqueta="Campo" className="break-words text-[13px]">{nombreDeCampo(fila.campo, fila.evento)}</div>
                  <div data-etiqueta="Valor anterior" className="break-words text-[13px]"><Valor campo={fila.campo} valor={fila.valor_anterior} evento={fila.evento} nombres={resultado!.nombres} /></div>
                  <div data-etiqueta="Valor nuevo" className="break-words text-[13px] text-marino"><Valor campo={fila.campo} valor={fila.valor_nuevo} evento={fila.evento} nombres={resultado!.nombres} /></div>
                  <div data-etiqueta="Realizado por" className="break-words text-[13px] font-bold text-marino">
                    {fila.usuario_id === null ? <span className="font-semibold italic text-texto-suave">Sistema</span> : fila.autor ? nombreDe(fila.autor) : 'Persona desconocida'}
                  </div>
                  <div data-etiqueta="Motivo" data-ancho="completo" className="text-[13px]">
                    {fila.motivo ? <span title={fila.motivo} className="line-clamp-3 break-words">{fila.motivo}</span> : <span className="text-etiqueta">—</span>}
                  </div>
                </div>
              ))}
              {total > 0 && <p className="px-5 py-3 text-xs font-semibold text-etiqueta">Mostrando {desdeFila + 1}–{desdeFila + (resultado?.filas.length ?? 0)} de {total} · del más reciente al más antiguo</p>}
            </div>

            {paginas > 1 && (
              <nav aria-label="Páginas" className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => cambiar({ pagina: pagina - 1 > 1 ? String(pagina - 1) : null })} disabled={pagina === 1} className={botonPagina}>‹ Anterior</button>
                <span className="text-[13px] font-bold text-texto-suave">Página {pagina} de {paginas}</span>
                <button type="button" onClick={() => cambiar({ pagina: String(pagina + 1) })} disabled={pagina >= paginas} className={botonPagina}>Siguiente ›</button>
              </nav>
            )}

            <p className="text-xs font-semibold text-etiqueta">
              La bitácora no se puede editar ni eliminar. Los datos del rostro nunca aparecen aquí: solo que se registró o se reseteó.
            </p>
          </section>
        )}
      </div>
    </>
  )
}
