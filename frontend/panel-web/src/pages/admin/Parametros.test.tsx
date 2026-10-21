import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../../lib/supabase'
import { renderConAuth } from '../../test/helpers'
import Parametros from './Parametros'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const FILA = {
  tolerancia_min: 10, almuerzo_max_min: 60, plazo_justificacion_h: 48, plazo_revision_h: 48, velocidad_max_kmh: 120, max_marcaciones_web_30d: 3,
  updated_at: '2026-10-20T15:00:00Z', updated_by: 'u9',
}

const respuesta = (resultado: { data: unknown; error: unknown }) => {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'maybeSingle', 'update']) c[m] = vi.fn(() => c)
  c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, ko)
  return c
}

/** `leer` = lo que devuelve la tabla `configuracion` al cargar; `escribir` = lo que devuelve al guardar. */
type Resultado = { data: unknown; error: unknown }
function simular({ leer = { data: FILA, error: null } as Resultado, escribir = { data: { ...FILA, tolerancia_min: 15 }, error: null } as Resultado } = {}) {
  const actualizar = respuesta(escribir)
  let primera = true
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => {
    if (tabla === 'usuarios') return respuesta({ data: { nombres: 'Susana', apellidos: 'Salán' }, error: null })
    if (primera) { primera = false; return respuesta(leer) }
    return actualizar
  }) as never)
  return actualizar
}

const campo = (nombre: string) => screen.getByLabelText(nombre) as HTMLInputElement

beforeEach(() => vi.mocked(supabase.from).mockReset())

describe('Configuración · Parámetros', () => {
  it('muestra los seis parámetros con su valor actual y quién lo cambió por última vez', async () => {
    simular()
    renderConAuth(<Parametros />)
    expect(await screen.findByLabelText('Tolerancia de puntualidad')).toBeInTheDocument()
    expect(campo('Tolerancia de puntualidad').value).toBe('10')
    expect(campo('Duración máxima del almuerzo').value).toBe('60')
    expect(campo('Plazo para justificar').value).toBe('48')
    expect(campo('Plazo de revisión').value).toBe('48')
    expect(campo('Velocidad máxima creíble').value).toBe('120')
    expect(campo('Marcaciones web permitidas').value).toBe('3')
    expect(screen.getAllByText(/≈ 2 días/)).toHaveLength(2)
    expect(await screen.findByText(/Susana Salán/)).toBeInTheDocument()
  })

  it('«Guardar cambios» está apagado hasta que algo cambia y marca el campo como sin guardar', async () => {
    simular()
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Tolerancia de puntualidad')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    await userEvent.clear(campo('Tolerancia de puntualidad'))
    await userEvent.type(campo('Tolerancia de puntualidad'), '15')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
  })

  it('pide confirmación con el antes y el después y luego guarda solo lo que cambió', async () => {
    const actualizar = simular()
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.clear(campo('Tolerancia de puntualidad'))
    await userEvent.type(campo('Tolerancia de puntualidad'), '15')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Tolerancia de puntualidad: 10 → 15 min/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument()
    expect(actualizar.update).toHaveBeenCalledWith({ tolerancia_min: 15 })
    expect(actualizar.eq).toHaveBeenCalledWith('id', 1)
    expect(campo('Tolerancia de puntualidad').value).toBe('15')
    expect(screen.queryByText('Sin guardar')).toBeNull()
  })

  it('un valor fuera de rango no se guarda y se explica', async () => {
    const actualizar = simular()
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Duración máxima del almuerzo')
    await userEvent.clear(campo('Duración máxima del almuerzo'))
    await userEvent.type(campo('Duración máxima del almuerzo'), '5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Escribe un número entero entre 15 y 180')).toBeInTheDocument()
    expect(screen.getByText('Revisa los valores marcados en rojo')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(actualizar.update).not.toHaveBeenCalled()
  })

  it('«Restablecer» pone los valores de fábrica en los campos pero no guarda hasta confirmar', async () => {
    const actualizar = simular({ leer: { data: { ...FILA, tolerancia_min: 25, plazo_justificacion_h: 72 }, error: null } })
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Tolerancia de puntualidad')
    expect(campo('Tolerancia de puntualidad').value).toBe('25')
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(campo('Tolerancia de puntualidad').value).toBe('10')
    expect(campo('Plazo para justificar').value).toBe('48')
    expect(actualizar.update).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })

  it('si la base rechaza el cambio (por ejemplo, sin permiso) lo dice y conserva lo escrito', async () => {
    simular({ escribir: { data: null, error: null } })
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.clear(campo('Tolerancia de puntualidad'))
    await userEvent.type(campo('Tolerancia de puntualidad'), '20')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument()
    expect(campo('Tolerancia de puntualidad').value).toBe('20')
  })

  it('si no se puede leer la configuración lo avisa', async () => {
    simular({ leer: { data: null, error: { message: 'x' } } })
    renderConAuth(<Parametros />)
    expect(await screen.findByText('No se pudo cargar la configuración')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByLabelText('Tolerancia de puntualidad')).toBeNull())
  })
})
