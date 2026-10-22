import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Outlet, Route, Routes } from 'react-router-dom'
import { api } from '../../lib/api'
import { abrirCamara, tomarFoto } from '../../lib/camara'
import { ErrorUbicacion, obtenerPosicion } from '../../lib/ubicacion'
import { perfilDe, renderConAuth } from '../../test/helpers'
import InicioUsuario from './Inicio'

vi.mock('../../lib/api', async (original) => ({ ...(await original<typeof import('../../lib/api')>()), api: vi.fn() }))
vi.mock('../../lib/ubicacion', async (original) => ({ ...(await original<typeof import('../../lib/ubicacion')>()), obtenerPosicion: vi.fn() }))
vi.mock('../../lib/camara', async (original) => ({ ...(await original<typeof import('../../lib/camara')>()), abrirCamara: vi.fn(), tomarFoto: vi.fn() }))
vi.mock('../../components/Mapa', () => ({ Mapa: () => <div>mapa</div> }))

const HOY = {
  fecha: '2026-10-21', marcaciones: [], siguiente: 'ingreso', ultima: null, jornada: { inicio: '08:00', fin: '17:00' },
  dispositivo: 'sin_vincular', rostro_registrado: true, rostro_requerido: true,
}
const ZONA = {
  dentro: true, sede: 'Campus Central', lugar: 'Facultad de Ingeniería', distancia_m: 42, radio_m: 150,
  centro: { latitud: -2.1397, longitud: -79.5942 }, permite_fuera: false,
}
const marca = (id: string, tipo: string, hora: string, anomalia: unknown = null) =>
  ({ id, tipo, fecha_hora: `2026-10-20T${hora}:00+00:00`, sede_id: null, bloque_id: null, origen: 'app', verificacion: 'ok', lugar: 'Facultad de Ingeniería', anomalia })
const HISTORIAL = { dias: [{ fecha: '2026-10-20', marcaciones: [marca('a', 'ingreso', '12:56'), marca('b', 'salida', '22:04')] }], total: 2 }

function servidor(cambios: { hoy?: object; zona?: object; marcar?: () => unknown } = {}) {
  vi.mocked(api).mockImplementation((async (ruta: string, opciones?: { method?: string }) => {
    if (ruta.startsWith('/marcaciones/hoy')) return { ...HOY, ...cambios.hoy }
    if (ruta.startsWith('/marcaciones/zona')) return { ...ZONA, ...cambios.zona }
    if (ruta.startsWith('/marcaciones/historial')) return HISTORIAL
    if (ruta === '/marcaciones' && opciones?.method === 'POST') return cambios.marcar?.()
    throw new Error(`ruta inesperada ${ruta}`)
  }) as never)
}
const pantalla = () => renderConAuth(
  <Routes><Route path="/usuario" element={<InicioUsuario />} /><Route path="/usuario/historial" element={<p>Pantalla historial</p>} /></Routes>,
  { perfil: perfilDe('usuario') as never }, '/usuario',
)
const marcaciones = () => vi.mocked(api).mock.calls.filter(([r, o]) => r === '/marcaciones' && (o as { method?: string })?.method === 'POST')

beforeEach(() => {
  window.sessionStorage.clear()
  vi.mocked(api).mockReset()
  vi.mocked(obtenerPosicion).mockResolvedValue({ latitud: -2.1398, longitud: -79.5943, precision_m: 12, tomadaEn: Date.now() })
  vi.mocked(abrirCamara).mockResolvedValue({ getTracks: () => [] } as unknown as MediaStream)
  vi.mocked(tomarFoto).mockReturnValue({ base64: 'Zm90bw==', url: 'data:image/jpeg;base64,Zm90bw==' })
})

describe('Inicio de la persona usuaria', () => {
  it('saluda, avisa que es el canal web de contingencia y muestra la jornada, la puntualidad y lo reciente', async () => {
    servidor()
    pantalla()
    expect(await screen.findByText(/Próxima marcación: ingreso · jornada 08:00/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument()
    expect(screen.getByText(/canal web de contingencia/)).toBeInTheDocument()
    expect(screen.getByText('08:00 – 17:00')).toBeInTheDocument()
    expect(screen.getByText('100 %')).toBeInTheDocument()
    expect(await screen.findByText('Salida 17:04')).toBeInTheDocument()
    expect(await screen.findByText(/A 42 m del centro de la geocerca · radio 150 m/)).toBeInTheDocument()
    expect(screen.getByText('DENTRO DEL PERÍMETRO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled()
  })

  it('fuera del perímetro no deja marcar y explica por qué', async () => {
    servidor({ zona: { dentro: false, distancia_m: 1200 } })
    pantalla()
    expect(await screen.findByText('FUERA DEL PERÍMETRO')).toBeInTheDocument()
    expect(screen.getByText(/A 1.2 km del centro/)).toBeInTheDocument()
    expect(screen.getByText(/Debes estar dentro del perímetro de tu sede/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
  })

  it('si la sede permite marcar fuera, no bloquea', async () => {
    servidor({ zona: { dentro: false, permite_fuera: true } })
    pantalla()
    await screen.findByText('FUERA DEL PERÍMETRO')
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled()
  })

  it('sin rostro registrado pide hacerlo en la app, y con la jornada completa no hay nada más que marcar', async () => {
    servidor({ hoy: { rostro_registrado: false } })
    const { unmount } = pantalla()
    expect(await screen.findByText(/Todavía no registras tu rostro/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
    unmount()

    servidor({ hoy: { siguiente: null } })
    pantalla()
    expect(await screen.findByText('Ya completaste las marcaciones de hoy.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
  })

  it('si no se puede obtener la ubicación, lo dice y deja reintentar', async () => {
    servidor()
    vi.mocked(obtenerPosicion).mockRejectedValueOnce(new ErrorUbicacion('Bloqueaste la ubicación.'))
    pantalla()
    expect(await screen.findByText(/Bloqueaste la ubicación/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('DENTRO DEL PERÍMETRO')).toBeInTheDocument()
  })
})

describe('Avisos pendientes en el Inicio', () => {
  const conAvisos = (cantidad: number) => renderConAuth(
    <Routes>
      <Route path="/usuario" element={<Outlet context={{ avisos: { cantidad, recargar: async () => {} } }} />}>
        <Route index element={<InicioUsuario />} />
        <Route path="avisos" element={<p>Pantalla avisos</p>} />
      </Route>
    </Routes>,
    { perfil: perfilDe('usuario') as never }, '/usuario',
  )

  it('avisa cuántas anomalías hay por explicar y lleva a Avisos', async () => {
    servidor()
    conAvisos(2)
    expect(await screen.findByText('Tienes 2 anomalías por explicar.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Explicar ahora' }))
    expect(screen.getByText('Pantalla avisos')).toBeInTheDocument()
  })

  it('en singular, y sin anomalías no muestra nada', async () => {
    servidor()
    const { unmount } = conAvisos(1)
    expect(await screen.findByText('Tienes 1 anomalía por explicar.')).toBeInTheDocument()
    unmount()
    conAvisos(0)
    await screen.findByText(/canal web de contingencia/)
    expect(screen.queryByText(/por explicar/)).not.toBeInTheDocument()
  })
})

describe('Marcar por la web', () => {
  async function hastaElAviso() {
    servidor({ marcar: () => ({ marcacion: marca('n', 'ingreso', '13:11'), anomalias: [], reintento: false }) })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    return screen.findByRole('dialog', { name: 'Verifica tu identidad' })
  }

  it('el motivo es obligatorio: sin elegirlo no se inicia la verificación', async () => {
    await hastaElAviso()
    expect(screen.getByRole('button', { name: 'Iniciar verificación facial' })).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('¿Por qué marcas desde la web?'), 'celular_olvidado')
    expect(screen.getByRole('button', { name: 'Iniciar verificación facial' })).toBeEnabled()
    // Queda como chip junto al aviso del canal web.
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar marcación' }))
    expect(screen.getByText('WEB · Celular olvidado')).toBeInTheDocument()
  })

  it('registra con origen web, el motivo y sin dispositivo, y muestra el resultado', async () => {
    await hastaElAviso()
    await userEvent.selectOptions(screen.getByLabelText('¿Por qué marcas desde la web?'), 'sin_bateria')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))

    expect(await screen.findByText(/Ingreso registrado · 08:11/)).toBeInTheDocument()
    const [, opciones] = marcaciones()[0]!
    const cuerpo = (opciones as { body: Record<string, unknown> }).body
    expect(cuerpo).toMatchObject({ tipo: 'ingreso', origen: 'web', motivo_contingencia: 'sin_bateria', selfie_b64: 'Zm90bw==', ubicacion_simulada: false })
    expect(cuerpo).not.toHaveProperty('dispositivo_id')
    expect(cuerpo.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(screen.getByText('Navegador web')).toBeInTheDocument()
    expect(screen.getByText('Sin batería')).toBeInTheDocument()
    expect(screen.getByText('Sincronizado')).toBeInTheDocument()
  })

  it('si el rostro no coincide, la marcación no se guarda y se puede reintentar con el mismo id', async () => {
    const { ApiError } = await import('../../lib/api')
    let llamadas = 0
    servidor({
      marcar: () => {
        llamadas += 1
        if (llamadas === 1) throw new ApiError(422, 'El rostro no coincide', 'rostro_no_verificado', 1)
        return { marcacion: marca('n', 'ingreso', '13:11'), anomalias: [{ tipo: 'uso_recurrente_web', detalle: null }], reintento: false }
      },
    })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    await userEvent.selectOptions(await screen.findByLabelText('¿Por qué marcas desde la web?'), 'otro')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))

    expect(await screen.findByText('No pudimos verificar tu identidad')).toBeInTheDocument()
    expect(screen.getByText(/no se ha guardado/)).toBeInTheDocument()
    expect(screen.getByText(/Intento 1/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar verificación' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(await screen.findByText(/Ingreso registrado/)).toBeInTheDocument()
    expect(screen.getByText('Has usado la marcación web varias veces.')).toBeInTheDocument()

    const ids = marcaciones().map(([, o]) => (o as { body: { id: string } }).body.id)
    expect(ids[0]).toBe(ids[1])
  })

  it('cancelar vuelve al inicio sin enviar nada', async () => {
    await hastaElAviso()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar marcación' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(marcaciones()).toHaveLength(0)
  })

  it('una cámara bloqueada se explica y permite volver', async () => {
    const { ErrorCamara } = await import('../../lib/camara')
    vi.mocked(abrirCamara).mockRejectedValue(new ErrorCamara('Bloqueaste la cámara. Permítela desde el candado.'))
    await hastaElAviso()
    await userEvent.selectOptions(screen.getByLabelText('¿Por qué marcas desde la web?'), 'celular_perdido')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    expect(await screen.findByText(/Bloqueaste la cámara/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByLabelText('¿Por qué marcas desde la web?')).toBeInTheDocument()
  })

  it('un error del servidor (no de rostro) se muestra y permite reintentar', async () => {
    const { ApiError } = await import('../../lib/api')
    let llamadas = 0
    servidor({
      marcar: () => {
        llamadas += 1
        if (llamadas === 1) throw new ApiError(409, 'Ya registraste esta marcación hoy')
        return { marcacion: marca('n', 'ingreso', '13:11'), anomalias: [], reintento: false }
      },
    })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    await userEvent.selectOptions(await screen.findByLabelText('¿Por qué marcas desde la web?'), 'celular_robado')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(await screen.findByText('Ya registraste esta marcación hoy')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText(/Ingreso registrado/)).toBeInTheDocument())
  })
})
