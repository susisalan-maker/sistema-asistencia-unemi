import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { perfilDe, renderConAuth } from '../../test/helpers'
import AnomaliaDetalle from './AnomaliaDetalle'

vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
vi.mock('../../components/MapaLeaflet', () => ({
  default: (p: { actual?: { radio: number } | null }) => <div data-testid="mapa" data-radio={p.actual?.radio} />,
}))

const PERSONA = { nombres: 'Rocío', apellidos: 'Molina', email: 'r@x.ec' }
const MARCACION = {
  tipo: 'ingreso', fecha_hora: '2026-09-03T13:11:00Z', latitud: -0.2105, longitud: -78.4899, precision_m: 6.4,
  origen: 'app', motivo_contingencia: null, verificacion: 'verificada', similitud_score: 0.93, sedes: { nombre: 'Campus Central' },
}
const MENSAJES = [
  { emisor: 'asistente', contenido: '¿Qué pasó?', created_at: '2026-09-03T13:22:00Z' },
  { emisor: 'usuario', contenido: 'Trasladé material al Pabellón B', created_at: '2026-09-03T13:23:00Z' },
]
const CASO = {
  id: 'a1', numero: 2418, tipo: 'desplazamiento_inusual', estado: 'en_revision', detalle: 'Trayecto de 4,2 km en 3 min',
  created_at: '2026-09-03T13:14:00Z', intentos_fallidos: 0, fecha_vencimiento: '2026-09-05T13:14:00Z', descripcion_ia: null,
  usuarios: PERSONA, marcaciones: MARCACION,
  justificaciones: { resumen_ia: null, clasificacion_ia: null, confianza_ia: null, decision_final: null, comentario_admin: null, fecha_decision: null, revisado_por: null, mensajes_chat: MENSAJES },
}

let caso: unknown
let pendientes: { id: string }[]
const rpc = vi.mocked(supabase.rpc)

function simular() {
  vi.mocked(supabase.from).mockImplementation((() => {
    let esDetalle = false
    const c: Record<string, unknown> = {}
    c.select = () => c
    c.eq = () => c
    c.in = () => c
    c.order = () => c
    c.limit = () => c
    c.maybeSingle = () => { esDetalle = true; return c }
    c.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      Promise.resolve(esDetalle ? { data: caso, error: null } : { data: pendientes, error: null }).then(ok, ko)
    return c
  }) as never)
}

function Ubicacion() { return <p data-testid="ruta">{useLocation().pathname}</p> }

const pantalla = (id = 'a1') => renderConAuth(
  <><Routes>
    <Route path="/admin/anomalias" element={<p>BANDEJA</p>} />
    <Route path="/admin/anomalias/:id" element={<AnomaliaDetalle />} />
  </Routes><Ubicacion /></>,
  { perfil: perfilDe('administrador') }, `/admin/anomalias/${id}`,
)

beforeEach(() => {
  caso = structuredClone(CASO)
  pendientes = [{ id: 'a0' }, { id: 'a1' }, { id: 'a5' }]
  rpc.mockReset()
  rpc.mockResolvedValue({ error: null } as never)
  simular()
})

describe('Anomalía · detalle', () => {
  it('muestra el caso, el registro original y la justificación de la persona', async () => {
    pantalla()
    expect(await screen.findByRole('heading', { name: 'Desplazamiento inusual · Rocío Molina' })).toBeInTheDocument()
    expect(screen.getByText('Anomalías · Caso #A-2418')).toBeInTheDocument()
    expect(screen.getByText('En revisión')).toBeInTheDocument()
    const registro = screen.getByRole('region', { name: 'Registro original' })
    expect(within(registro).getByText('Trayecto de 4,2 km en 3 min')).toBeInTheDocument()
    expect(within(registro).getByText('Ingreso · 3 sep · 08:11')).toBeInTheDocument()
    expect(within(registro).getByText('-0.2105, -78.4899 · ±6 m')).toBeInTheDocument()
    expect(within(registro).getByText('Campus Central')).toBeInTheDocument()
    expect(within(registro).getByText('App · celular vinculado')).toBeInTheDocument()
    expect(within(registro).getByText(/Coincide con el registro/)).toBeInTheDocument()
    expect(await screen.findByTestId('mapa')).toHaveAttribute('data-radio', '6.4')
    const just = screen.getByRole('region', { name: 'Justificación' })
    expect(within(just).getByText('Trasladé material al Pabellón B')).toBeInTheDocument()
    expect(within(just).getByText('¿Qué pasó?')).toBeInTheDocument()
  })

  it('una marcación hecha sin conexión lo dice y muestra cuándo llegó al servidor', async () => {
    Object.assign((caso as { marcaciones: object }).marcaciones, { sin_conexion: true, created_at: '2026-09-03T20:40:00Z' })
    pantalla()
    const registro = await screen.findByRole('region', { name: 'Registro original' })
    expect(within(registro).getByText(/Sin conexión · la hora es la del celular; llegó al servidor el 3 sep · 15:40/)).toBeInTheDocument()
  })

  it('una marcación normal no menciona la falta de conexión', async () => {
    pantalla()
    const registro = await screen.findByRole('region', { name: 'Registro original' })
    expect(within(registro).queryByText(/Sin conexión/)).toBeNull()
  })

  it('el historial cuenta lo ocurrido y deja ver qué falta', async () => {
    pantalla()
    const h = await screen.findByRole('region', { name: 'Historial del caso' })
    expect(within(h).getByText('Detección automática')).toBeInTheDocument()
    expect(within(h).getByText('3 sep · 08:14')).toBeInTheDocument()
    expect(within(h).getByText('Justificación enviada por la persona')).toBeInTheDocument()
    expect(within(h).getByText('Pendiente de decisión de Talento Humano')).toBeInTheDocument()
  })

  it('el resumen de la IA solo aparece si existe', async () => {
    ;(caso as typeof CASO).justificaciones = { ...CASO.justificaciones, resumen_ia: 'Trasladó material con autorización.', confianza_ia: 0.86 } as never
    pantalla()
    expect(await screen.findByText('Trasladó material con autorización.')).toBeInTheDocument()
    expect(screen.getByText('Resumen generado por IA · confianza 0.86')).toBeInTheDocument()
  })

  it('muestra lo que concluyó la IA (clasificación y confianza) y recuerda que decide Talento Humano', async () => {
    ;(caso as typeof CASO).justificaciones = { ...CASO.justificaciones, resumen_ia: 'Dice que se cayó el internet.', clasificacion_ia: 'sospechosa', confianza_ia: 0.7 } as never
    pantalla()
    const just = await screen.findByRole('region', { name: 'Justificación' })
    expect(within(just).getByText('IA: sospechosa')).toBeInTheDocument()
    expect(within(just).getByText('Resumen generado por IA · confianza 0.70')).toBeInTheDocument()
    expect(within(just).getByText(/decisión es de Talento Humano/)).toBeInTheDocument()
  })

  it('una aprobación automática se distingue de una humana en el historial', async () => {
    Object.assign(caso as object, {
      estado: 'justificada',
      justificaciones: { ...CASO.justificaciones, decision_final: 'aprobada', fecha_decision: '2026-09-03T13:30:00Z', revisado_por: null },
    })
    pantalla()
    expect(await screen.findByText('Aprobada automáticamente por el sistema')).toBeInTheDocument()
  })

  it('una anomalía sin marcación lo explica y no dibuja mapa', async () => {
    Object.assign(caso as object, { tipo: 'sin_ingreso', marcaciones: null })
    pantalla()
    expect(await screen.findByText(/no marcó ese día/)).toBeInTheDocument()
    expect(screen.queryByTestId('mapa')).not.toBeInTheDocument()
  })

  it('tolera que la justificación llegue como lista', async () => {
    ;(caso as typeof CASO).justificaciones = [CASO.justificaciones] as never
    pantalla()
    expect(await screen.findByText('Trasladé material al Pabellón B')).toBeInTheDocument()
  })

  it('un caso inexistente muestra el aviso y deja volver', async () => {
    caso = null
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró el caso')
    expect(screen.getByRole('link', { name: '‹ Volver a la bandeja' })).toHaveAttribute('href', '/admin/anomalias')
  })
})

describe('Anomalía · navegación', () => {
  it('«Caso anterior» y «Caso siguiente» recorren la bandeja por resolver', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Caso anterior' })).toBeEnabled())
    await u.click(screen.getByRole('button', { name: 'Caso siguiente' }))
    expect(screen.getByTestId('ruta')).toHaveTextContent('/admin/anomalias/a5')
  })

  it('el primero no tiene «anterior» y el último no tiene «siguiente»', async () => {
    pendientes = [{ id: 'a1' }]
    pantalla()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    expect(screen.getByRole('button', { name: 'Caso anterior' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Caso siguiente' })).toBeDisabled()
  })
})

describe('Anomalía · decisión', () => {
  it('aprobar pide confirmación, llama a decidir_anomalia con el comentario y recarga', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.type(screen.getByLabelText('Comentario para el expediente'), '  Con autorización de traslado  ')
    await u.click(screen.getByRole('button', { name: 'Aprobar justificación' }))
    const d = await screen.findByRole('dialog', { name: '¿Aprobar la justificación del caso #A-2418?' })
    expect(rpc).not.toHaveBeenCalled()
    expect(within(d).getByText(/Rocío Molina verá la decisión en la app/)).toBeInTheDocument()
    ;(caso as typeof CASO).estado = 'justificada'
    await u.click(within(d).getByRole('button', { name: 'Confirmar aprobación' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('decidir_anomalia',
      { p_anomalia: 'a1', p_decision: 'aprobada', p_comentario: 'Con autorización de traslado' }))
    expect(await screen.findByRole('status')).toHaveTextContent('La justificación fue aprobada')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Justificada')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar justificación' })).not.toBeInTheDocument()
  })

  it('cancelar la confirmación no cambia nada', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.click(screen.getByRole('button', { name: 'Escalar a jefatura' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('escalar envía «escalada» sin comentario como nulo', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.click(screen.getByRole('button', { name: 'Escalar a jefatura' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar escalamiento' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('decidir_anomalia', { p_anomalia: 'a1', p_decision: 'escalada', p_comentario: null }))
    expect(await screen.findByRole('status')).toHaveTextContent('se escaló a jefatura')
  })

  it('rechazar sin comentario no abre la confirmación ni llama a la base', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.click(screen.getByRole('button', { name: 'Rechazar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Para rechazar un caso escribe un comentario')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechazar con comentario lo envía', async () => {
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.type(screen.getByLabelText('Comentario para el expediente'), 'No hay autorización')
    await u.click(screen.getByRole('button', { name: 'Rechazar' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar rechazo' }))
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('decidir_anomalia', { p_anomalia: 'a1', p_decision: 'rechazada', p_comentario: 'No hay autorización' }))
  })

  it('si la base rechaza la decisión muestra el motivo y conserva el comentario', async () => {
    rpc.mockResolvedValue({ error: { message: 'El caso ya está resuelto o aún espera la justificación del usuario' } } as never)
    pantalla()
    const u = userEvent.setup()
    await screen.findByRole('heading', { name: /Rocío Molina/ })
    await u.type(screen.getByLabelText('Comentario para el expediente'), 'Ok')
    await u.click(screen.getByRole('button', { name: 'Aprobar justificación' }))
    await u.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar aprobación' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ya fue resuelto o todavía espera')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Comentario para el expediente')).toHaveValue('Ok')
  })

  it('un caso «sin justificar» también se decide y lo dice en el historial', async () => {
    Object.assign(caso as object, { estado: 'sin_justificar', justificaciones: null })
    pantalla()
    const h = await screen.findByRole('region', { name: 'Historial del caso' })
    expect(within(h).getByText('El plazo venció sin justificación')).toBeInTheDocument()
    expect(screen.getByText('La persona no envió ninguna justificación en el plazo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar justificación' })).toBeInTheDocument()
  })

  it('un caso que espera a la persona no se puede decidir', async () => {
    Object.assign(caso as object, { estado: 'pendiente', justificaciones: null })
    pantalla()
    expect(await screen.findByText(/todavía puede justificar este caso/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Aprobar justificación' })).not.toBeInTheDocument()
    expect(screen.getByText('Esperando la justificación de la persona')).toBeInTheDocument()
  })

  it('un caso resuelto muestra la decisión y el comentario del expediente', async () => {
    Object.assign(caso as object, {
      estado: 'rechazada',
      justificaciones: { ...CASO.justificaciones, decision_final: 'rechazada', comentario_admin: 'Sin autorización', fecha_decision: '2026-09-04T15:00:00Z' },
    })
    pantalla()
    expect(await screen.findByText(/Este caso ya está resuelto/)).toBeInTheDocument()
    const h = screen.getByRole('region', { name: 'Historial del caso' })
    expect(within(h).getByText('Caso rechazado')).toBeInTheDocument()
    expect(within(h).getByText('«Sin autorización»')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).not.toBeInTheDocument()
  })

  it('un caso escalado sigue decidible y lo indica', async () => {
    Object.assign(caso as object, {
      justificaciones: { ...CASO.justificaciones, decision_final: 'escalada', fecha_decision: '2026-09-04T15:00:00Z' },
    })
    pantalla()
    expect(await screen.findByText(/fue escalado a jefatura/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aprobar justificación' })).toBeInTheDocument()
  })
})
