import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ExportarDialogo } from './ExportarDialogo'
import type { SeccionExport } from './exportarSecciones'

const montar = (extra: Partial<React.ComponentProps<typeof ExportarDialogo>> = {}) => {
  const alCerrar = vi.fn()
  const alDescargar = vi.fn()
  render(<ExportarDialogo alcance="octubre de 2026 · todas las sedes" inicial={['resumen', 'indicadores', 'estado', 'graficas', 'tabla']} noDisponibles={{}} ocupado={false}
    alCerrar={alCerrar} alDescargar={alDescargar} {...extra} />)
  return { alCerrar, alDescargar }
}
const casilla = (nombre: string) => screen.getByRole('checkbox', { name: new RegExp(nombre) })

describe('ExportarDialogo', () => {
  it('abre con lo que se estaba viendo marcado y lo demás no', () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Exportar reporte a PDF' })).toBeInTheDocument()
    expect(screen.getByText('octubre de 2026 · todas las sedes')).toBeInTheDocument()
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Exportar a PDF' })).toBeInTheDocument()
    for (const n of ['Resumen redactado por IA', 'Indicadores del periodo', 'Cómo va cada caso', 'Tendencia, tipo y sede', 'Tabla de casos']) expect(casilla(n)).toBeChecked()
    for (const n of ['Sede contra sede', 'Anomalías por hora del día', 'Patrones a revisar']) expect(casilla(n)).not.toBeChecked()
    expect(screen.getByRole('status')).toHaveTextContent('Se descargará: PDF · 5 secciones')
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeEnabled()
  })

  it('descarga con las partes elegidas, en el orden del cuadro', async () => {
    const { alDescargar } = montar()
    await userEvent.click(casilla('Resumen redactado por IA'))
    await userEvent.click(casilla('Patrones a revisar'))
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    expect(alDescargar).toHaveBeenCalledWith(['indicadores', 'estado', 'graficas', 'patrones', 'tabla'] satisfies SeccionExport[])
  })

  it('«Todo», «Solo cifras y gráficas», «Solo la tabla» y «Quitar todo» marcan lo que dicen', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Solo la tabla de casos' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 sección')
    expect(casilla('Tabla de casos')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Solo cifras y gráficas' }))
    expect(casilla('Tabla de casos')).not.toBeChecked()
    expect(casilla('Resumen redactado por IA')).not.toBeChecked()
    expect(casilla('Sede contra sede')).toBeChecked()
    expect(casilla('Anomalías por hora del día')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
    expect(screen.getByRole('status')).toHaveTextContent('8 secciones')
    await userEvent.click(screen.getByRole('button', { name: 'Quitar todo' }))
    expect(screen.getByRole('status')).toHaveTextContent('0 secciones')
  })

  it('sin ninguna parte marcada no se puede descargar', async () => {
    montar()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar todo' }))
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeDisabled()
  })

  it('las partes que no están disponibles salen apagadas con su motivo y no se marcan con «Todo»', async () => {
    const { alDescargar } = montar({ noDisponibles: { resumen: 'aún no está listo', comparativo: 'quita el filtro de sede' } })
    expect(casilla('Resumen redactado por IA')).toBeDisabled()
    expect(casilla('Resumen redactado por IA')).not.toBeChecked()
    expect(screen.getByText('aún no está listo')).toBeInTheDocument()
    expect(screen.getByText('quita el filtro de sede')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Todo' }))
    expect(casilla('Sede contra sede')).not.toBeChecked()
    expect(casilla('Patrones a revisar')).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    expect(alDescargar.mock.calls[0]![0]).not.toContain('resumen')
    expect(alDescargar.mock.calls[0]![0]).not.toContain('comparativo')
  })

  it('mientras se prepara el archivo el botón dice «Preparando…» y no deja pedir otro', () => {
    montar({ ocupado: true })
    expect(screen.getByRole('button', { name: 'Preparando…' })).toBeDisabled()
  })

  it('se cierra con Cancelar, con la ✕, con Escape y tocando fuera', async () => {
    const a = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await userEvent.keyboard('{Escape}')
    await userEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement)
    expect(a.alCerrar).toHaveBeenCalledTimes(4)
  })

  it('dice que cada descarga queda en Auditoría', () => {
    montar()
    expect(screen.getByText(/queda anotada en Auditoría/)).toBeInTheDocument()
  })
})
