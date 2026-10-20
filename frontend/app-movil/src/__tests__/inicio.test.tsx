import type { Session } from '@supabase/supabase-js'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import Inicio from '../app/(app)/index'
import { AuthContext, type AuthState, type Perfil } from '../auth/AuthContext'
import { ApiError, api } from '../lib/api'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))
jest.mock('../lib/supabase', () => ({ supabase: {}, configuracionCompleta: true, URL_PANEL_WEB: 'http://x' }))
jest.mock('../lib/api', () => ({ ...jest.requireActual('../lib/api'), api: jest.fn() }))
jest.mock('../lib/dispositivo', () => ({ idDispositivo: async () => 'android:cel-1' }))
// El aviso de anomalías es un pedido aparte: se simula para no mezclarlo con las respuestas encadenadas de `api`.
let mockPorJustificar = 0
const mockRecargarPendientes = async () => {}      // misma referencia en cada render, como el useCallback real
jest.mock('../lib/useAnomaliasPendientes', () => ({
  useAnomaliasPendientes: () => ({ cantidad: mockPorJustificar, recargar: mockRecargarPendientes }),
}))

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
  fecha: '2026-10-15', marcaciones: [], siguiente: 'ingreso', dispositivo: 'este', rostro_registrado: true, rostro_requerido: true, ...extra,
})

beforeEach(() => { jest.mocked(api).mockReset(); mockPush.mockReset(); mockPorJustificar = 0 })

describe('Inicio · usuario', () => {
  it('pide la jornada de hoy enviando el identificador de este celular', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    await waitFor(() => expect(screen.getByText(/Hoy · jueves, 15 de octubre/)).toBeTruthy())
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

  it('ofrece «Mis anomalías» y lleva a la lista', async () => {
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(screen.queryByText(/por justificar/)).toBeNull()
    await fireEvent.press(await screen.findByLabelText('Mis anomalías'))
    expect(mockPush).toHaveBeenCalledWith('/anomalias')
  })

  it('avisa cuántas anomalías puede justificar', async () => {
    mockPorJustificar = 2
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Tienes 2 anomalías por justificar.')).toBeTruthy()
  })

  it('en singular cuando es una', async () => {
    mockPorJustificar = 1
    jest.mocked(api).mockResolvedValue(hoy())
    await dibujar()
    expect(await screen.findByText('Tienes 1 anomalía por justificar.')).toBeTruthy()
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
