import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import Anomalias from './Anomalias'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const ana = { nombres: 'Ana', apellidos: 'Pérez', email: 'ana@x.ec' }
const luis = { nombres: 'Luis', apellidos: 'Mora', email: 'luis@x.ec' }
const FILAS = [
  { id: 'a3', numero: 3, tipo: 'sin_salida', estado: 'justificada', detalle: 'Sin salida el lunes', created_at: '2026-10-19T22:00:00Z', usuarios: ana },
  { id: 'a2', numero: 2, tipo: 'fuera_geocerca', estado: 'sin_justificar', detalle: 'A 120 m del centro', created_at: '2026-10-18T14:00:00Z', usuarios: luis },
  { id: 'a1', numero: 1, tipo: 'fuera_horario', estado: 'en_revision', detalle: 'Ingreso 08:30; el límite era 08:10', created_at: '2026-10-17T13:00:00Z', usuarios: ana },
  { id: 'a0', numero: 0, tipo: 'duplicada', estado: 'pendiente', detalle: null, created_at: '2026-10-16T13:00:00Z', usuarios: ana },
]

function simular(resultado: { data: unknown; error: unknown } = { data: FILAS, error: null }) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit']) c[m] = () => c
  c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
  vi.mocked(supabase.from).mockReturnValue(c as never)
}

const pantalla = () => renderConAuth(
  <Routes><Route path="/admin/anomalias" element={<Anomalias />} /></Routes>,
  { perfil: perfilDe('administrador') }, '/admin/anomalias',
)
const casos = () => screen.getAllByRole('link', { name: /Revisar el caso/ }).map((a) => a.getAttribute('aria-label'))

describe('Anomalías · bandeja', () => {
  beforeEach(() => simular())

  it('abre en «Por resolver» con lo más antiguo primero', async () => {
    pantalla()
    await screen.findByText('Luis Mora')
    expect(casos()).toEqual(['Revisar el caso A-1', 'Revisar el caso A-2'])
    expect(screen.getByText('2 por resolver · 4 en total')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Por resolver' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('cada fila lleva al detalle del caso', async () => {
    pantalla()
    await screen.findByText('Luis Mora')
    expect(screen.getByRole('link', { name: 'Revisar el caso A-2' })).toHaveAttribute('href', '/admin/anomalias/a2')
  })

  it('el filtro de estado cambia la lista y las resueltas salen de la más reciente', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    await u.click(screen.getByRole('button', { name: 'Resueltas' }))
    expect(casos()).toEqual(['Revisar el caso A-3'])
    await u.click(screen.getByRole('button', { name: 'Esperando a la persona' }))
    expect(casos()).toEqual(['Revisar el caso A-0'])
    await u.click(screen.getByRole('button', { name: 'Todas' }))
    expect(casos()).toEqual(['A-3', 'A-2', 'A-1', 'A-0'].map((c) => `Revisar el caso ${c}`))
  })

  it('busca por persona y filtra por tipo', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByText('Luis Mora')
    await u.click(screen.getByRole('button', { name: 'Todas' }))
    await u.type(screen.getByLabelText('Buscar'), 'luis')
    expect(casos()).toEqual(['Revisar el caso A-2'])
    await u.clear(screen.getByLabelText('Buscar'))
    await u.selectOptions(screen.getByLabelText('Tipo'), 'sin_salida')
    expect(casos()).toEqual(['Revisar el caso A-3'])
    await u.selectOptions(screen.getByLabelText('Tipo'), 'duplicada')
    await u.type(screen.getByLabelText('Buscar'), 'zzz')
    expect(screen.getByText('No hay anomalías que coincidan.')).toBeInTheDocument()
  })

  it('muestra el estado, el tipo y el detalle de cada caso', async () => {
    pantalla()
    const fila = (await screen.findByText('Luis Mora')).closest('article') as HTMLElement
    expect(within(fila).getByText('#A-2')).toBeInTheDocument()
    expect(within(fila).getByText('LM')).toBeInTheDocument()
    expect(within(fila).getByText('Marcación fuera de la zona')).toBeInTheDocument()
    expect(within(fila).getByText('Sin justificar')).toBeInTheDocument()
    expect(within(fila).getByText('A 120 m del centro')).toBeInTheDocument()
    expect(within(fila).getByText('18 oct · 09:00')).toBeInTheDocument()
  })

  it('sin casos por resolver felicita; con error de carga avisa', async () => {
    simular({ data: [FILAS[0]], error: null })
    const { unmount } = pantalla()
    expect(await screen.findByText('No hay casos por resolver. ¡Todo al día!')).toBeInTheDocument()
    unmount()
    simular({ data: null, error: { message: 'x' } })
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la bandeja de anomalías')
  })

  it('reparte los casos en páginas de 9 y vuelve a la primera al filtrar', async () => {
    const muchas = Array.from({ length: 11 }, (_, i) => ({
      id: `m${i}`, numero: 100 + i, tipo: 'fuera_geocerca', estado: 'en_revision', detalle: null,
      created_at: `2026-10-${String(10 + i).padStart(2, '0')}T13:00:00Z`, usuarios: ana,
    }))
    simular({ data: muchas, error: null })
    pantalla()
    const u = userEvent.setup()
    await screen.findAllByRole('article')
    expect(screen.getAllByRole('article')).toHaveLength(9)
    expect(screen.getByText('Mostrando 1–9 de 11')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '‹ Anterior' })).toBeDisabled()
    await u.click(screen.getByRole('button', { name: 'Siguiente ›' }))
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByText('Mostrando 10–11 de 11')).toBeInTheDocument()
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente ›' })).toBeDisabled()
    await u.type(screen.getByLabelText('Buscar'), 'ana')
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('las sospechosas según la IA van primero en «Por resolver» y llevan su etiqueta', async () => {
    simular({ data: [
      { ...FILAS[1], justificaciones: { clasificacion_ia: null } },                       // A-2 (más reciente, sin clasificar)
      { ...FILAS[2], justificaciones: [{ clasificacion_ia: 'sospechosa' }] },             // A-1 (la sospechosa)
      { id: 'a9', numero: 9, tipo: 'sin_salida', estado: 'en_revision', detalle: null, created_at: '2026-10-10T13:00:00Z', usuarios: ana,
        justificaciones: { clasificacion_ia: 'aceptable' } },                             // A-9 (la más antigua)
    ], error: null })
    pantalla()
    await screen.findAllByRole('article')
    expect(casos()).toEqual(['Revisar el caso A-1', 'Revisar el caso A-9', 'Revisar el caso A-2'])
    expect(screen.getByText('IA: sospechosa')).toBeInTheDocument()
    expect(screen.getByText('IA: aceptable')).toBeInTheDocument()
  })
})
