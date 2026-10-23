import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { renderConAuth } from '../../test/helpers'
import Configuracion from './Configuracion'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const FILA = {
  tolerancia_min: 10, almuerzo_max_min: 60, plazo_justificacion_h: 48, plazo_revision_h: 48, velocidad_max_kmh: 120, max_marcaciones_web_30d: 3,
  rostro_umbral: 0.4, rostro_umbral_registro: 0.35, vida_umbral: 0.5, giro_max_registro_frente: 0.3, giro_max_registro_leve: 0.6,
  giro_max_marcacion: 0.4, brillo_min: 50, brillo_max: 215, nitidez_min: 40, rostro_min_px: 90, foto_min_px: 200,
  updated_at: null, updated_by: null,
}
const FERIADOS = [{ id: 'f1', fecha_inicio: '2026-12-25', fecha_fin: '2026-12-25', nombre: 'Navidad', activo: true }]

function cadena(data: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'maybeSingle', 'update']) c[m] = () => c
  c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok, ko)
  return c
}

const pantalla = (ruta = '/admin/configuracion') =>
  renderConAuth(<Routes><Route path="/admin/configuracion" element={<Configuracion />} /></Routes>, {}, ruta)

beforeEach(() => {
  vi.mocked(supabase.from).mockReset()
  vi.mocked(supabase.from).mockImplementation(((tabla: string) => cadena(tabla === 'feriados' ? FERIADOS : FILA)) as never)
})

describe('Configuración · pestañas', () => {
  it('abre en Parámetros, con cuatro pestañas, y no carga los feriados todavía', async () => {
    pantalla()
    expect(await screen.findByLabelText('Tolerancia de puntualidad')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Parámetros' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Reconocimiento facial' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Feriados' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Inteligencia artificial' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeInTheDocument()
    expect(supabase.from).not.toHaveBeenCalledWith('feriados')
  })

  it('al pasar a Feriados muestra su lista y su botón, y ya no está «Guardar cambios»', async () => {
    pantalla()
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }))
    expect(await screen.findByText('Navidad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nuevo feriado' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Feriados' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'pestana-feriados')
  })

  it('la dirección ?tab=feriados abre directamente la pestaña de feriados', async () => {
    pantalla('/admin/configuracion?tab=feriados')
    expect(await screen.findByText('Navidad')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Feriados' })).toHaveAttribute('aria-selected', 'true')
  })

  it('una pestaña desconocida cae en Parámetros', async () => {
    pantalla('/admin/configuracion?tab=otra')
    expect(await screen.findByLabelText('Tolerancia de puntualidad')).toBeInTheDocument()
  })

  it('las flechas del teclado cambian de pestaña', async () => {
    pantalla()
    await screen.findByLabelText('Tolerancia de puntualidad')
    screen.getByRole('tab', { name: 'Parámetros' }).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByLabelText('Parecido mínimo al marcar')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Reconocimiento facial' })).toHaveFocus()
    await userEvent.keyboard('{ArrowRight}')
    expect(await screen.findByText('Navidad')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Feriados' })).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(await screen.findByLabelText('Tolerancia de puntualidad')).toBeInTheDocument()
  })

  it('la pestaña Reconocimiento facial muestra sus umbrales con decimales y no mezcla los de Parámetros', async () => {
    pantalla('/admin/configuracion?tab=rostro')
    expect(await screen.findByLabelText('Parecido mínimo al marcar')).toHaveValue('0.40')
    expect(screen.getByLabelText('Giro máximo · selfie al marcar')).toHaveValue('0.40')
    expect(screen.getByLabelText('Luz mínima')).toHaveValue('50')
    expect(screen.getByRole('tab', { name: 'Reconocimiento facial' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.queryByLabelText('Tolerancia de puntualidad')).toBeNull()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'pestana-rostro')
  })

  it('al pasar de Parámetros a Reconocimiento facial se cargan los umbrales del rostro', async () => {
    pantalla()
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.click(screen.getByRole('tab', { name: 'Reconocimiento facial' }))
    expect(await screen.findByLabelText('Parecido mínimo al marcar')).toBeInTheDocument()
    expect(screen.queryByLabelText('Tolerancia de puntualidad')).toBeNull()
  })
})

describe('Configuración · cambios sin guardar', () => {
  async function conCambios() {
    pantalla()
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.clear(screen.getByLabelText('Tolerancia de puntualidad'))
    await userEvent.type(screen.getByLabelText('Tolerancia de puntualidad'), '15')
  }

  it('avisa antes de salir de Parámetros y «Cancelar» deja todo como estaba', async () => {
    await conCambios()
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }))
    const aviso = await screen.findByRole('dialog', { name: 'Hay cambios sin guardar' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(aviso).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Parámetros' })).toHaveAttribute('aria-selected', 'true')
    expect((screen.getByLabelText('Tolerancia de puntualidad') as HTMLInputElement).value).toBe('15')
  })

  it('«Descartar y continuar» pasa a Feriados y al volver están los valores guardados', async () => {
    await conCambios()
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar y continuar' }))
    expect(await screen.findByText('Navidad')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Parámetros' }))   // sin aviso: ya no hay cambios
    await waitFor(() => expect((screen.getByLabelText('Tolerancia de puntualidad') as HTMLInputElement).value).toBe('10'))
  })

  it('también avisa al salir de Reconocimiento facial con cambios sin guardar', async () => {
    pantalla('/admin/configuracion?tab=rostro')
    await screen.findByLabelText('Parecido mínimo al marcar')
    await userEvent.clear(screen.getByLabelText('Parecido mínimo al marcar'))
    await userEvent.type(screen.getByLabelText('Parecido mínimo al marcar'), '0.5')
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }))
    expect(await screen.findByRole('dialog', { name: 'Hay cambios sin guardar' })).toBeInTheDocument()
  })

  it('sin cambios pasa de pestaña sin preguntar', async () => {
    pantalla()
    await screen.findByLabelText('Tolerancia de puntualidad')
    await userEvent.click(screen.getByRole('tab', { name: 'Feriados' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('Navidad')).toBeInTheDocument()
  })
})
