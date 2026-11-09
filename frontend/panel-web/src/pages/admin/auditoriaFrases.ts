import type { AccionAuditoria, CambioAuditoria } from './auditoriaDatos'
import { EVENTOS, formatearValor, nombreDeCampo, nombreDelRegistro, singularDeEntidad, type EventoBitacora } from './auditoriaTipos'

/** Un pedazo de una frase; los `fuerte` van en negrita. */
export interface Trozo { t: string; fuerte?: boolean }

export interface Descripcion {
  /** Quién lo hizo: el nombre de la persona o «Sistema». */
  autor: string
  esSistema: boolean
  /** La frase en pedazos (el primero es quien lo hizo) para ponerla en negritas. */
  trozos: Trozo[]
  /** La misma frase, sin formato: para el título del panel y para el Excel. */
  texto: string
  /** Lo que cambió o lo que se exportó, en pocas palabras (se muestran los primeros). */
  etiquetas: string[]
  /** Cuántas etiquetas se ven en la lista (las demás quedan en «+N más» y en el detalle). */
  visibles: number
  /** Una frase extra bajo las etiquetas: el motivo, normalmente. */
  nota: string | null
  /** El nombre del registro afectado. */
  registro: string
  /** Los datos cambiados con su antes y después, para la tabla del panel. */
  datos: { dato: string; antes: string; despues: string }[]
}

const COSAS: Record<string, string> = {
  sedes: 'la sede', bloques: 'el bloque', usuarios: 'el usuario', anomalias: 'el caso', feriados: 'el día no laborable', ia_claves: 'la clave de IA',
  configuracion: 'la configuración',
}

const minuscula = (t: string) => (t ? t[0]!.toLowerCase() + t.slice(1) : t)
const recortar = (t: string, max = 28) => (t.length > max ? `${t.slice(0, max - 1)}…` : t)
const sinCaso = (t: string) => t.replace(/^Caso /, '')
const mayuscula = (t: string) => (t ? t[0]!.toUpperCase() + t.slice(1) : t)

export function nombreDelAutor(a: Pick<AccionAuditoria, 'usuario_id' | 'autor'>): string {
  if (a.usuario_id === null) return 'Sistema'
  return a.autor ? `${a.autor.nombres} ${a.autor.apellidos}`.trim() : 'Persona desconocida'
}

/** Los datos de una acción con su nombre y sus valores legibles (los cambios sin dato, como «decidir», no entran). */
export function datosDeAccion(a: AccionAuditoria, nombres: ReadonlyMap<string, string>): { dato: string; antes: string; despues: string }[] {
  return a.cambios.filter((c: CambioAuditoria) => c.campo).map((c) => ({
    dato: nombreDeCampo(c.campo, c.evento),
    antes: formatearValor(c.campo, c.valor_anterior, c.evento, nombres).texto,
    despues: formatearValor(c.campo, c.valor_nuevo, c.evento, nombres).texto,
  }))
}

/** La frase de una acción, con sus etiquetas: «Laura Mendoza cambió 4 datos de Pedro Salazar». */
export function describirAccion(a: AccionAuditoria, nombres: ReadonlyMap<string, string>): Descripcion {
  const autor = nombreDelAutor(a)
  const registro = nombreDelRegistro(a.entidad, a.entidad_id, nombres)
  const evento: EventoBitacora = a.evento in EVENTOS ? a.evento : 'actualizar'
  const datos = a.evento === 'exportar_reporte' ? [] : datosDeAccion(a, nombres)
  const trozos: Trozo[] = [{ t: autor, fuerte: true }]
  const dice = (...partes: (string | Trozo)[]) => { for (const p of partes) trozos.push(typeof p === 'string' ? { t: p } : p) }
  const fuerte = (t: string): Trozo => ({ t, fuerte: true })
  let etiquetas: string[] = []
  let nota: string | null = a.motivo ? `Motivo: ${a.motivo}` : null
  const primero = a.cambios[0]

  if (a.entidad === 'reportes' || a.entidad === 'auditoria') {
    const formato = nombreDeCampo(primero?.campo ?? null, 'exportar_reporte')
    dice(a.entidad === 'auditoria' ? ' exportó la bitácora a ' : ' exportó un reporte a ', fuerte(formato))
    etiquetas = [`Periodo: ${registro}`]
    if (primero?.valor_nuevo) etiquetas.push(primero.valor_nuevo)
    if (a.entidad === 'reportes' && a.motivo) {
      // «Sede: Matriz · sin resumen con IA · Incluye: Tabla de casos»: la sede y lo del resumen son etiquetas; lo que incluye, nota.
      const partes = a.motivo.split(' · ')
      const sede = partes.find((p) => p.startsWith('Sede: '))
      const incluye = partes.find((p) => p.startsWith('Incluye: '))
      const resumen = partes.find((p) => /resumen/i.test(p) && !p.startsWith('Incluye: '))
      if (sede) etiquetas.push(sede.slice(6).toLowerCase() === 'todas' ? 'Todas las sedes' : sede.slice(6))
      if (resumen) etiquetas.push(mayuscula(resumen))
      nota = incluye ?? null
    } else if (a.entidad === 'auditoria') nota = a.motivo
  } else if (evento === 'decidir_caso') {
    const caso = nombres.get(`anomalias_caso:${a.entidad_id}`)
    const persona = nombres.get(`anomalias_persona:${a.entidad_id}`)
    const decision = formatearValor(null, primero?.valor_nuevo ?? null, 'decidir_caso').texto
    if (caso && persona) dice(' decidió el caso ', fuerte(caso), ' de ', fuerte(persona), ': ', fuerte(decision))
    else dice(' decidió el caso ', fuerte(sinCaso(registro)), ': ', fuerte(decision))
  } else if (evento === 'resetear_rostro' || evento === 'resetear_dispositivo') {
    dice(' reseteó el ', fuerte(evento === 'resetear_rostro' ? 'rostro' : 'celular'), ' de ', fuerte(registro))
  } else if (evento === 'registrar_rostro') {
    if (a.usuario_id !== null && a.usuario_id === a.entidad_id) dice(' registró su ', fuerte('rostro'))
    else dice(' registró el ', fuerte('rostro'), ' de ', fuerte(registro))
  } else if (evento === 'crear' || evento === 'activar' || evento === 'desactivar') {
    const verbo = evento === 'crear' ? ' creó ' : evento === 'activar' ? ' activó ' : ' desactivó '
    const cosa = COSAS[a.entidad] ?? `el ${minuscula(singularDeEntidad(a.entidad))}`
    dice(verbo, `${cosa} `, fuerte(a.entidad === 'anomalias' ? sinCaso(registro) : registro))
    if (evento !== 'crear') etiquetas = datos.map((d) => `${d.dato}: ${recortar(d.antes)} → ${recortar(d.despues)}`)
  } else if (datos.length === 0) {
    dice(' modificó ', fuerte(registro))
  } else if (datos.length === 1) {
    dice(' cambió ', fuerte(minuscula(datos[0]!.dato)), a.entidad === 'configuracion' ? ' en ' : ' de ', fuerte(registro))
    etiquetas = [`${datos[0]!.dato}: ${recortar(datos[0]!.antes)} → ${recortar(datos[0]!.despues)}`]
  } else {
    dice(' cambió ', fuerte(`${datos.length} datos`), a.entidad === 'configuracion' ? ' en ' : ' de ', fuerte(registro))
    etiquetas = datos.map((d) => `${d.dato}: ${recortar(d.antes)} → ${recortar(d.despues)}`)
  }

  const esExportacion = a.entidad === 'reportes' || a.entidad === 'auditoria'
  return { autor, esSistema: a.usuario_id === null, trozos, texto: trozos.map((t) => t.t).join(''), etiquetas, visibles: esExportacion ? 4 : 2, nota, registro, datos }
}
