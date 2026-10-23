import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { supabase } from '../../lib/supabase'
import { renderConAuth } from '../../test/helpers'
import Parametros from './Parametros'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

const FILA = {
  tolerancia_min: 10, almuerzo_max_min: 60, plazo_justificacion_h: 48, plazo_revision_h: 48, velocidad_max_kmh: 120, max_marcaciones_web_30d: 3, max_horas_sin_conexion: 48,
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
  it('muestra los siete parámetros con su valor actual y quién lo cambió por última vez', async () => {
    simular()
    renderConAuth(<Parametros />)
    expect(await screen.findByLabelText('Tolerancia de puntualidad')).toBeInTheDocument()
    expect(campo('Tolerancia de puntualidad').value).toBe('10')
    expect(campo('Duración máxima del almuerzo').value).toBe('60')
    expect(campo('Plazo para justificar').value).toBe('48')
    expect(campo('Plazo de revisión').value).toBe('48')
    expect(campo('Velocidad máxima creíble').value).toBe('120')
    expect(campo('Marcaciones web permitidas').value).toBe('3')
    expect(campo('Plazo para enviar una marcación sin conexión').value).toBe('48')
    expect(screen.getAllByText(/≈ 2 días/)).toHaveLength(3)
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

  it('el plazo para enviar una marcación sin conexión se cambia, se confirma con el antes y el después y se guarda', async () => {
    const actualizar = simular()
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Plazo para enviar una marcación sin conexión')
    expect(screen.getByText('Seguridad de la marcación')).toBeInTheDocument()
    await userEvent.clear(campo('Plazo para enviar una marcación sin conexión'))
    await userEvent.type(campo('Plazo para enviar una marcación sin conexión'), '72')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Plazo para enviar una marcación sin conexión: 48 → 72 h/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/Configuración guardada/)).toBeInTheDocument()
    expect(actualizar.update).toHaveBeenCalledWith({ max_horas_sin_conexion: 72 })
  })

  it('el plazo sin conexión admite de 1 a 168 horas (una semana)', async () => {
    const actualizar = simular()
    renderConAuth(<Parametros />)
    await screen.findByLabelText('Plazo para enviar una marcación sin conexión')
    for (const mal of ['0', '169']) {
      await userEvent.clear(campo('Plazo para enviar una marcación sin conexión'))
      await userEvent.type(campo('Plazo para enviar una marcación sin conexión'), mal)
      await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
      expect(await screen.findByText('Escribe un número entero entre 1 y 168')).toBeInTheDocument()
    }
    expect(actualizar.update).not.toHaveBeenCalled()
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


describe('Configuración · Reconocimiento facial', () => {
  const FILA_ROSTRO = {
    rostro_umbral: 0.4, rostro_umbral_registro: 0.35, vida_umbral: 0.5, giro_max_registro_frente: 0.3, giro_max_registro_leve: 0.6,
    giro_max_marcacion: 0.4, brillo_min: 50, brillo_max: 215, nitidez_min: 40, rostro_min_px: 90, foto_min_px: 200,
    updated_at: null, updated_by: null,
  }
  const abrir = async (extra: Parameters<typeof simular>[0] = {}) => {
    const actualizar = simular({ leer: { data: FILA_ROSTRO, error: null }, escribir: { data: { ...FILA_ROSTRO, rostro_umbral: 0.55 }, error: null }, ...extra })
    renderConAuth(<Parametros seccion="rostro" />)
    await screen.findByLabelText('Parecido mínimo al marcar')
    return { actualizar }   // envuelto: la cadena de supabase es «thenable» y un `await` la resolvería
  }

  it('muestra los once umbrales; los decimales con dos cifras y los demás como enteros', async () => {
    await abrir()
    expect(campo('Parecido mínimo al marcar').value).toBe('0.40')
    expect(campo('Parecido mínimo en el registro').value).toBe('0.35')
    expect(campo('Probabilidad mínima de rostro real').value).toBe('0.50')
    expect(campo('Giro máximo · foto de frente (registro)').value).toBe('0.30')
    expect(campo('Giro máximo · fotos con giro (registro)').value).toBe('0.60')
    expect(campo('Giro máximo · selfie al marcar').value).toBe('0.40')
    expect(campo('Luz mínima').value).toBe('50')
    expect(campo('Luz máxima').value).toBe('215')
    expect(campo('Nitidez mínima').value).toBe('40')
    expect(campo('Tamaño mínimo del rostro').value).toBe('90')
    expect(campo('Tamaño mínimo de la foto').value).toBe('200')
    expect(screen.queryByLabelText('Tolerancia de puntualidad')).toBeNull()
  })

  it('pide solo las columnas del rostro (no las de las reglas)', async () => {
    simular({ leer: { data: FILA_ROSTRO, error: null } })
    renderConAuth(<Parametros seccion="rostro" />)
    await screen.findByLabelText('Parecido mínimo al marcar')
    const pedido = vi.mocked(supabase.from).mock.results[0]!.value as { select: ReturnType<typeof vi.fn> }
    const columnas = String(pedido.select.mock.calls[0]![0])
    expect(columnas).toContain('rostro_umbral')
    expect(columnas).toContain('foto_min_px')
    expect(columnas).not.toContain('tolerancia_min')
  })

  it('guarda un decimal, acepta la coma y muestra el antes y el después con sus decimales', async () => {
    const { actualizar } = await abrir()
    await userEvent.clear(campo('Parecido mínimo al marcar'))
    await userEvent.type(campo('Parecido mínimo al marcar'), '0,55')
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText(/Parecido mínimo al marcar: 0\.40 → 0\.55/)).toBeInTheDocument()
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/se aplica desde la próxima marcación o registro de rostro/i)).toBeInTheDocument()
    expect(actualizar.update).toHaveBeenCalledWith({ rostro_umbral: 0.55 })
    expect(campo('Parecido mínimo al marcar').value).toBe('0.55')
  })

  it('un valor escrito igual al guardado (0.4 contra 0.40) no cuenta como cambio', async () => {
    await abrir()
    await userEvent.clear(campo('Parecido mínimo al marcar'))
    await userEvent.type(campo('Parecido mínimo al marcar'), '0.4')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled()
    expect(screen.queryByText('Sin guardar')).toBeNull()
  })

  it('rechaza lo que está fuera de rango o tiene demasiados decimales', async () => {
    const { actualizar } = await abrir()
    await userEvent.clear(campo('Parecido mínimo al marcar'))
    await userEvent.type(campo('Parecido mínimo al marcar'), '0.123')
    await userEvent.clear(campo('Probabilidad mínima de rostro real'))
    await userEvent.type(campo('Probabilidad mínima de rostro real'), '1.5')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findAllByText('Escribe un número entre 0.10 y 0.95 (hasta 2 decimales)')).toHaveLength(1)
    expect(screen.getByText('Escribe un número entre 0.05 y 0.99 (hasta 2 decimales)')).toBeInTheDocument()
    expect(actualizar.update).not.toHaveBeenCalled()
  })

  it('la luz mínima debe ser menor que la máxima', async () => {
    const { actualizar } = await abrir()
    await userEvent.clear(campo('Luz mínima'))
    await userEvent.type(campo('Luz mínima'), '220')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    expect(await screen.findByText('Debe ser mayor que la luz mínima')).toBeInTheDocument()
    expect(actualizar.update).not.toHaveBeenCalled()
  })

  it('«Restablecer» pone los valores de fábrica del rostro sin guardar', async () => {
    await abrir({ leer: { data: { ...FILA_ROSTRO, rostro_umbral: 0.62, brillo_min: 80 }, error: null } })
    expect(campo('Parecido mínimo al marcar').value).toBe('0.62')
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer' }))
    expect(campo('Parecido mínimo al marcar').value).toBe('0.40')
    expect(campo('Luz mínima').value).toBe('50')
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  })
})
