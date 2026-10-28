import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { api } from '../../lib/api'
import { abrirCamara, MENSAJE_SIN_CAMARA, tomarFoto } from '../../lib/camara'
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
const marca = (id: string, tipo: string, hora: string, origen = 'app') =>
  ({ id, tipo, fecha_hora: `2026-10-20T${hora}:00+00:00`, sede_id: null, bloque_id: null, origen, verificacion: 'ok' })

function servidor(cambios: { hoy?: object; zona?: object; marcar?: () => unknown } = {}) {
  vi.mocked(api).mockImplementation((async (ruta: string, opciones?: { method?: string }) => {
    if (ruta.startsWith('/marcaciones/hoy')) return { ...HOY, ...cambios.hoy }
    if (ruta.startsWith('/marcaciones/zona')) return { ...ZONA, ...cambios.zona }
    if (ruta === '/marcaciones' && opciones?.method === 'POST') return cambios.marcar?.()
    throw new Error(`ruta inesperada ${ruta}`)
  }) as never)
}
const pantalla = (cerrarSesion = async () => {}) => renderConAuth(
  <Routes><Route path="/usuario" element={<InicioUsuario />} /></Routes>,
  { perfil: perfilDe('usuario') as never, cerrarSesion }, '/usuario',
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
  it('saluda, avisa que es el canal web de contingencia y solo ofrece marcar: sin historial, avisos ni perfil', async () => {
    servidor()
    pantalla()
    expect(await screen.findByText(/Próxima marcación: ingreso · jornada 08:00/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hola, Ana' })).toBeInTheDocument()
    expect(screen.getByText(/canal web de contingencia/)).toBeInTheDocument()
    expect(await screen.findByText(/A 42 m del centro de la geocerca · radio 150 m/)).toBeInTheDocument()
    expect(screen.getByText('DENTRO DEL PERÍMETRO')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByText(/Historial|por explicar|Puntualidad/)).not.toBeInTheDocument()
  })

  it('mientras carga la jornada y la ubicación muestra esqueletos, y no el texto «Todavía no marcas nada hoy»', async () => {
    servidor()
    vi.mocked(obtenerPosicion).mockReturnValue(new Promise(() => {}))   // la ubicación no llega todavía
    pantalla()
    expect(screen.getByRole('progressbar', { name: 'Cargando tu jornada' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Cargando tus marcaciones' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Obteniendo tu ubicación' })).toBeInTheDocument()
    expect(screen.queryByText('Todavía no marcas nada hoy.')).not.toBeInTheDocument()
    // Al llegar la jornada, el esqueleto de la jornada y el de las marcaciones desaparecen.
    expect(await screen.findByText('Todavía no marcas nada hoy.')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Cargando tu jornada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'Cargando tus marcaciones' })).not.toBeInTheDocument()
  })

  it('muestra las marcaciones de hoy', async () => {
    servidor({ hoy: { marcaciones: [marca('a', 'ingreso', '12:56', 'web')], siguiente: 'salida_almuerzo' } })
    pantalla()
    expect(await screen.findByText('Ingreso 07:56')).toBeInTheDocument()
    expect(screen.getByText('WEB')).toBeInTheDocument()
  })

  it('sin marcaciones hoy lo dice', async () => {
    servidor()
    pantalla()
    expect(await screen.findByText('Todavía no marcas nada hoy.')).toBeInTheDocument()
  })

  it('fuera del perímetro deja marcar, pero avisa que quedará una observación', async () => {
    servidor({ zona: { dentro: false, distancia_m: 1200 } })
    pantalla()
    expect(await screen.findByText('FUERA DEL PERÍMETRO')).toBeInTheDocument()
    expect(screen.getByText(/A 1.2 km del centro/)).toBeInTheDocument()
    expect(screen.getByText('Puedes marcar desde aquí, pero quedará una observación para revisión.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled()
  })

  it('si la sede permite marcar fuera, no hay observación que avisar', async () => {
    servidor({ zona: { dentro: false, permite_fuera: true } })
    pantalla()
    await screen.findByText('FUERA DEL PERÍMETRO')
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled()
    expect(screen.getByText('Tu sede permite marcar fuera de la zona.')).toBeInTheDocument()
    expect(screen.queryByText(/quedará una observación/)).not.toBeInTheDocument()
  })

  it('un día no laborable deshabilita «Registrar asistencia» y explica por qué', async () => {
    servidor({ hoy: { dia_laborable: false, motivo_no_laborable: 'Hoy sábado no es un día laborable para ti. Tus días laborables son lunes a viernes.' } })
    pantalla()
    expect(await screen.findByText(/Hoy sábado no es un día laborable para ti\..*habilite este día/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
    expect(marcaciones()).toHaveLength(0)
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

  it('con poca precisión de ubicación no deja marcar, lo explica y permite volver a medir', async () => {
    servidor({ zona: { precision_max_m: 200 } })
    vi.mocked(obtenerPosicion).mockResolvedValueOnce({ latitud: -2.1398, longitud: -79.5943, precision_m: 480, tomadaEn: Date.now() })
    pantalla()
    expect(await screen.findByText(/precisión de tu ubicación es de ±480 m y para marcar se necesita ±200 m o menos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeDisabled()
    expect(api).toHaveBeenCalledWith(expect.stringContaining('origen=web'))
    await userEvent.click(screen.getByRole('button', { name: 'Volver a medir' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar asistencia' })).toBeEnabled())
    expect(screen.queryByText(/precisión de tu ubicación es de/)).not.toBeInTheDocument()
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

  it('la hoja de verificación bloquea el scroll de la página de atrás y lo devuelve al cerrarse', async () => {
    const hoja = await hastaElAviso()
    expect(document.body.style.overflow).toBe('hidden')
    expect(hoja).toHaveClass('overscroll-contain')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar marcación' }))
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('tocar el fondo oscuro cierra la hoja, pero tocar dentro de ella no', async () => {
    const hoja = await hastaElAviso()
    await userEvent.click(screen.getByText('Compararemos tu rostro', { exact: false }))
    expect(screen.getByRole('dialog', { name: 'Verifica tu identidad' })).toBeInTheDocument()
    await userEvent.click(hoja)   // el fondo: el propio contenedor del diálogo
    expect(screen.queryByRole('dialog', { name: 'Verifica tu identidad' })).not.toBeInTheDocument()
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
    // El resultado se queda en pantalla: se puede volver al inicio o cerrar la sesión, y no hay otra sección a la que ir.
    expect(screen.getByRole('button', { name: 'Volver al inicio' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver historial' })).not.toBeInTheDocument()
  })

  it('después de marcar se puede cerrar la sesión desde el mismo resultado', async () => {
    const salir = vi.fn(async () => {})
    servidor({ marcar: () => ({ marcacion: marca('n', 'ingreso', '13:11'), anomalias: [], reintento: false }) })
    pantalla(salir)
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    await userEvent.selectOptions(await screen.findByLabelText('¿Por qué marcas desde la web?'), 'sin_bateria')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    await screen.findByText(/Ingreso registrado/)
    expect(salir).not.toHaveBeenCalled()   // marcar no saca a la persona de la sesión
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))
    expect(salir).toHaveBeenCalled()
  })

  it('fuera del perímetro se registra igual y el resultado avisa de la observación', async () => {
    servidor({
      zona: { dentro: false, distancia_m: 1200 },
      marcar: () => ({ marcacion: marca('n', 'ingreso', '13:11'), anomalias: [{ tipo: 'fuera_geocerca', detalle: null }], reintento: false }),
    })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    expect(await screen.findByText(/puedes marcar, pero quedará una observación/)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('¿Por qué marcas desde la web?'), 'sin_bateria')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(await screen.findByText(/Ingreso registrado · 08:11/)).toBeInTheDocument()
    expect(screen.getByText('Estás fuera de la zona de tu sede.')).toBeInTheDocument()
    expect(marcaciones()).toHaveLength(1)
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

  it('si el servidor rechaza la precisión lo explica (no es un rostro no verificado) y al reintentar mide otra vez', async () => {
    const { ApiError } = await import('../../lib/api')
    let llamadas = 0
    servidor({
      marcar: () => {
        llamadas += 1
        if (llamadas === 1) throw new ApiError(422, 'La precisión de tu ubicación es de ±350 m y para marcar se necesita ±200 m o menos.', 'precision_insuficiente')
        return { marcacion: marca('n', 'ingreso', '13:11'), anomalias: [], reintento: false }
      },
    })
    pantalla()
    await userEvent.click(await screen.findByRole('button', { name: 'Registrar asistencia' }))
    await userEvent.selectOptions(await screen.findByLabelText('¿Por qué marcas desde la web?'), 'sin_bateria')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    fireEvent.loadedData(await screen.findByLabelText('Vista de tu cámara'))
    await userEvent.click(screen.getByRole('button', { name: 'Tomar foto' }))
    expect(await screen.findByText(/precisión de tu ubicación es de ±350 m/)).toBeInTheDocument()
    expect(screen.queryByText('No pudimos verificar tu identidad')).not.toBeInTheDocument()
    const medidas = vi.mocked(obtenerPosicion).mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText(/Ingreso registrado/)).toBeInTheDocument())
    expect(vi.mocked(obtenerPosicion).mock.calls.length).toBe(medidas + 1)
  })

  it('cancelar vuelve al inicio sin enviar nada', async () => {
    await hastaElAviso()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar marcación' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(marcaciones()).toHaveLength(0)
  })

  it('sin cámara disponible pide usar otro dispositivo con cámara, sin forma de seguir, y permite volver', async () => {
    const { ErrorCamara } = await import('../../lib/camara')
    vi.mocked(abrirCamara).mockRejectedValue(new ErrorCamara(MENSAJE_SIN_CAMARA))
    await hastaElAviso()
    await userEvent.selectOptions(screen.getByLabelText('¿Por qué marcas desde la web?'), 'celular_perdido')
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar verificación facial' }))
    expect(await screen.findByText('Para registrar asistencia, utilice otro dispositivo con cámara')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tomar foto' })).not.toBeInTheDocument()
    expect(marcaciones()).toHaveLength(0)
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
