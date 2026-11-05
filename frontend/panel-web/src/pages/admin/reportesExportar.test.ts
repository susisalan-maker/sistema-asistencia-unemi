import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FilaHistorico } from './reportesDatos'
import { ENCABEZADOS_CSV, aCsv, celdaCsv, descargarTexto, fechaHoraCompleta, nombreDeArchivo } from './reportesExportar'

const fila = (extra: Partial<FilaHistorico> = {}): FilaHistorico => ({
  id: 'a', numero: 12, caso: 'A-12', tipo: 'fuera_geocerca', estado: 'justificada', created_at: '2026-10-20T19:05:00Z',
  colaborador: 'Ana María Pérez', sede: 'Matriz', clasificacion_ia: 'aceptable', decision_final: 'aprobada',
  revisado_por_nombre: 'Luis Vera', fecha_decision: '2026-10-21T15:30:00Z', ...extra,
})

describe('celdaCsv', () => {
  it('deja el texto simple tal cual y encierra entre comillas lo que lleva separador, comillas o saltos', () => {
    expect(celdaCsv('Matriz')).toBe('Matriz')
    expect(celdaCsv('a;b')).toBe('"a;b"')
    expect(celdaCsv('dijo "hola"')).toBe('"dijo ""hola"""')
    expect(celdaCsv('línea 1\nlínea 2')).toBe('"línea 1\nlínea 2"')
    expect(celdaCsv(null)).toBe('')
    expect(celdaCsv(undefined)).toBe('')
    expect(celdaCsv(7)).toBe('7')
  })

  it('neutraliza lo que Excel tomaría por una fórmula', () => {
    expect(celdaCsv('=1+1')).toBe("'=1+1")
    expect(celdaCsv('+593')).toBe("'+593")
    expect(celdaCsv('-2')).toBe("'-2")
    expect(celdaCsv('@usuario')).toBe("'@usuario")
    expect(celdaCsv('=HYPERLINK("http://x";"clic")')).toBe('"\'=HYPERLINK(""http://x"";""clic"")"')
  })
})

describe('fechaHoraCompleta', () => {
  it('usa la hora de Ecuador, aunque en UTC ya sea otro día', () => {
    expect(fechaHoraCompleta('2026-10-20T19:05:00Z')).toBe('2026-10-20 14:05')
    expect(fechaHoraCompleta('2026-10-21T03:30:00Z')).toBe('2026-10-20 22:30')
    expect(fechaHoraCompleta('2026-10-21T05:00:00Z')).toBe('2026-10-21 00:00')
  })
  it('sin fecha o con una fecha inválida, vacío', () => {
    expect(fechaHoraCompleta(null)).toBe('')
    expect(fechaHoraCompleta('ayer')).toBe('')
  })
})

describe('aCsv', () => {
  it('empieza con la marca UTF-8, usa punto y coma y termina cada línea con salto de Windows', () => {
    const csv = aCsv([fila()])
    expect(csv.startsWith('﻿')).toBe(true)
    const lineas = csv.slice(1).split('\r\n')
    expect(lineas[0]).toBe(ENCABEZADOS_CSV.join(';'))
    expect(lineas[1]).toBe('A-12;2026-10-20 14:05;Ana María Pérez;Marcación fuera de la zona;Matriz;Justificada;Aprobada · Luis Vera;aceptable;2026-10-21 10:30')
    expect(lineas[2]).toBe('')
  })

  it('un periodo sin casos deja solo los encabezados', () => {
    expect(aCsv([]).slice(1).split('\r\n')).toEqual([ENCABEZADOS_CSV.join(';'), ''])
  })

  it('los datos de las personas no pueden inyectar fórmulas ni romper las columnas', () => {
    const csv = aCsv([fila({ colaborador: '=CMD|\'/c calc\'!A1', sede: 'Sede; "Norte"', clasificacion_ia: null, decision_final: null, revisado_por_nombre: null, estado: 'pendiente', fecha_decision: null })])
    const linea = csv.slice(1).split('\r\n')[1]
    expect(linea).toContain(";'=CMD|'/c calc'!A1;")
    expect(linea).toContain('"Sede; ""Norte"""')
    expect(linea.endsWith('Esperando a la persona;;')).toBe(true)
  })
})

describe('nombreDeArchivo', () => {
  it('lleva el periodo', () => {
    expect(nombreDeArchivo('2026-10-01', '2026-10-31', 'csv')).toBe('reporte-anomalias-2026-10-01-a-2026-10-31.csv')
  })
})

describe('descargarTexto', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

  it('crea un enlace temporal, lo pulsa con el nombre pedido y lo quita', () => {
    vi.useFakeTimers()
    const crear = vi.fn(() => 'blob:falso')
    const soltar = vi.fn()
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: soltar })
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe('r.csv')
      expect(this.href).toBe('blob:falso')
    })
    descargarTexto('r.csv', 'hola')
    expect(clic).toHaveBeenCalledOnce()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(soltar).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(soltar).toHaveBeenCalledWith('blob:falso')
  })
})
