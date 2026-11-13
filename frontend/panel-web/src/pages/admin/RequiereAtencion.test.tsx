import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('ordena por urgencia: plazo vencido, por vencer, sin justificar, rostro, celular (las sospechosas van en el pie)', () => {
    const items = itemsDeAtencion(con({
      revision: { total: 5, vencidos: 2, por_vencer: 1 }, sin_justificar: 3, sospechosas: 1,
      rostro: [{ usuario_id: 'u1', nombre: 'Ana Pérez', intentos: 4 }], sin_celular: 2,
    }))
    expect(items.map((i) => i.clave)).toEqual(['vencidos', 'por-vencer', 'sin-justificar', 'rostro-u1', 'sin-celular'])
    expect(items[0]).toMatchObject({ tono: 'error', n: 2, titulo: 'Casos en revisión que ya pasaron el plazo de 48 h' })
    expect(items.map((i) => i.n)).toEqual([2, 1, 3, 4, 2])
  })

  it('usa singular y plural', () => {
    const uno = itemsDeAtencion(con({ revision: { vencidos: 1, por_vencer: 1 }, sin_justificar: 1, sin_celular: 1 }))
    expect(uno.map((i) => i.titulo)).toEqual([
      'Caso en revisión que ya pasó el plazo de 48 h',
      'Caso en revisión que vence en menos de 6 horas',
      'Caso sin justificar espera tu decisión',
      'Persona todavía sin celular vinculado',
    ])
    const varios = itemsDeAtencion(con({ revision: { vencidos: 2, por_vencer: 3 }, sin_justificar: 2, sin_celular: 4 }))
    expect(varios.map((i) => i.titulo)).toEqual([
      'Casos en revisión que ya pasaron el plazo de 48 h',
      'Casos en revisión que vencen en menos de 6 horas',
      'Casos sin justificar esperan tu decisión',
      'Personas todavía sin celular vinculado',
    ])
  })

  it('ningún aviso dice que la IA decidió', () => {
    const textos = itemsDeAtencion(con({ revision: { vencidos: 1, por_vencer: 1 }, sin_justificar: 2, sospechosas: 2 })).map((i) => `${i.titulo} ${i.detalle}`).join(' ')
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
    expect(uno.detalle).toMatch(/^A-1042 · A-1047\. El plazo es de 48 h/)
    const [muchos] = itemsDeAtencion(con({ revision: { por_vencer: 8, por_vencer_casos: ['A-1', 'A-2', 'A-3', 'A-4', 'A-5'] } }))
    expect(muchos.detalle).toMatch(/^A-1 · A-2 · A-3 · A-4 · A-5 · …\./)
  })

  it('si la base no manda los números, el texto queda sin ellos', () => {
    const [uno] = itemsDeAtencion(con({ revision: { por_vencer: 1 } }))
    expect(uno.detalle).toBe('El plazo es de 48 h desde que la persona terminó de justificar.')
  })
})

describe('<RequiereAtencion>', () => {
  const ver = (props: Partial<React.ComponentProps<typeof RequiereAtencion>>) =>
    render(<MemoryRouter><RequiereAtencion atencion={null} error={false} onReintentar={() => {}} {...props} /></MemoryRouter>)

  it('si todo está al día, lo dice y no ofrece revisar nada', () => {
    ver({ atencion: vacia })
    expect(screen.getByText('Todo al día: nada requiere tu atención ahora.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Revisar los/ })).not.toBeInTheDocument()
  })

  it('cada aviso es un enlace con su número y su texto; el botón del pie lleva a todos los casos por resolver', () => {
    ver({ atencion: con({ revision: { total: 3, vencidos: 2 }, sin_justificar: 2 }) })
    const lista = screen.getByRole('list')
    const enlaces = within(lista).getAllByRole('link')
    expect(enlaces[0]).toHaveAccessibleName(/2 Casos en revisión que ya pasaron el plazo de 48 h/)
    expect(enlaces[0]).toHaveAttribute('href', '/admin/anomalias?estado=por_resolver')
    expect(screen.getByText('5 casos')).toBeInTheDocument()   // 3 en revisión + 2 sin justificar
    expect(screen.getByRole('link', { name: 'Revisar los 5 casos' })).toHaveAttribute('href', '/admin/anomalias?estado=por_resolver')
  })

  it('con casos sospechosos, el pie dice que la IA solo sugiere', () => {
    ver({ atencion: con({ revision: { total: 1, vencidos: 1 }, sospechosas: 2 }) })
    expect(screen.getByText('La IA clasificó 2 casos como sospechosos. Solo sugiere: la decisión es de una persona.')).toBeInTheDocument()
  })

  it('muestra cuatro y «Ver las N» despliega el resto', async () => {
    ver({ atencion: con({ revision: { total: 2, vencidos: 1, por_vencer: 1 }, sin_justificar: 1, sin_celular: 1, rostro: [{ usuario_id: 'u1', nombre: 'Ana', intentos: 3 }] }) })
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    await userEvent.click(screen.getByRole('button', { name: 'Ver las 5' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
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
    ver({ atencion: con({ revision: { total: 1, vencidos: 1 } }), error: true })
    expect(screen.getByText('No se pudo actualizar; se muestra lo último que llegó.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Revisar el caso' })).toBeInTheDocument()
  })
})
