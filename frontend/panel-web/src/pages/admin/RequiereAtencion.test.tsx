import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { leerAtencion } from './estadoHoy'
import { RequiereAtencion, itemsDeAtencion } from './RequiereAtencion'

const vacia = leerAtencion({})
const con = (c: Record<string, unknown>) => leerAtencion({ plazo_revision_h: 48, ...c })

describe('itemsDeAtencion', () => {
  it('sin nada pendiente no hay avisos', () => {
    expect(itemsDeAtencion(vacia)).toEqual([])
  })

  it('ordena por urgencia: plazo vencido, por vencer, sin justificar, sospechosas, rostro, celular', () => {
    const items = itemsDeAtencion(con({
      revision: { total: 5, vencidos: 2, por_vencer: 1 }, sin_justificar: 3, sospechosas: 1,
      rostro: [{ usuario_id: 'u1', nombre: 'Ana Pérez', intentos: 4 }], sin_celular: 2,
    }))
    expect(items.map((i) => i.clave)).toEqual(['vencidos', 'por-vencer', 'sin-justificar', 'sospechosas', 'rostro-u1', 'sin-celular'])
    expect(items[0]).toMatchObject({ tono: 'error', titulo: '2 casos en revisión ya pasaron el plazo de 48 h' })
  })

  it('usa singular y plural', () => {
    const uno = itemsDeAtencion(con({ revision: { vencidos: 1, por_vencer: 1 }, sin_justificar: 1, sospechosas: 1, sin_celular: 1 }))
    expect(uno.map((i) => i.titulo)).toEqual([
      '1 caso en revisión ya pasó el plazo de 48 h',
      '1 caso en revisión vence en menos de 6 horas',
      '1 caso sin justificar espera tu decisión',
      'La IA clasificó 1 caso como sospechoso',
      '1 persona todavía no tiene un celular vinculado',
    ])
  })

  it('la IA solo sugiere: ningún aviso dice que ella decidió', () => {
    const textos = itemsDeAtencion(con({ revision: { vencidos: 1, por_vencer: 1 }, sin_justificar: 2, sospechosas: 2 })).map((i) => `${i.titulo} ${i.detalle}`).join(' ')
    expect(textos).toContain('la decisión es de una persona')
    expect(textos).not.toMatch(/aprob[óo] autom|resuelto por la IA|decidi[óo] la IA/i)
  })

  it('cada aviso lleva a donde se resuelve; el de rostro filtra por la persona', () => {
    const items = itemsDeAtencion(con({ revision: { vencidos: 1 }, rostro: [{ usuario_id: 'u1', nombre: 'Ana Pérez', intentos: 3 }], sin_celular: 1 }))
    expect(items.map((i) => i.a)).toEqual([
      '/admin/anomalias?estado=por_resolver',
      '/admin/anomalias?estado=todas&tipo=verificacion_fallida&q=Ana%20P%C3%A9rez',
      '/admin/usuarios',
    ])
  })
})

describe('casos que vencen pronto', () => {
  it('lista los números de caso y marca que hay más si no caben', () => {
    const [uno] = itemsDeAtencion(con({ revision: { por_vencer: 2, por_vencer_casos: ['A-1042', 'A-1047'] } }))
    expect(uno.detalle).toMatch(/^A-1042 · A-1047\. El plazo de revisión es de 48 h/)
    const [muchos] = itemsDeAtencion(con({ revision: { por_vencer: 8, por_vencer_casos: ['A-1', 'A-2', 'A-3', 'A-4', 'A-5'] } }))
    expect(muchos.detalle).toMatch(/^A-1 · A-2 · A-3 · A-4 · A-5 · …\./)
  })

  it('si la base no manda los números, el texto queda como antes', () => {
    const [uno] = itemsDeAtencion(con({ revision: { por_vencer: 1 } }))
    expect(uno.detalle).toBe('El plazo de revisión es de 48 h desde que la persona terminó de justificar.')
  })
})

describe('<RequiereAtencion>', () => {
  const ver = (props: Partial<React.ComponentProps<typeof RequiereAtencion>>) =>
    render(<MemoryRouter><RequiereAtencion atencion={null} error={false} onReintentar={() => {}} {...props} /></MemoryRouter>)

  it('si todo está al día, lo dice', () => {
    ver({ atencion: vacia })
    expect(screen.getByText('Todo al día: nada requiere tu atención ahora.')).toBeInTheDocument()
  })

  it('lista los avisos con su botón', () => {
    ver({ atencion: con({ revision: { vencidos: 2 } }) })
    expect(screen.getByRole('link', { name: 'Revisar ahora' })).toHaveAttribute('href', '/admin/anomalias?estado=por_resolver')
  })

  it('mientras carga no muestra «todo al día»', () => {
    ver({})
    expect(screen.queryByText(/Todo al día/)).not.toBeInTheDocument()
  })

  it('si falla y no hay nada, avisa y deja reintentar', () => {
    const reintentar = vi.fn()
    ver({ error: true, onReintentar: reintentar })
    screen.getByRole('button', { name: 'Reintentar' }).click()
    expect(reintentar).toHaveBeenCalledTimes(1)
  })

  it('si falla pero ya había datos, conserva lo último y avisa', () => {
    ver({ atencion: con({ revision: { vencidos: 1 } }), error: true })
    expect(screen.getByText('No se pudo actualizar; se muestra lo último que llegó.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar ahora' })).toBeInTheDocument()
  })
})
