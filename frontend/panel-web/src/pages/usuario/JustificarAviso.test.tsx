import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { perfilDe, renderConAuth } from '../../test/helpers'
import JustificarAviso from './JustificarAviso'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))

const BASE = {
  id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso el 14 de octubre.',
  creada: '2026-10-15T13:05:00+00:00', vence: '2099-01-01T00:00:00+00:00', puede_justificar: true,
  mensajes: [], decision: null, automatica: false, comentario: null, plazo_revision_h: 48,
}
const pantalla = () => renderConAuth(
  <Routes>
    <Route path="/usuario/avisos" element={<p>Lista de avisos</p>} />
    <Route path="/usuario/avisos/:id" element={<JustificarAviso />} />
  </Routes>,
  { perfil: perfilDe('usuario') as never }, '/usuario/avisos/a1',
)
const enviado = () => vi.mocked(api).mock.calls.filter(([r]) => r === '/anomalias/a1/justificacion')

describe('JustificarAviso', () => {
  it('abre la conversación con lo que detectó el sistema y la pregunta', async () => {
    vi.mocked(api).mockResolvedValue(BASE as never)
    pantalla()
    expect(await screen.findByText('Detectamos lo siguiente: No registraste tu ingreso el 14 de octubre. ¿Qué ocurrió?')).toBeInTheDocument()
    expect(screen.getByText('Caso #A-12 · No marcaste ese día')).toBeInTheDocument()
    expect(screen.getByText('Abierto')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Tu respuesta' })).toHaveAttribute('placeholder', 'Cuéntanos qué ocurrió')
  })

  it('no envía una explicación demasiado corta', async () => {
    vi.mocked(api).mockResolvedValue(BASE as never)
    pantalla()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Tu respuesta' }), 'corto')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar respuesta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Escribe al menos 10 caracteres (llevas 5).')
    expect(enviado()).toHaveLength(0)
  })

  it('envía con Enter, muestra la repregunta del asistente y sigue abierta', async () => {
    vi.mocked(api).mockImplementation((async (_ruta: string, op?: { method?: string; body?: { texto: string } }) => {
      if (op?.method === 'POST') return {
        ...BASE, mensajes: [
          { emisor: 'usuario', contenido: op.body!.texto, fecha: '2026-10-15T14:00:00+00:00' },
          { emisor: 'asistente', contenido: '¿Tienes algún documento que lo respalde?', fecha: '2026-10-15T14:00:05+00:00' },
        ],
      }
      return BASE
    }) as never)
    pantalla()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Tu respuesta' }), 'Estaba en una capacitación fuera de la sede{Enter}')
    expect(await screen.findByText('¿Tienes algún documento que lo respalde?')).toBeInTheDocument()
    expect(screen.getByText('Estaba en una capacitación fuera de la sede')).toBeInTheDocument()
    expect(enviado()[0]![1]).toEqual({ method: 'POST', body: { texto: 'Estaba en una capacitación fuera de la sede' } })
    expect(screen.getByRole('textbox', { name: 'Tu respuesta' })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: 'Tu respuesta' })).toHaveAttribute('placeholder', 'Escribe tu respuesta')
  })

  it('al enviar, el mensaje sale de la caja y se ve una sola vez mientras el asistente responde', async () => {
    let resolver: (v: unknown) => void = () => {}
    vi.mocked(api).mockImplementation(((_r: string, op?: { method?: string }) =>
      op?.method === 'POST' ? new Promise((res) => { resolver = res }) : Promise.resolve(BASE)) as never)
    pantalla()
    const caja = await screen.findByRole('textbox', { name: 'Tu respuesta' })
    await userEvent.type(caja, 'Se cayó el internet de la sede{Enter}')
    expect(await screen.findByText('Escribiendo…')).toBeInTheDocument()
    expect(caja).toHaveValue('')
    expect(screen.getAllByText('Se cayó el internet de la sede')).toHaveLength(1)
    resolver({ ...BASE, estado: 'en_revision', puede_justificar: false })
    expect(await screen.findByText('Enviado a revisión')).toBeInTheDocument()
  })

  it('si no se pudo enviar, lo escrito vuelve a la caja para reintentar', async () => {
    vi.mocked(api).mockImplementation((async (_r: string, op?: { method?: string }) => {
      if (op?.method === 'POST') throw new ApiError(0, 'No hay conexión con el servidor.')
      return BASE
    }) as never)
    pantalla()
    const caja = await screen.findByRole('textbox', { name: 'Tu respuesta' })
    await userEvent.type(caja, 'Se cayó el internet de la sede{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent('No hay conexión con el servidor.')
    expect(caja).toHaveValue('Se cayó el internet de la sede')
    expect(screen.queryByText('Escribiendo…')).not.toBeInTheDocument()
  })

  it('Mayús + Enter no envía', async () => {
    vi.mocked(api).mockResolvedValue(BASE as never)
    pantalla()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Tu respuesta' }), 'Una explicación larga{Shift>}{Enter}{/Shift}segunda línea')
    expect(enviado()).toHaveLength(0)
  })

  it('al cerrarse la conversación muestra «Enviado a revisión» y ya no deja escribir', async () => {
    vi.mocked(api).mockImplementation((async (_r: string, op?: { method?: string }) =>
      op?.method === 'POST'
        ? { ...BASE, estado: 'en_revision', puede_justificar: false, mensajes: [{ emisor: 'usuario', contenido: 'Estaba en una capacitación', fecha: '2026-10-15T14:00:00+00:00' }] }
        : BASE) as never)
    pantalla()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Tu respuesta' }), 'Estaba en una capacitación{Enter}')
    expect(await screen.findByText('Enviado a revisión')).toBeInTheDocument()
    expect(screen.getByText(/responderá en un plazo de 48 h/)).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('Conversación cerrada · el caso está en revisión')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver a avisos' })).toHaveAttribute('href', '/usuario/avisos')
  })

  it('un caso ya resuelto es de solo lectura y muestra la decisión', async () => {
    vi.mocked(api).mockResolvedValue({ ...BASE, estado: 'rechazada', puede_justificar: false, decision: 'rechazada', comentario: 'Falta el respaldo.' } as never)
    pantalla()
    expect(await screen.findByText('Justificación rechazada')).toBeInTheDocument()
    expect(screen.getByText('Falta el respaldo.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('si el plazo venció mientras escribía, muestra el estado real del caso', async () => {
    let n = 0
    vi.mocked(api).mockImplementation((async (_r: string, op?: { method?: string }) => {
      if (op?.method === 'POST') throw new ApiError(409, 'Esta anomalía ya no se puede justificar: el plazo venció')
      return n++ === 0 ? BASE : { ...BASE, estado: 'sin_justificar', puede_justificar: false }
    }) as never)
    pantalla()
    await userEvent.type(await screen.findByRole('textbox', { name: 'Tu respuesta' }), 'Estaba en una capacitación{Enter}')
    expect(await screen.findByText('El plazo terminó')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('si no existe o es ajena muestra el error', async () => {
    vi.mocked(api).mockRejectedValue(new ApiError(404, 'Anomalía no encontrada'))
    pantalla()
    expect(await screen.findByRole('alert')).toHaveTextContent('Anomalía no encontrada')
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument())
  })
})
