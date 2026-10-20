import { useEffect, useMemo, useState } from 'react'
import { EncabezadoPagina } from '../../components/EncabezadoPagina'
import { Aviso } from '../../components/ui'
import { TarjetaAnomalia } from './TarjetaAnomalia'
import { supabase } from '../../lib/supabase'
import {
  ESTADOS_POR_RESOLVER, FILTROS, TIPOS_ANOMALIA, caso, clasificacionDe, nombreDe,
  type FilaAnomalia, type FiltroEstado,
} from './anomaliasTipos'

const selectorFiltro = 'rounded-[11px] border border-borde bg-white px-3 py-2.5 text-[13px] font-bold text-marino outline-none focus:border-marino'
const LIMITE = 500
const POR_PAGINA = 9

export default function Anomalias() {
  const [filas, setFilas] = useState<FilaAnomalia[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<FiltroEstado>('por_resolver')
  const [tipo, setTipo] = useState('')
  const [texto, setTexto] = useState('')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    let vigente = true
    void (async () => {
      const r = await supabase
        .from('anomalias')
        .select('id, numero, tipo, estado, detalle, created_at, usuarios(nombres, apellidos, email), justificaciones(clasificacion_ia)')
        .order('created_at', { ascending: false })
        .limit(LIMITE)
      if (!vigente) return
      if (r.error) setError('No se pudo cargar la bandeja de anomalías')
      else setFilas((r.data ?? []) as unknown as FilaAnomalia[])
      setCargando(false)
    })()
    return () => { vigente = false }
  }, [])

  useEffect(() => { setPagina(1) }, [filtro, tipo, texto])

  const porResolver = filas.filter((f) => ESTADOS_POR_RESOLVER.includes(f.estado)).length

  const visibles = useMemo(() => {
    const estados = FILTROS.find((f) => f.valor === filtro)?.estados ?? null
    const q = texto.trim().toLowerCase()
    const lista = filas.filter((f) =>
      (!estados || estados.includes(f.estado)) &&
      (!tipo || f.tipo === tipo) &&
      (!q || `${nombreDe(f.usuarios)} ${f.usuarios?.email ?? ''} ${caso(f.numero)}`.toLowerCase().includes(q)),
    )
    // En la bandeja de pendientes van primero las que la IA marcó como sospechosas y luego lo más antiguo; en los demás, lo más reciente.
    if (filtro !== 'por_resolver') return lista
    const prioridad = (f: FilaAnomalia) => (clasificacionDe(f) === 'sospechosa' ? 0 : 1)
    return [...lista].reverse().sort((a, b) => prioridad(a) - prioridad(b))
  }, [filas, filtro, tipo, texto])

  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA))
  const actual = Math.min(pagina, paginas)
  const desde = (actual - 1) * POR_PAGINA
  const enPagina = visibles.slice(desde, desde + POR_PAGINA)

  return (
    <>
      <EncabezadoPagina titulo="Anomalías" detalle={`${porResolver} por resolver · ${filas.length} en total`}>
        <input aria-label="Buscar" placeholder="Buscar persona o caso…" value={texto} onChange={(e) => setTexto(e.target.value)}
          className="w-[220px] rounded-[11px] border border-borde px-3.5 py-2.5 text-[13px] font-bold text-marino outline-none placeholder:text-placeholder focus:border-marino" />
        <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={selectorFiltro}>
          <option value="">Tipo: todos</option>
          {TIPOS_ANOMALIA.map((t) => <option key={t.valor} value={t.valor}>{t.texto}</option>)}
        </select>
      </EncabezadoPagina>

      <div className="space-y-3 p-7">
        <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button key={f.valor} onClick={() => setFiltro(f.valor)} aria-pressed={filtro === f.valor}
              className={`rounded-full border px-3.5 py-2 text-[13px] font-extrabold ${filtro === f.valor ? 'border-marino bg-marino text-white' : 'border-borde bg-white text-marino hover:bg-lienzo'}`}>
              {f.texto}
            </button>
          ))}
        </div>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {cargando && <p className="p-2 text-sm font-semibold text-texto-suave">Cargando…</p>}
        {!cargando && visibles.length === 0 && !error && (
          <p className="rounded-[18px] border border-borde-suave bg-white p-6 text-sm font-semibold text-texto-suave">
            {filtro === 'por_resolver' && filas.length > 0 && !texto && !tipo ? 'No hay casos por resolver. ¡Todo al día!' : 'No hay anomalías que coincidan.'}
          </p>
        )}
        <div className="grid gap-4 pt-1 md:grid-cols-2 2xl:grid-cols-3">
          {enPagina.map((f) => (
            <TarjetaAnomalia key={f.id} fila={f} />
          ))}
        </div>
        {visibles.length > 0 && (
          <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs font-semibold text-etiqueta">
              Mostrando {desde + 1}–{desde + enPagina.length} de {visibles.length}
            </p>
            {paginas > 1 && (
              <div className="flex items-center gap-2">
                <button onClick={() => setPagina(actual - 1)} disabled={actual === 1}
                  className="rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
                  ‹ Anterior
                </button>
                <span className="text-[13px] font-bold text-texto-suave">Página {actual} de {paginas}</span>
                <button onClick={() => setPagina(actual + 1)} disabled={actual === paginas}
                  className="rounded-[11px] border border-borde bg-white px-3.5 py-2 text-[13px] font-extrabold text-marino hover:bg-lienzo disabled:opacity-40">
                  Siguiente ›
                </button>
              </div>
            )}
          </nav>
        )}
      </div>
    </>
  )
}
