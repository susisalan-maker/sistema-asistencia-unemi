import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Inicio from '../app/(app)/index'
import { AuthContext, type AuthState, type Perfil } from '../auth/AuthContext'
import { ApiError, api } from '../lib/api'

const mockPush = jest.fn()
const mockNavigate = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1' }))
// La ubicación es un pedido aparte (GPS + /marcaciones/zona): se simula para no mezclarla con las respuestas de `api`.
let mockZona: object = { fase: 'buscando' }
const mockMedir = jest.fn()      // misma referencia en cada render, como el useCallback real
let mockMapa: object | null = null
jest.mock('../components/MapaGeocerca', () => ({ MapaGeocerca: (p: { datos: object }) => { mockMapa = p.datos; return null } }))
jest.mock('../lib/useZona', () => ({ useZona: () => ({ estado: mockZona, medir: mockMedir }) }))

const perfil = (rol: Perfil['rol']): Perfil => ({ id: 'u1', nombres: 'Ana', apellidos: 'Pérez', email: 'a@x.com', rol, activo: true })
const base: AuthState = {
  cargando: false, session: { user: { id: 'u1' } } as unknown as Session, perfil: perfil('usuario'),
  iniciarSesion: async () => null, cerrarSesion: async () => {},
}
const dibujar = (e: Partial<AuthState> = {}) =>
  render(<AuthContext.Provider value={{ ...base, ...e }}><Inicio /></AuthContext.Provider>)

const marca = (tipo: string, hora: string) => ({
  id: tipo, tipo, fecha_hora: `2026-10-15T${hora}:00-05:00`, sede_id: 's', bloque_id: null, origen: 'app', verificacion: 'verificada',
})
const hoy = (extra: object = {}) => ({
  fecha: '2026-10-15', marcaciones: [], siguiente: 'ingreso', dispositivo: 'este', rostro_registrado: true, rostro_requerido: true, ultima: null,
  jornada: { inicio: '08:00', fin: '17:00' }, ...extra,
})

beforeEach(() => { jest.mocked(api).mockReset(); mockPush.mockReset(); mockNavigate.mockReset(); mockMedir.mockReset(); mockMapa = null; mockZona = { fase: 'buscando' } })

describe('Inicio · usuario', () => {
  it('pide la jornada de hoy enviando el identificador de este celular', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    await waitFor(() => expect(screen.getByText('Tu jornada de hoy')).toBeTruthy())
    expect(api).toHaveBeenCalledWith('/marcaciones/hoy', { headers: { 'X-Dispositivo-Id': 'android:cel-1' } })
  })

  it('muestra las cuatro marcaciones con su hora o «Pendiente»', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ marcaciones: [marca('ingreso', '08:02')], siguiente: 'salida_almuerzo' }))
    await dibujar()
    await waitFor(() => expect(screen.getByText('✓ 08:02')).toBeTruthy())
    expect(screen.getAllByText('Pendiente')).toHaveLength(3)
    expect(screen.getByText('Regreso del almuerzo')).toBeTruthy()
  })

  it('el botón dice qué marcación toca y lleva a la pantalla de marcar con ese tipo', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ marcaciones: [marca('ingreso', '08:02')], siguiente: 'salida_almuerzo' }))
    await dibujar()
    await fireEvent.press(await screen.findByLabelText('Marcar salida a almorzar'))
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/marcar', params: { tipo: 'salida_almuerzo' } })
  })

  it('saluda por el nombre y el avatar lleva al perfil', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(screen.getByText('Hola, Ana')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Ver mi perfil'))
    expect(mockNavigate).toHaveBeenCalledWith('/perfil')
  })

  it('ya no trae el botón «Mis anomalías» (los avisos están en su pestaña)', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    await screen.findByLabelText('Marcar ingreso')
    expect(screen.queryByLabelText('Mis anomalías')).toBeNull()
  })

  it('muestra la jornada y cuántas marcaciones lleva', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ marcaciones: [marca('ingreso', '08:02')], siguiente: 'salida_almuerzo' }))
    await dibujar()
    expect(await screen.findByText('08:00 – 17:00')).toBeTruthy()
    expect(screen.getByText('1 de 4')).toBeTruthy()
  })

  it('muestra la última marcación con su día', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ ultima: { ...marca('salida', '17:04'), fecha_hora: '2026-10-14T17:04:00-05:00' } }))
    await dibujar()
    expect(await screen.findByText(/Salida · /)).toBeTruthy()
    expect(screen.getByText('SINCRONIZADO')).toBeTruthy()
  })

  const lista = (zona: object) => ({ fase: 'lista', precision_m: 6.4, posicion: { latitud: -2.14, longitud: -79.6 }, zona })
  const zonaBase = { sede: 'Sede Matriz', lugar: 'Bloque A', radio_m: 150, centro: { latitud: -2.14, longitud: -79.6 }, permite_fuera: false }

  it('dentro del perímetro dibuja el mapa y dice dónde estás', async () => {
    mockZona = lista({ ...zonaBase, dentro: true, distancia_m: 42 })
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('DENTRO DEL PERÍMETRO')).toBeTruthy()
    expect(screen.getByText('GPS ±6 m')).toBeTruthy()
    expect(screen.getByText('Estás en Bloque A')).toBeTruthy()
    expect(screen.getByText('A 42 m del centro · radio 150 m')).toBeTruthy()
    expect(screen.queryByText(/quedará una observación/)).toBeNull()
    expect(mockMapa).toMatchObject({ centro: { latitud: -2.14, longitud: -79.6 }, radio_m: 150, dentro: true, usuario: { latitud: -2.14, longitud: -79.6 } })
  })

  it('fuera del perímetro dice a cuánta distancia estás y qué pasa si marcas', async () => {
    mockZona = lista({ ...zonaBase, dentro: false, distancia_m: 7543, radio_m: 90 })
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('FUERA DEL PERÍMETRO')).toBeTruthy()
    expect(screen.getByText('A 7,5 km de Bloque A')).toBeTruthy()
    expect(screen.getByText('Acércate a menos de 90 m del centro; si marcas desde aquí quedará una observación.')).toBeTruthy()
    expect(screen.getByText(/Puedes marcar desde aquí/)).toBeTruthy()
    expect(screen.getByLabelText('Marcar ingreso').props.accessibilityState.disabled).toBeFalsy()
  })

  it('si la sede permite marcar fuera, no avisa de observación', async () => {
    mockZona = lista({ ...zonaBase, dentro: false, distancia_m: 400, permite_fuera: true })
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Tu sede permite marcar fuera de la zona.')).toBeTruthy()
    expect(screen.queryByText(/quedará una observación/)).toBeNull()
  })

  it('sin centro conocido no dibuja el mapa pero sigue informando', async () => {
    mockZona = lista({ ...zonaBase, dentro: true, distancia_m: 42, centro: null })
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Estás en Bloque A')).toBeTruthy()
    expect(mockMapa).toBeNull()
  })

  it('mientras busca la ubicación muestra el esqueleto del mapa, y ya no cuando hubo error', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByTestId('esqueleto-mapa')).toBeTruthy()
    expect(screen.getByLabelText('Cargando el mapa')).toBeTruthy()
  })

  it('con error de ubicación no deja el esqueleto cargando para siempre', async () => {
    mockZona = { fase: 'error', mensaje: 'Tu GPS está apagado.', abrirAjustes: false }
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Tu GPS está apagado.')).toBeTruthy()
    expect(screen.queryByTestId('esqueleto-mapa')).toBeNull()
  })

  it('si no se pudo medir la ubicación lo dice y permite reintentar', async () => {
    mockZona = { fase: 'error', mensaje: 'Tu GPS está apagado.', abrirAjustes: false }
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Tu GPS está apagado.')).toBeTruthy()
    mockMedir.mockClear()
    await fireEvent.press(screen.getByLabelText('Reintentar ubicación'))
    expect(mockMedir).toHaveBeenCalled()
  })

  it('con las cuatro hechas ya no ofrece marcar', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ siguiente: null }))
    await dibujar()
    expect(await screen.findByText(/Completaste tus cuatro marcaciones/)).toBeTruthy()
    expect(screen.queryByLabelText(/^Marcar /)).toBeNull()
  })

  it('sin celular vinculado ofrece vincularlo y, al lograrlo, recarga', async () => {
    jest.mocked(api).mockImplementation(async (ruta) =>
      ruta === '/dispositivo/vincular' ? { dispositivo: 'este' } : hoy({ dispositivo: jest.mocked(api).mock.calls.some((c) => c[0] === '/dispositivo/vincular') ? 'este' : 'sin_vincular' }))
    await dibujar()
    expect(screen.queryByLabelText('Marcar ingreso')).toBeNull()
    await fireEvent.press(await screen.findByLabelText('Vincular este celular'))
    await waitFor(() => expect(api).toHaveBeenCalledWith('/dispositivo/vincular', { method: 'POST', body: { dispositivo_id: 'android:cel-1' } }))
    expect(await screen.findByLabelText('Marcar ingreso')).toBeTruthy()
  })

  it('si no se pudo vincular muestra el motivo', async () => {
    jest.mocked(api).mockImplementation(async (ruta) => {
      if (ruta === '/dispositivo/vincular') throw new ApiError(409, 'Este celular ya está vinculado a otra cuenta')
      return hoy({ dispositivo: 'sin_vincular' })
    })
    await dibujar()
    await fireEvent.press(await screen.findByLabelText('Vincular este celular'))
    expect(await screen.findByText('Este celular ya está vinculado a otra cuenta')).toBeTruthy()
  })

  it('si la cuenta está en otro celular no deja marcar y explica qué hacer', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ dispositivo: 'otro' }))
    await dibujar()
    expect(await screen.findByText(/vinculada a otro celular/)).toBeTruthy()
    expect(screen.queryByLabelText('Marcar ingreso')).toBeNull()
  })

  it('sin rostro registrado no deja marcar y lleva al registro del rostro', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ rostro_registrado: false }))
    await dibujar()
    expect(await screen.findByText(/Antes de marcar debes registrar tu rostro/)).toBeTruthy()
    expect(screen.queryByLabelText('Marcar ingreso')).toBeNull()
    await fireEvent.press(screen.getByLabelText('Registrar mi rostro'))
    expect(mockPush).toHaveBeenCalledWith('/registro-rostro')
  })

  it('con la verificación simulada (desarrollo) no exige rostro', async () => {
    jest.mocked(api).mockResolvedValue(hoy({ rostro_registrado: false, rostro_requerido: false }))
    await dibujar()
    expect(await screen.findByLabelText('Marcar ingreso')).toBeTruthy()
    expect(screen.queryByLabelText('Registrar mi rostro')).toBeNull()
  })

  it('si falla la carga muestra el error y permite reintentar', async () => {
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'No hay conexión con el servidor.')).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('No hay conexión con el servidor.')).toBeTruthy()
    await fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByLabelText('Marcar ingreso')).toBeTruthy()
  })
})

describe('Inicio · reintentar', () => {
  it('al reintentar muestra «Cargando» (no deja el error anterior) hasta que responde', async () => {
    let responder: (v: unknown) => void = () => {}
    jest.mocked(api).mockRejectedValueOnce(new ApiError(0, 'El servidor no respondió.')).mockImplementationOnce(() => new Promise((r) => { responder = r }))
    await dibujar()
    expect(await screen.findByText('El servidor no respondió.')).toBeTruthy()
    // La pulsación espera al manejador (que está esperando al servidor): no se «await» hasta que responda.
    const pulsado = fireEvent.press(screen.getByLabelText('Reintentar'))
    expect(await screen.findByLabelText('Cargando tu jornada')).toBeTruthy()
    expect(screen.queryByText('El servidor no respondió.')).toBeNull()
    responder(hoy())
    await pulsado
    expect(await screen.findByLabelText('Marcar ingreso')).toBeTruthy()
  })
})

describe('Inicio · error inesperado', () => {
  it('si falla algo que no es de la API, muestra el motivo técnico', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.mocked(api).mockRejectedValue(new TypeError('JSON Parse error'))
    await dibujar()
    expect(await screen.findByText('No se pudo cargar tu jornada de hoy. (JSON Parse error)')).toBeTruthy()
  })
})

describe('Inicio · administrador', () => {
  it('no consulta marcaciones: solo ve el aviso del panel web', async () => {
    await dibujar({ perfil: perfil('administrador') })
    expect(screen.getByText(/panel de gestión está en la versión web/)).toBeTruthy()
    expect(api).not.toHaveBeenCalled()
  })
})
