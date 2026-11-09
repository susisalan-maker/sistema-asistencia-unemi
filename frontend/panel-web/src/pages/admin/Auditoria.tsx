import { useEffect, useMemo, useRef, useState } from 'react'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { useNotificar } from '../../components/Toasts'
import { Aviso, Chip } from '../../components/ui'
import {
  GRUPOS, MAXIMO_EXPORTAR, POR_PAGINA_AUDITORIA, SISTEMA, consultarAcciones, consultarAdministradores, esGrupo, nombresDeRegistros,
  registrarExportacionAuditoria, type AccionAuditoria, type Administrador, type FiltrosAuditoria, type PaginaAuditoria,
} from './auditoriaDatos'
import { TEXTO_MODO, excelDeAuditoria, type ModoFilas } from './auditoriaExcel'
import { diaEcuador, fechaYHoraLarga, horaEcuador, relativo, tituloDeDia } from './auditoriaFechas'
import { describirAccion } from './auditoriaFrases'
import { EVENTOS, esEvento, singularDeEntidad } from './auditoriaTipos'
import { ExportarAuditoriaDialogo, conMiles } from './ExportarAuditoriaDialogo'
import { PanelLateral } from './PanelLateral'
import { BarraFiltros, avisoRangoLargo, botonPagina, selector } from './PiezasReporte'
import { descargarBinario } from './reportesExportar'
import { useFiltrosPeriodo } from './useFiltrosPeriodo'
import { TIPO_XLSX } from './xlsx'

const nombreDe = (p: { nombres: string; apellidos: string }) => `${p.nombres} ${p.apellidos}`.trim()
const ESPERA_BUSQUEDA_MS = 350

interface Pagina extends PaginaAuditoria { nombres: Map<string, string> }

/** Quién hizo qué, en una frase: el nombre y lo importante en negrita. */
function Frase({ accion, nombres }: { accion: AccionAuditoria; nombres: Map<string, string> }) {
  const d = describirAccion(accion, nombres)
  return (
    <p className="text-[15px] font-semibold leading-snug">
      {d.trozos.map((t, i) => (t.fuerte
        ? <strong key={i} className={`font-extrabold ${i === 0 && d.esSistema ? 'italic' : ''}`}>{t.t}</strong>
        : <span key={i}>{t.t}</span>))}
    </p>
  )
}

/** Una acción en la lista: la hora, la frase, sus primeros datos y el evento. Al tocarla se abre el detalle. */
function Fila({ accion, nombres, ahora, alAbrir }: { accion: AccionAuditoria; nombres: Map<string, string>; ahora: Date; alAbrir: () => void }) {
  const d = describirAccion(accion, nombres)
  const mas = d.etiquetas.length - d.visibles
  const evento = EVENTOS[accion.evento]
  return (
    <button type="button" aria-haspopup="dialog" onClick={alAbrir}
      className="grid w-full grid-cols-1 items-start gap-2 border-t border-lienzo px-4 py-4 text-left text-marino hover:bg-lienzo/60 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-marino @3xl:grid-cols-[110px_minmax(0,1fr)_170px_20px] @3xl:gap-4 @3xl:px-6">
      <span>
        <span className="text-sm font-extrabold">{horaEcuador(accion.created_at)}</span>
        <span className="ml-2 text-xs font-semibold text-etiqueta @3xl:ml-0 @3xl:block">{relativo(accion.created_at, ahora)}</span>
      </span>
      <span className="min-w-0">
        <Frase accion={accion} nombres={nombres} />
        {(d.etiquetas.length > 0 || d.nota) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-etiqueta">
            {d.etiquetas.slice(0, d.visibles).map((t) => <span key={t} className="rounded-lg bg-lienzo px-2.5 py-0.5 font-bold text-marino">{t}</span>)}
            {mas > 0 && <span className="font-extrabold text-marino underline">+{mas} más</span>}
            {d.nota && <span className="break-words">{d.nota}</span>}
          </span>
        )}
      </span>
      <span><Chip tono={evento?.tono ?? 'neutro'}>{evento?.texto ?? accion.evento}</Chip></span>
      <span aria-hidden="true" className="hidden text-lg font-extrabold text-etiqueta @3xl:block">›</span>
    </button>
  )
}

/** El detalle de una acción: quién, cuándo, qué registro, el motivo y cada dato con su antes y después. */
function Detalle({ accion, nombres, alVerTodo }: { accion: AccionAuditoria; nombres: Map<string, string>; alVerTodo: (nombre: string) => void }) {
  const d = describirAccion(accion, nombres)
  const evento = EVENTOS[accion.evento]
  const esExportacion = accion.entidad === 'reportes' || accion.entidad === 'auditoria'
  // «Ver todo lo de…» solo tiene sentido para personas, sedes y demás registros con nombre; en un caso se busca por la persona.
  const buscable = accion.entidad === 'anomalias' ? nombres.get(`anomalias_persona:${accion.entidad_id}`) : ['usuarios', 'sedes', 'bloques', 'feriados'].includes(accion.entidad) && nombres.has(`${accion.entidad}:${accion.entidad_id}`) ? d.registro : undefined
  return (
    <>
      <div>
        <Chip tono={evento?.tono ?? 'neutro'}>{evento?.texto ?? accion.evento}</Chip>
        <h3 className="mt-2.5 text-[19px] font-extrabold leading-tight text-marino">{d.texto}</h3>
        <p className="mt-1.5 text-[13px] font-semibold text-etiqueta">{fechaYHoraLarga(accion.created_at)}</p>
      </div>

      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        <dt className="font-bold text-etiqueta">Realizado por</dt>
        <dd className="font-extrabold text-marino">{d.esSistema ? 'Sistema (sin una persona asociada)' : d.autor}</dd>
        <dt className="font-bold text-etiqueta">Registro afectado</dt>
        <dd className="font-extrabold text-marino">{d.registro} <span className="font-bold text-etiqueta">· {singularDeEntidad(accion.entidad)}</span></dd>
        <dt className="font-bold text-etiqueta">{esExportacion ? 'Detalle' : 'Motivo'}</dt>
        <dd className="break-words font-semibold text-marino">{accion.motivo ?? '—'}</dd>
      </dl>

      {esExportacion ? (
        <div>
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Lo que se exportó</h4>
          <ul className="flex flex-wrap gap-1.5">{d.etiquetas.map((t) => <li key={t} className="rounded-lg border border-borde-suave bg-white px-2.5 py-0.5 text-xs font-bold text-marino">{t}</li>)}</ul>
        </div>
      ) : d.datos.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta">Qué cambió</h4>
          <div className="overflow-hidden rounded-[14px] border border-borde-suave bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-cabecera text-[11px] font-extrabold uppercase tracking-[.07em] text-etiqueta">
                  <th scope="col" className="px-3 py-2.5">Dato</th><th scope="col" className="px-3 py-2.5">Antes</th><th scope="col" className="px-3 py-2.5">Después</th>
                </tr>
              </thead>
              <tbody>
                {d.datos.map((x, i) => (
                  <tr key={i} className="border-t border-lienzo align-top">
                    <th scope="row" className="px-3 py-2.5 font-extrabold text-marino">{x.dato}</th>
                    <td className="break-words px-3 py-2.5 font-semibold">{x.antes}</td>
                    <td className="break-words px-3 py-2.5 font-extrabold text-marino">{x.despues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="rounded-xl border border-borde-suave bg-white px-4 py-3 text-xs font-semibold leading-relaxed text-etiqueta">
        Este registro no se puede editar ni eliminar. Los datos del rostro nunca aparecen aquí: solo que se registró o se reseteó.
      </p>

      {buscable && (
        <button type="button" onClick={() => alVerTodo(buscable)}
          className="min-h-11 rounded-[11px] border border-borde bg-white px-4 text-[13px] font-extrabold text-marino hover:bg-lienzo">Ver todo lo de {buscable}</button>
      )}
    </>
  )
}

/**
 * La bitácora del sistema: quién cambió qué, cuándo y con qué valores, una fila por acción (lo que la bitácora guarda como un cambio
 * por dato se junta aquí). Es solo lectura —no hay nada que editar ni borrar, y la base de datos lo impide aunque se intentara— y solo
 * la ve el administrador. Lo que se ve (periodo, atajo, búsqueda, evento, quién y página) vive en la dirección de la página, igual que
 * en el Dashboard y Reportes. La base agrupa, busca y cuenta; aquí solo se muestra.
 */
export default function Auditoria() {
  const notificar = useNotificar()
  const f = useFiltrosPeriodo({ conSedes: false })
  const { params, rango, demasiado, nombrePeriodo, hoy, cambiar } = f

  const evento = esEvento(params.get('evento')) ? (params.get('evento') as FiltrosAuditoria['evento']) : ''
  const grupo = esGrupo(params.get('grupo')) ? (params.get('grupo') as FiltrosAuditoria['grupo']) : ''
  const porPedido = params.get('por') ?? ''
  const buscar = (params.get('q') ?? '').slice(0, 80)
  const pagina = Math.max(1, Math.floor(Number(params.get('pagina'))) || 1)

  // «Realizado por»: el sistema o uno de los administradores. Un administrador que ya no aparece se ignora.
  const [administradores, setAdministradores] = useState<Administrador[] | null>(null)
  useEffect(() => {
    let vigente = true
    consultarAdministradores().then((a) => { if (vigente) setAdministradores(a) }).catch(() => { if (vigente) setAdministradores([]) })
    return () => { vigente = false }
  }, [])
  const por = porPedido === SISTEMA || administradores === null || administradores.some((a) => a.id === porPedido) ? porPedido : ''

  // La búsqueda se escribe sin pedir nada en cada tecla: pasa a la dirección cuando se deja de teclear un momento.
  const [textoBusqueda, setTextoBusqueda] = useState(buscar)
  const enviado = useRef(buscar)
  useEffect(() => {
    if (buscar !== enviado.current) { enviado.current = buscar; setTextoBusqueda(buscar) }   // cambió desde fuera («Ver todo lo de…», atrás)
  }, [buscar])
  useEffect(() => {
    const limpio = textoBusqueda.trim()
    if (limpio === enviado.current.trim()) return
    const espera = setTimeout(() => { enviado.current = limpio; cambiar({ q: limpio || null }, { reemplazar: true }) }, ESPERA_BUSQUEDA_MS)
    return () => clearTimeout(espera)
  }, [textoBusqueda, cambiar])

  // Solo depende de lo que se filtra: cambiar de página o de periodo vuelve a pedir la lista, nada más.
  const filtros: FiltrosAuditoria = useMemo(() => ({ rango, evento, por, grupo, buscar }), [rango, evento, por, grupo, buscar])
  const [resultado, setResultado] = useState<Pagina | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (demasiado) return
    let vigente = true
    setCargando(true)
    consultarAcciones(filtros, pagina)
      .then(async (r) => ({ ...r, nombres: await nombresDeRegistros(r.acciones).catch(() => new Map<string, string>()) }))
      .then((r) => { if (vigente) { setResultado(r); setError(null) } })
      .catch(() => { if (vigente) { setResultado(null); setError('No se pudo cargar la bitácora') } })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [filtros, pagina, demasiado, intento])

  const total = resultado?.total ?? 0
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA_AUDITORIA))
  // Si la dirección pide una página que ya no existe (se cambió un filtro, o se escribió a mano), se va a la última.
  useEffect(() => {
    if (!cargando && resultado && resultado.acciones.length === 0 && resultado.total > 0 && pagina > 1) {
      cambiar({ pagina: paginas > 1 ? String(paginas) : null }, { reemplazar: true })
    }
  }, [cargando, resultado, pagina, paginas, cambiar])

  const hayFiltros = !!(evento || por || grupo || buscar)
  const desdeFila = (pagina - 1) * POR_PAGINA_AUDITORIA
  const ahora = useMemo(() => new Date(), [resultado])   // eslint-disable-line react-hooks/exhaustive-deps -- «hace 20 min» se calcula al llegar los datos

  // Las acciones, en grupos por día.
  const dias = useMemo(() => {
    const grupos: { dia: string; acciones: AccionAuditoria[] }[] = []
    for (const a of resultado?.acciones ?? []) {
      const dia = diaEcuador(a.created_at)
      const ultimo = grupos[grupos.length - 1]
      if (ultimo && ultimo.dia === dia) ultimo.acciones.push(a)
      else grupos.push({ dia, acciones: [a] })
    }
    return grupos
  }, [resultado])

  // --- detalle ---
  const [seleccion, setSeleccion] = useState<AccionAuditoria | null>(null)

  // --- exportar ---
  const [exportAbierto, setExportAbierto] = useState(false)
  const [exportando, setExportando] = useState(false)
  const nombreAdmin = por === SISTEMA ? 'Sistema' : administradores?.find((a) => a.id === por)
  const filtrosEnPalabras = [
    `Atajo: ${GRUPOS.find((g) => g.id === grupo)?.texto ?? 'Todo'}`,
    buscar ? `Búsqueda: «${buscar}»` : 'Sin búsqueda',
    evento && `Evento: ${EVENTOS[evento].texto}`,
    por && `Realizado por: ${typeof nombreAdmin === 'string' ? nombreAdmin : nombreAdmin ? nombreDe(nombreAdmin) : ''}`,
  ].filter((x): x is string => !!x)

  const exportar = async (modo: ModoFilas) => {
    setExportando(true)
    try {
      const r = await consultarAcciones(filtros, 1, MAXIMO_EXPORTAR)
      const nombres = await nombresDeRegistros(r.acciones).catch(() => new Map<string, string>())
      const generado = new Date()
      const { bytes, filas, recortado } = excelDeAuditoria({ acciones: r.acciones, nombres, modo, periodo: nombrePeriodo, filtros: filtrosEnPalabras, totalAcciones: r.total, generado })
      descargarBinario(`auditoria-${rango.desde}-a-${rango.hasta}.xlsx`, bytes, TIPO_XLSX)
      if (recortado) notificar('aviso', `El Excel trae las primeras ${conMiles(filas)} filas. Acota el periodo para descargar el resto`)
      else notificar('ok', `Excel listo: ${conMiles(filas)} ${filas === 1 ? 'fila' : 'filas'}`)
      setExportAbierto(false)
      try {
        await registrarExportacionAuditoria(rango, filas, [TEXTO_MODO[modo], ...filtrosEnPalabras].join(' · '))
        setIntento((n) => n + 1)   // la descarga ya quedó anotada: se ve en la lista
      } catch {
        notificar('aviso', 'El archivo salió, pero no se pudo anotar la exportación en Auditoría')
      }
    } catch {
      notificar('error', 'No se pudo preparar la exportación. Intenta de nuevo')
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <EncabezadoPagina titulo="Auditoría" detalle={`Registro inmutable de los cambios en el sistema · ${nombrePeriodo}`}>
        <button type="button" aria-haspopup="dialog" aria-expanded={exportAbierto} disabled={!resultado || resultado.total === 0 || demasiado || exportando} onClick={() => setExportAbierto(true)}
          className="rounded-[11px] bg-ambar px-4 py-2.5 text-[13px] font-extrabold text-ambar-tinta shadow-[0_6px_16px_rgba(245,166,35,.3)] hover:brightness-95 disabled:opacity-50 max-sm:w-full">
          {exportando ? 'Preparando…' : 'Exportar a Excel'}
        </button>
      </EncabezadoPagina>

      <div className="space-y-5 p-4 sm:p-7">
        <BarraFiltros f={f} conSede={false} />

        {demasiado && <Aviso tipo="error">{avisoRangoLargo}</Aviso>}

        {!demasiado && (
          <>
            <div role="group" aria-label="Atajos" className="flex flex-wrap gap-2">
              {[{ id: '' as const, texto: 'Todo', cuantas: resultado?.conteos.todo }, ...GRUPOS.map((g) => ({ ...g, cuantas: resultado?.conteos[g.id] }))].map((g) => {
                const activo = grupo === g.id
                return (
                  <button key={g.id || 'todo'} type="button" aria-pressed={activo} onClick={() => cambiar({ grupo: g.id })}
                    className={`min-h-11 rounded-full border px-4 text-[13px] font-bold ${activo ? 'border-marino bg-marino text-white' : 'border-borde bg-white text-marino hover:bg-lienzo'}`}>
                    {g.texto}{g.cuantas !== undefined && <b className={`ml-2 font-extrabold ${activo ? 'text-borde-suave' : 'text-etiqueta'}`}>{conMiles(g.cuantas)}</b>}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex min-h-11 min-w-[240px] flex-1 items-center gap-2.5 rounded-[11px] border border-borde bg-white px-3.5 focus-within:border-marino">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none text-etiqueta"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <span className="sr-only">Buscar por nombre</span>
                <input type="search" value={textoBusqueda} maxLength={80} onChange={(e) => setTextoBusqueda(e.target.value)} placeholder="Buscar por nombre: una persona, una sede…"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-marino outline-none placeholder:text-etiqueta" />
              </label>
              <select aria-label="Evento" value={evento} onChange={(e) => cambiar({ evento: e.target.value })} className={`${selector} min-h-11`}>
                <option value="">Evento: todos</option>
                {Object.entries(EVENTOS).map(([valor, e]) => <option key={valor} value={valor}>{e.texto}</option>)}
              </select>
              <select aria-label="Realizado por" value={por} onChange={(e) => cambiar({ por: e.target.value })} className={`${selector} min-h-11`}>
                <option value="">Realizado por: todos</option>
                <option value={SISTEMA}>Sistema</option>
                {(administradores ?? []).map((a) => <option key={a.id} value={a.id}>{nombreDe(a)}</option>)}
              </select>
              {hayFiltros && (
                <button type="button" onClick={() => { setTextoBusqueda(''); cambiar({ evento: null, por: null, grupo: null, q: null }) }}
                  className="min-h-11 rounded-[11px] border border-marino bg-white px-3.5 text-[13px] font-extrabold text-marino hover:bg-lienzo">Borrar filtros</button>
              )}
            </div>

            <section aria-label="Cambios registrados" className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <h2 className="text-[17px] font-extrabold text-marino">Cambios del periodo</h2>
                {resultado && (
                  <span className="rounded-full bg-celeste px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-marino">
                    {conMiles(total)} {total === 1 ? 'acción' : 'acciones'} · {conMiles(resultado.datos)} {resultado.datos === 1 ? 'dato cambiado' : 'datos cambiados'}
                  </span>
                )}
              </div>

              {error && (
                <Aviso tipo="error">
                  {error}.{' '}
                  <button type="button" onClick={() => setIntento((n) => n + 1)} className="underline">Reintentar</button>
                </Aviso>
              )}

              <div aria-busy={cargando} className={`@container overflow-hidden rounded-[18px] border border-borde-suave bg-white transition-opacity ${cargando && resultado ? 'opacity-60' : ''}`}>
                {cargando && !resultado && !error && <p className="p-6 text-sm font-semibold text-texto-suave">Cargando…</p>}
                {!cargando && !error && total === 0 && (
                  <p className="p-6 text-sm font-semibold text-texto-suave">{hayFiltros ? 'No hay acciones que coincidan con esos filtros.' : 'No hubo cambios en este periodo.'}</p>
                )}
                {resultado && dias.map((g) => (
                  <div key={g.dia}>
                    <h3 className="border-t border-lienzo bg-cabecera px-4 py-3 text-xs font-extrabold uppercase tracking-[.06em] text-etiqueta first:border-t-0 @3xl:px-6">{tituloDeDia(g.dia, hoy)}</h3>
                    {g.acciones.map((a) => <Fila key={a.id} accion={a} nombres={resultado.nombres} ahora={ahora} alAbrir={() => setSeleccion(a)} />)}
                  </div>
                ))}
                {total > 0 && <p className="border-t border-lienzo px-5 py-3 text-xs font-semibold text-etiqueta">Mostrando {desdeFila + 1}–{desdeFila + (resultado?.acciones.length ?? 0)} de {conMiles(total)} · de la más reciente a la más antigua</p>}
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
          </>
        )}
      </div>

      <PanelLateral titulo="Detalle del cambio" abierto={seleccion !== null} alCerrar={() => setSeleccion(null)}>
        {seleccion && resultado && (
          <Detalle accion={seleccion} nombres={resultado.nombres} alVerTodo={(nombre) => { setSeleccion(null); setTextoBusqueda(nombre); enviado.current = nombre; cambiar({ q: nombre }) }} />
        )}
      </PanelLateral>

      {exportAbierto && resultado && (
        <ExportarAuditoriaDialogo periodo={nombrePeriodo} filtros={filtrosEnPalabras} acciones={resultado.total} datos={resultado.datos} filas={resultado.filas}
          ocupado={exportando} alCerrar={() => setExportAbierto(false)} alDescargar={exportar} />
      )}
    </>
  )
}
