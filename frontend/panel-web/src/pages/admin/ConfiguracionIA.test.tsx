import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { renderConAuth } from '../../test/helpers'
import Configuracion from './Configuracion'
import type { ClaveIA, EstadoIA } from './iaTipos'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))
vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const clave = (c: Partial<ClaveIA> & Pick<ClaveIA, 'id' | 'nombre' | 'proveedor' | 'ultimos_4'>): ClaveIA => ({
  proveedor_nombre: { gemini: 'Gemini (Google)', anthropic: 'Claude (Anthropic)', openai: 'OpenAI' }[c.proveedor],
  modelo: null, modelo_predeterminado: { gemini: 'gemini-flash-latest', anthropic: 'claude-haiku-5-5', openai: 'gpt-4.1-mini' }[c.proveedor],
  activa: false, created_at: null, updated_at: null, ...c,
})
const BOT = clave({ id: 'c1', nombre: 'BOT', proveedor: 'openai', modelo: 'gpt-5.4', ultimos_4: 'kwMA', activa: true })
const PRUEBAS = clave({ id: 'c2', nombre: 'Pruebas', proveedor: 'gemini', ultimos_4: 'WXYZ' })
const CLAUDE = clave({ id: 'c3', nombre: 'Claude de respaldo', proveedor: 'anthropic', modelo: 'claude-sonnet-5-5', ultimos_4: 'AB12' })
const ESTADO: EstadoIA = {
  puede_guardar_llaves: true,
  proveedores: [
    { id: 'gemini', nombre: 'Gemini (Google)', modelo_predeterminado: 'gemini-flash-latest' },
    { id: 'anthropic', nombre: 'Claude (Anthropic)', modelo_predeterminado: 'claude-haiku-5-5' },
    { id: 'openai', nombre: 'OpenAI', modelo_predeterminado: 'gpt-4.1-mini' },
  ],
  claves: [BOT, PRUEBAS, CLAUDE],
  en_uso: { origen: 'panel', nombre: 'BOT', proveedor: 'openai', proveedor_nombre: 'OpenAI', modelo: 'gpt-5.4' },
  activa_ilegible: false,
}
const LLAVE = 'sk-Ejemplo1234567890abcdWXYZ'

type Op = { method?: string; body?: Record<string, unknown> }
const responder = (extra: (ruta: string, op?: Op) => unknown = () => undefined, estado: EstadoIA = ESTADO) =>
  vi.mocked(api).mockImplementation((async (ruta: string, op?: Op) => {
    if (ruta === '/ia/claves' && !op?.method) return estado
    const r = extra(ruta, op)
    if (r instanceof Error) throw r
    return r ?? {}
  }) as never)
const llamadas = (ruta: string, metodo?: string) => vi.mocked(api).mock.calls.filter(([r, o]) => r === ruta && (metodo ? (o as Op | undefined)?.method === metodo : true))
const tarjeta = (nombre: RegExp | string) => within(screen.getByRole('region', { name: nombre }))

/** Abre la pestaña y espera a que carguen las tarjetas (salvo que se indique otra cosa). */
async function pantalla(esperar = true) {
  renderConAuth(<Routes><Route path="/admin/configuracion" element={<Configuracion />} /></Routes>, {}, '/admin/configuracion?tab=ia')
  if (esperar) await screen.findAllByRole('region')
}

beforeEach(() => {
  vi.mocked(api).mockReset()
  responder()
})

describe('Configuración · Inteligencia artificial', () => {
  it('muestra una tarjeta por clave, la activa primero, y qué IA está en uso', async () => {
    await pantalla()
    const regiones = screen.getAllByRole('region')
    expect(regiones.map((r) => r.querySelector('h2')?.textContent)).toEqual(['BOT', 'Pruebas', 'Claude de respaldo'])
    expect(screen.getAllByText('Activa')).toHaveLength(1)
    expect(tarjeta('BOT').getByText('Activa')).toBeInTheDocument()
    expect(tarjeta('BOT').getByText('OpenAI')).toBeInTheDocument()
    expect(tarjeta('BOT').getByText('gpt-5.4')).toBeInTheDocument()
    expect(tarjeta('BOT').getByText(/termina en …kwMA/)).toBeInTheDocument()
    expect(tarjeta('Pruebas').getByText('Inactiva')).toBeInTheDocument()
    expect(tarjeta('Pruebas').getByText('recomendado (gemini-flash-latest)')).toBeInTheDocument()
    expect(screen.getByText('En uso ahora:')).toBeInTheDocument()
    expect(screen.getByText(/OpenAI · gpt-5.4/)).toBeInTheDocument()
    expect(screen.queryByText(/ia-llave|sk-/)).not.toBeInTheDocument()
  })

  it('las tarjetas solo se leen: no tienen campos; Activar solo en las inactivas', async () => {
    await pantalla()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(tarjeta('BOT').queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument()
    expect(tarjeta('Pruebas').getByRole('button', { name: 'Activar' })).toBeInTheDocument()
    for (const n of ['BOT', 'Pruebas', 'Claude de respaldo']) {
      expect(tarjeta(n).getByRole('button', { name: 'Probar' })).toBeInTheDocument()
      expect(tarjeta(n).getByRole('button', { name: 'Editar' })).toBeInTheDocument()
    }
  })

  it('sin claves: mensaje vacío y aviso de que el chat funciona sin IA', async () => {
    responder(() => undefined, { ...ESTADO, claves: [], en_uso: null })
    await pantalla(false)
    expect(await screen.findByText('Todavía no hay claves guardadas')).toBeInTheDocument()
    expect(screen.getByText(/Sin IA activa/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agregar clave' })).toBeInTheDocument()
  })

  it('sin clave activa pero con llave en el servidor lo dice', async () => {
    responder(() => undefined, { ...ESTADO, claves: [PRUEBAS], en_uso: { origen: 'servidor', nombre: null, proveedor: 'gemini', proveedor_nombre: 'Gemini (Google)', modelo: 'gemini-flash-latest' } })
    await pantalla()
    expect(screen.getByText('Llave del servidor (.env)')).toBeInTheDocument()
  })

  it('avisa si la clave activa no se pudo abrir', async () => {
    responder(() => undefined, { ...ESTADO, activa_ilegible: true })
    await pantalla()
    expect(screen.getByText(/No se pudo abrir la clave activa/)).toBeInTheDocument()
  })

  it('si no se puede consultar, lo dice y no muestra tarjetas ni «Agregar clave»', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(502, 'caído'))
    await pantalla(false)
    expect(await screen.findByRole('alert')).toHaveTextContent('caído')
    expect(screen.queryAllByRole('region')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Agregar clave' })).not.toBeInTheDocument()
  })

  describe('agregar', () => {
    it('crea la clave con proveedor, nombre, modelo y llave; no la activa si ya hay una activa', async () => {
      responder((ruta, op) => (ruta === '/ia/claves' && op?.method === 'POST' ? { id: 'nueva' } : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog', { name: 'Agregar clave' }))
      expect(d.getByRole('switch', { name: 'Activar al guardar' })).toHaveAttribute('aria-checked', 'false')
      await u.click(d.getByRole('radio', { name: 'Claude (Anthropic)' }))
      expect(d.getByLabelText('Modelo')).toHaveAttribute('placeholder', 'claude-haiku-5-5')
      await u.type(d.getByLabelText('Nombre *'), '  Producción ')
      await u.type(d.getByLabelText('Modelo'), 'claude-sonnet-5-5')
      await u.type(d.getByLabelText('Clave de API *'), LLAVE)
      await u.type(d.getByLabelText('Motivo (opcional)'), 'Clave nueva')
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves', {
        method: 'POST',
        body: { proveedor: 'anthropic', nombre: 'Producción', modelo: 'claude-sonnet-5-5', llave: LLAVE, activar: false, motivo: 'Clave nueva' },
      }))
      expect(await screen.findByText(/Clave «Producción» guardada\./)).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(llamadas('/ia/claves').filter(([, o]) => !o)).toHaveLength(2)         // se recargó la lista
      expect(screen.queryByText(LLAVE)).not.toBeInTheDocument()
    })

    it('la primera clave viene con «Activar al guardar» encendido y modelo vacío se envía como nulo', async () => {
      responder(() => undefined, { ...ESTADO, claves: [], en_uso: null })
      await pantalla(false)
      const u = userEvent.setup()
      await u.click(await screen.findByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog'))
      expect(d.getByRole('switch', { name: 'Activar al guardar' })).toHaveAttribute('aria-checked', 'true')
      expect(d.getByText('Todavía no hay ninguna activa.')).toBeInTheDocument()
      await u.type(d.getByLabelText('Nombre *'), 'BOT')
      await u.type(d.getByLabelText('Clave de API *'), LLAVE)
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves', { method: 'POST', body: { proveedor: 'gemini', nombre: 'BOT', modelo: null, llave: LLAVE, activar: true } }))
      expect(await screen.findByText(/guardada y activa/)).toBeInTheDocument()
    })

    it('se puede activar al guardar aunque ya haya otra activa (la otra pasa a inactiva)', async () => {
      await pantalla()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog'))
      expect(d.getByText(/la que lo está pasará a inactiva/)).toBeInTheDocument()
      await u.click(d.getByRole('switch', { name: 'Activar al guardar' }))
      await u.type(d.getByLabelText('Nombre *'), 'Nueva')
      await u.type(d.getByLabelText('Clave de API *'), LLAVE)
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(llamadas('/ia/claves', 'POST')[0][1]).toMatchObject({ body: { activar: true } }))
    })

    it('rechaza nombre vacío, modelo con espacios y llave incompleta sin llamar al servidor', async () => {
      await pantalla()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog'))
      await u.type(d.getByLabelText('Modelo'), 'mi modelo')
      await u.type(d.getByLabelText('Clave de API *'), 'corta')
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      expect(d.getByText('Escribe un nombre para reconocerla')).toBeInTheDocument()
      expect(d.getByText(/sin espacios/)).toBeInTheDocument()
      expect(d.getByText(/parece incompleta/)).toBeInTheDocument()
      expect(llamadas('/ia/claves', 'POST')).toHaveLength(0)
    })

    it('muestra el motivo si el servidor rechaza (nombre repetido) y deja la ventana abierta', async () => {
      responder((_ruta, op) => (op?.method === 'POST' ? new ApiError(409, 'Ya tienes una clave con ese nombre') : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog'))
      await u.type(d.getByLabelText('Nombre *'), 'BOT')
      await u.type(d.getByLabelText('Clave de API *'), LLAVE)
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      expect(await d.findByText('Ya tienes una clave con ese nombre')).toBeInTheDocument()
      expect(d.getByLabelText('Nombre *')).toHaveValue('BOT')
      expect(d.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    })

    it('sin clave de cifrado en el servidor avisa y no deja guardar', async () => {
      responder(() => undefined, { ...ESTADO, puede_guardar_llaves: false })
      await pantalla()
      expect(screen.getByText(/no tiene la clave de cifrado/)).toBeInTheDocument()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      const d = within(await screen.findByRole('dialog'))
      expect(d.getByLabelText('Clave de API *')).toBeDisabled()
      expect(d.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    })

    it('Cancelar cierra sin guardar', async () => {
      await pantalla()
      const u = userEvent.setup()
      await u.click(screen.getByRole('button', { name: 'Agregar clave' }))
      await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(llamadas('/ia/claves', 'POST')).toHaveLength(0)
    })
  })

  describe('editar', () => {
    const abrir = async (nombre: string) => {
      const u = userEvent.setup()
      await u.click(tarjeta(nombre).getByRole('button', { name: 'Editar' }))
      return { u, d: within(await screen.findByRole('dialog', { name: `Editar «${nombre}»` })) }
    }

    it('trae los datos, deja fijo el proveedor y no permite guardar sin cambios', async () => {
      await pantalla()
      const { d } = await abrir('BOT')
      expect(d.getByText('OpenAI')).toBeInTheDocument()
      expect(d.getByText(/no cambia después de crearla/)).toBeInTheDocument()
      expect(d.queryByRole('radio')).not.toBeInTheDocument()
      expect(d.getByLabelText('Nombre *')).toHaveValue('BOT')
      expect(d.getByLabelText('Modelo')).toHaveValue('gpt-5.4')
      expect(d.getByLabelText('Clave de API')).toHaveValue('')
      expect(d.getByText(/Guardada · termina en …kwMA/)).toBeInTheDocument()
      expect(d.getByRole('button', { name: 'Guardar' })).toBeDisabled()
    })

    it('envía solo lo que cambió: nombre, modelo y motivo', async () => {
      await pantalla()
      const { u, d } = await abrir('BOT')
      await u.clear(d.getByLabelText('Nombre *'))
      await u.type(d.getByLabelText('Nombre *'), 'BOT 2')
      await u.clear(d.getByLabelText('Modelo'))
      await u.type(d.getByLabelText('Motivo del cambio (opcional)'), 'ajuste')
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c1', { method: 'PATCH', body: { nombre: 'BOT 2', modelo: null, motivo: 'ajuste' } }))
      expect(await screen.findByText(/Clave «BOT 2» guardada\. Rige desde la próxima justificación\./)).toBeInTheDocument()
    })

    it('cambiar la llave la envía y no se vuelve a mostrar', async () => {
      await pantalla()
      const { u, d } = await abrir('Pruebas')
      await u.type(d.getByLabelText('Clave de API'), LLAVE)
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c2', { method: 'PATCH', body: { llave: LLAVE } }))
      expect(screen.queryByText(LLAVE)).not.toBeInTheDocument()
    })

    it('una llave incompleta se rechaza sin llamar al servidor', async () => {
      await pantalla()
      const { u, d } = await abrir('Pruebas')
      await u.type(d.getByLabelText('Clave de API'), 'corta')
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      expect(d.getByText(/parece incompleta/)).toBeInTheDocument()
      expect(llamadas('/ia/claves/c2', 'PATCH')).toHaveLength(0)
    })

    it('encender «Activa» en una inactiva la activa', async () => {
      await pantalla()
      const { u, d } = await abrir('Pruebas')
      const sw = d.getByRole('switch', { name: 'Activa' })
      expect(sw).toHaveAttribute('aria-checked', 'false')
      await u.click(sw)
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c2', { method: 'PATCH', body: { activa: true } }))
    })

    it('la clave activa no se puede desactivar ni eliminar desde su ventana', async () => {
      await pantalla()
      const { d } = await abrir('BOT')
      expect(d.getByRole('switch', { name: 'Activa' })).toBeDisabled()
      expect(d.getByRole('switch', { name: 'Activa' })).toHaveAttribute('aria-checked', 'true')
      expect(d.getByText(/activa otra/)).toBeInTheDocument()
      expect(d.queryByRole('button', { name: 'Eliminar clave' })).not.toBeInTheDocument()
    })

    it('muestra el motivo si el servidor rechaza el cambio', async () => {
      responder((_ruta, op) => (op?.method === 'PATCH' ? new ApiError(409, 'Ya tienes una clave con ese nombre') : undefined))
      await pantalla()
      const { u, d } = await abrir('Pruebas')
      await u.type(d.getByLabelText('Nombre *'), '2')
      await u.click(d.getByRole('button', { name: 'Guardar' }))
      expect(await d.findByText('Ya tienes una clave con ese nombre')).toBeInTheDocument()
    })

    it('eliminar una inactiva pide confirmación y borra', async () => {
      responder((_ruta, op) => (op?.method === 'DELETE' ? { mensaje: 'Clave «Pruebas» eliminada' } : undefined))
      await pantalla()
      const { u, d } = await abrir('Pruebas')
      await u.click(d.getByRole('button', { name: 'Eliminar clave' }))
      const conf = await screen.findByRole('dialog', { name: /¿Eliminar «Pruebas»\?/ })
      expect(llamadas('/ia/claves/c2', 'DELETE')).toHaveLength(0)
      await u.click(within(conf).getByRole('button', { name: 'Eliminar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c2', { method: 'DELETE' }))
      expect(await screen.findByText('Clave «Pruebas» eliminada')).toBeInTheDocument()
    })
  })

  describe('activar', () => {
    it('pide confirmación, activa por el servidor y recarga', async () => {
      await pantalla()
      const u = userEvent.setup()
      await u.click(tarjeta('Pruebas').getByRole('button', { name: 'Activar' }))
      const conf = await screen.findByRole('dialog')
      expect(conf).toHaveTextContent('«Pruebas»')
      expect(conf).toHaveTextContent('«BOT» pasará a inactiva')
      expect(llamadas('/ia/claves/c2', 'PATCH')).toHaveLength(0)
      await u.click(within(conf).getByRole('button', { name: 'Activar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c2', { method: 'PATCH', body: { activa: true } }))
      expect(await screen.findByText(/Ahora responde «Pruebas»/)).toBeInTheDocument()
      expect(llamadas('/ia/claves').filter(([, o]) => !o)).toHaveLength(2)
    })

    it('si el servidor rechaza la activación, muestra el motivo', async () => {
      responder((_ruta, op) => (op?.method === 'PATCH' ? new ApiError(502, 'No se pudo activar la clave') : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(tarjeta('Pruebas').getByRole('button', { name: 'Activar' }))
      await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Activar' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo activar la clave')
    })
  })

  describe('probar', () => {
    it('prueba esa clave y muestra el resultado en su tarjeta', async () => {
      responder((ruta) => (ruta === '/ia/claves/c2/probar' ? { ok: true, mensaje: 'Conexión correcta con Gemini (Google) (modelo gemini-flash-latest).' } : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(tarjeta('Pruebas').getByRole('button', { name: 'Probar' }))
      await waitFor(() => expect(api).toHaveBeenCalledWith('/ia/claves/c2/probar', { method: 'POST', body: {} }))
      expect(await tarjeta('Pruebas').findByText(/Conexión correcta con Gemini/)).toBeInTheDocument()
      expect(tarjeta('BOT').queryByText(/Conexión correcta/)).not.toBeInTheDocument()
    })

    it('una prueba fallida se muestra como error en su tarjeta', async () => {
      responder((ruta) => (ruta.endsWith('/probar') ? { ok: false, mensaje: 'La llave no es válida o no tiene permiso para usar ese modelo.' } : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(tarjeta('BOT').getByRole('button', { name: 'Probar' }))
      expect(await tarjeta('BOT').findByRole('alert')).toHaveTextContent('La llave no es válida')
    })

    it('si la llamada falla, lo dice en la tarjeta', async () => {
      responder((ruta) => (ruta.endsWith('/probar') ? new ApiError(500, 'caído') : undefined))
      await pantalla()
      const u = userEvent.setup()
      await u.click(tarjeta('BOT').getByRole('button', { name: 'Probar' }))
      expect(await tarjeta('BOT').findByText('caído')).toBeInTheDocument()
    })
  })
})
