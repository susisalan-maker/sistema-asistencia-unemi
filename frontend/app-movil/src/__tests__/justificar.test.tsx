import { fireEvent, render, screen } from '@testing-library/react-native'
import Justificar from '../app/(app)/justificar'
import { ApiError, api } from '../lib/api'

const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
  useLocalSearchParams: () => ({ id: 'a1' }),
}))
jest.mock('../lib/supabase', () => ({ supabase: {} }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))

const detalle = (extra: object = {}) => ({
  id: 'a1', caso: 'A-12', tipo: 'sin_ingreso', estado: 'pendiente', detalle: 'No registraste tu ingreso el 14 de octubre.',
  creada: '2026-10-15T13:05:00+00:00', vence: '2026-10-17T13:05:00+00:00', puede_justificar: true,
  mensajes: [], decision: null, comentario: null, automatica: false, plazo_revision_h: 48, ...extra,
})

beforeEach(() => { jest.mocked(api).mockReset(); mockNavigate.mockReset() })

describe('Justificar · chat', () => {
  it('abre con el mensaje del asistente y la caja para responder', async () => {
    jest.mocked(api).mockResolvedValue(detalle())
    await render(<Justificar />)
    expect(await screen.findByText(/Detectamos lo siguiente: No registraste tu ingreso el 14 de octubre\. ¿Qué ocurrió\?/)).toBeTruthy()
    expect(screen.getByText('Caso #A-12 · No marcaste ese día')).toBeTruthy()
    expect(screen.getByLabelText('Tu respuesta')).toBeTruthy()
    expect(screen.getByText('Tu justificación será revisada por Talento Humano')).toBeTruthy()
  })

  it('la flecha de atrás lleva a Avisos, no a Inicio', async () => {
    jest.mocked(api).mockResolvedValueOnce(detalle())
    await render(<Justificar />)
    await fireEvent.press(await screen.findByLabelText('Volver'))
    expect(mockNavigate).toHaveBeenCalledWith('/avisos')
  })

  it('no envía un texto demasiado corto', async () => {
    jest.mocked(api).mockResolvedValue(detalle())
    await render(<Justificar />)
    await fireEvent.changeText(await screen.findByLabelText('Tu respuesta'), 'hola')
    await fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText(/al menos 10/)).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(1)      // solo la carga inicial
  })

  it('envía la respuesta y termina en «Enviado a revisión» con el plazo', async () => {
    jest.mocked(api).mockResolvedValueOnce(detalle()).mockResolvedValueOnce(detalle({
      estado: 'en_revision', puede_justificar: false,
      mensajes: [{ emisor: 'usuario', contenido: 'Tuve una cita médica por la mañana', fecha: '2026-10-15T14:00:00+00:00' }],
    }))
    await render(<Justificar />)
    await fireEvent.changeText(await screen.findByLabelText('Tu respuesta'), 'Tuve una cita médica por la mañana')
    await fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText('Enviado a revisión')).toBeTruthy()
    expect(screen.getByText('Tuve una cita médica por la mañana')).toBeTruthy()
    expect(screen.getByText(/plazo de 48 h/)).toBeTruthy()
    expect(screen.queryByLabelText('Tu respuesta')).toBeNull()
    expect(jest.mocked(api).mock.calls[1]![0]).toBe('/anomalias/a1/justificacion')
    await fireEvent.press(screen.getByLabelText('Volver a avisos'))
    expect(mockNavigate).toHaveBeenCalledWith('/avisos')
  })

  it('si el servidor dice que ya no se puede, muestra el estado real', async () => {
    jest.mocked(api)
      .mockResolvedValueOnce(detalle())
      .mockRejectedValueOnce(new ApiError(409, 'El plazo para justificar terminó.'))
      .mockResolvedValueOnce(detalle({ estado: 'sin_justificar', puede_justificar: false }))
    await render(<Justificar />)
    await fireEvent.changeText(await screen.findByLabelText('Tu respuesta'), 'Mi explicación completa')
    await fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText('El plazo terminó')).toBeTruthy()
    expect(screen.queryByLabelText('Tu respuesta')).toBeNull()
  })

  it('un caso ya resuelto muestra la decisión y el comentario', async () => {
    jest.mocked(api).mockResolvedValue(detalle({
      estado: 'justificada', puede_justificar: false, decision: 'aprobada', comentario: 'Presentó el certificado médico.',
      mensajes: [{ emisor: 'usuario', contenido: 'Cita médica', fecha: '2026-10-15T14:00:00+00:00' }],
    }))
    await render(<Justificar />)
    expect(await screen.findByText('Justificación aceptada')).toBeTruthy()
    expect(screen.getByText('Presentó el certificado médico.')).toBeTruthy()
    expect(screen.getByText('Conversación cerrada · el caso fue aceptado')).toBeTruthy()
  })

  it('si no carga muestra el error', async () => {
    jest.mocked(api).mockRejectedValue(new ApiError(404, 'Anomalía no encontrada'))
    await render(<Justificar />)
    expect(await screen.findByText('Anomalía no encontrada')).toBeTruthy()
  })

  it('con IA: el asistente repregunta, la respuesta puede ser corta y la conversación sigue abierta', async () => {
    const pregunta = '¿A qué hora ocurrió y avisaste a tu jefe?'
    const conPregunta = detalle({ mensajes: [
      { emisor: 'usuario', contenido: 'Se cayó el internet de la sede', fecha: '2026-10-15T14:00:00+00:00' },
      { emisor: 'asistente', contenido: pregunta, fecha: '2026-10-15T14:00:05+00:00' },
    ] })
    jest.mocked(api).mockResolvedValueOnce(detalle()).mockResolvedValueOnce(conPregunta).mockResolvedValueOnce(detalle({
      estado: 'en_revision', puede_justificar: false, mensajes: [
        ...conPregunta.mensajes,
        { emisor: 'usuario', contenido: 'Sí', fecha: '2026-10-15T14:01:00+00:00' },
        { emisor: 'asistente', contenido: 'Gracias, enviaré tu explicación a Talento Humano.', fecha: '2026-10-15T14:01:05+00:00' },
      ],
    }))
    await render(<Justificar />)
    expect(await screen.findByPlaceholderText('Cuéntanos qué ocurrió')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Tu respuesta'), 'Se cayó el internet de la sede')
    await fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText(pregunta)).toBeTruthy()
    expect(screen.getByLabelText('Tu respuesta')).toBeTruthy()                    // sigue abierto
    expect(screen.queryByText('Enviado a revisión')).toBeNull()
    expect(screen.getByPlaceholderText('Escribe tu respuesta')).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText('Tu respuesta'), 'Sí')       // una respuesta corta sí se envía
    await fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText('Enviado a revisión')).toBeTruthy()
    expect(screen.getByText('Gracias, enviaré tu explicación a Talento Humano.')).toBeTruthy()
    expect(api).toHaveBeenCalledTimes(3)
  })

  it('mientras el asistente responde se ve lo que escribiste y «Escribiendo…»', async () => {
    let resolver: (v: unknown) => void = () => {}
    jest.mocked(api).mockResolvedValueOnce(detalle()).mockReturnValueOnce(new Promise((r) => { resolver = r }))
    await render(<Justificar />)
    await fireEvent.changeText(await screen.findByLabelText('Tu respuesta'), 'Se cayó el internet de la sede')
    fireEvent.press(screen.getByLabelText('Enviar respuesta'))
    expect(await screen.findByText('Escribiendo…')).toBeTruthy()
    expect(screen.getAllByText('Se cayó el internet de la sede').length).toBeGreaterThan(0)
    resolver(detalle({ estado: 'en_revision', puede_justificar: false }))
    expect(await screen.findByText('Enviado a revisión')).toBeTruthy()
    expect(screen.queryByText('Escribiendo…')).toBeNull()
  })

  it('una aprobación automática se explica como tal', async () => {
    jest.mocked(api).mockResolvedValue(detalle({
      estado: 'justificada', puede_justificar: false, decision: 'aprobada', automatica: true,
      mensajes: [{ emisor: 'usuario', contenido: 'Almorcé con un proveedor', fecha: '2026-10-15T14:00:00+00:00' }],
    }))
    await render(<Justificar />)
    expect(await screen.findByText('Revisamos tu explicación y la aceptamos automáticamente.')).toBeTruthy()
  })
})
