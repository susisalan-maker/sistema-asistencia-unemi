import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Anomalia from '../app/(app)/anomalia'
import { ApiError, api } from '../lib/api'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({ id: 'id-1' }),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const detalle = (extra: object = {}) => ({
  id: 'id-1', caso: 'A-12', tipo: 'sin_salida', estado: 'pendiente', detalle: 'No marcó la salida el jueves 15/10/2026',
  creada: '2026-10-15T22:00:00+00:00', vence: en(30), puede_justificar: true, mensajes: [], decision: null, comentario: null, ...extra,
})
const TEXTO = 'Se cayó el internet de la sede y no pude marcar'

beforeEach(() => { jest.mocked(api).mockReset(); mockBack.mockReset() })

describe('Detalle de anomalía', () => {
  it('muestra qué detectó el sistema, el plazo y el formulario', async () => {
    jest.mocked(api).mockResolvedValue(detalle())
    await render(<Anomalia />)
    expect(await screen.findByText('Falta tu salida')).toBeTruthy()
    expect(api).toHaveBeenCalledWith('/anomalias/id-1')
    expect(screen.getByText('No marcó la salida el jueves 15/10/2026')).toBeTruthy()
    expect(screen.getByText('A-12 · 15/10 17:00')).toBeTruthy()
    expect(screen.getByText(/Te quedan (29|30) h para justificar/)).toBeTruthy()
    expect(screen.getByLabelText('Tu explicación')).toBeTruthy()
  })

  it('no envía un texto muy corto y explica por qué', async () => {
    jest.mocked(api).mockResolvedValue(detalle())
    await render(<Anomalia />)
    await fireEvent.changeText(await screen.findByLabelText('Tu explicación'), 'corto')
    await fireEvent.press(screen.getByLabelText('Enviar justificación'))
    expect(await screen.findByText(/Escribe al menos 10 caracteres \(llevas 5\)/)).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(1)                      // solo la carga inicial
  })

  it('envía la justificación y muestra el nuevo estado', async () => {
    jest.mocked(api).mockResolvedValueOnce(detalle()).mockResolvedValueOnce(detalle({
      estado: 'en_revision', puede_justificar: false,
      mensajes: [{ emisor: 'usuario', contenido: TEXTO, fecha: '2026-10-15T23:00:00+00:00' }],
    }))
    await render(<Anomalia />)
    await fireEvent.changeText(await screen.findByLabelText('Tu explicación'), `  ${TEXTO}  `)
    await fireEvent.press(screen.getByLabelText('Enviar justificación'))
    expect(await screen.findByText(/Tu justificación se envió/)).toBeTruthy()
    expect(api).toHaveBeenLastCalledWith('/anomalias/id-1/justificacion', { method: 'POST', body: { texto: TEXTO } })
    expect(screen.getByText('En revisión')).toBeTruthy()
    expect(screen.getByText(TEXTO)).toBeTruthy()
    expect(screen.queryByLabelText('Enviar justificación')).toBeNull()
  })

  it('si el servidor dice que ya no se puede, muestra el motivo y el estado real', async () => {
    jest.mocked(api)
      .mockResolvedValueOnce(detalle())
      .mockRejectedValueOnce(new ApiError(409, 'Esta anomalía ya no se puede justificar: el plazo venció'))
      .mockResolvedValueOnce(detalle({ estado: 'sin_justificar', puede_justificar: false }))
    await render(<Anomalia />)
    await fireEvent.changeText(await screen.findByLabelText('Tu explicación'), TEXTO)
    await fireEvent.press(screen.getByLabelText('Enviar justificación'))
    expect(await screen.findByText(/el plazo venció/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Sin justificar')).toBeTruthy())
    expect(screen.queryByLabelText('Enviar justificación')).toBeNull()
  })

  it('un error de red al enviar conserva el texto para reintentar', async () => {
    jest.mocked(api).mockResolvedValueOnce(detalle()).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.'))
    await render(<Anomalia />)
    await fireEvent.changeText(await screen.findByLabelText('Tu explicación'), TEXTO)
    await fireEvent.press(screen.getByLabelText('Enviar justificación'))
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    expect(screen.getByLabelText('Tu explicación').props.value).toBe(TEXTO)
  })

  it('una rechazada muestra la decisión y el comentario del administrador, sin formulario', async () => {
    jest.mocked(api).mockResolvedValue(detalle({
      estado: 'rechazada', puede_justificar: false, decision: 'rechazada', comentario: 'No presentó respaldo',
      mensajes: [{ emisor: 'usuario', contenido: TEXTO, fecha: '2026-10-15T23:00:00+00:00' }],
    }))
    await render(<Anomalia />)
    expect(await screen.findByText('Rechazada. No presentó respaldo')).toBeTruthy()
    expect(screen.getByText('Tu explicación no fue aceptada.')).toBeTruthy()
    expect(screen.queryByLabelText('Enviar justificación')).toBeNull()
  })

  it('una aprobada se ve como justificada', async () => {
    jest.mocked(api).mockResolvedValue(detalle({ estado: 'justificada', puede_justificar: false, decision: 'aprobada', comentario: null }))
    await render(<Anomalia />)
    expect(await screen.findByText('Aprobada.')).toBeTruthy()
    expect(screen.getByText('Justificada')).toBeTruthy()
  })

  it('si no carga muestra el error', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(404, 'Anomalía no encontrada'))
    await render(<Anomalia />)
    expect(await screen.findByText('Anomalía no encontrada')).toBeTruthy()
  })
})
