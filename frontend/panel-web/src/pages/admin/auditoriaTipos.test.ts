import { describe, expect, it } from 'vitest'
import {
  ENTIDADES, EVENTOS, LISTA_EVENTOS, esEntidad, esEvento, fechaHoraCompleta, formatearValor, nombreDeCampo, nombreDelRegistro, singularDeEntidad,
} from './auditoriaTipos'

describe('eventos y entidades', () => {
  it('tienen los nueve eventos de la bitácora, en español', () => {
    expect(LISTA_EVENTOS.map((e) => e.texto)).toEqual([
      'Crear', 'Actualizar', 'Activar', 'Desactivar', 'Registrar rostro', 'Resetear rostro', 'Resetear dispositivo', 'Decidir caso', 'Exportar reporte',
    ])
    expect(EVENTOS.desactivar.tono).toBe('aviso')
  })

  it('solo se aceptan eventos y entidades conocidos (lo que venga de la dirección se valida)', () => {
    expect(esEvento('crear')).toBe(true)
    expect(esEvento('borrar')).toBe(false)
    expect(esEvento(null)).toBe(false)
    expect(esEntidad('sedes')).toBe(true)
    expect(esEntidad('bitacora')).toBe(false)
    expect(ENTIDADES.map((e) => e.valor)).toEqual(['sedes', 'bloques', 'usuarios', 'configuracion', 'anomalias', 'feriados', 'ia_claves', 'reportes', 'auditoria'])
  })

  it('el singular de una entidad desconocida se lee igual', () => {
    expect(singularDeEntidad('anomalias')).toBe('Anomalía')
    expect(singularDeEntidad('ia_claves')).toBe('Clave de IA')
    expect(singularDeEntidad('tabla_nueva')).toBe('Tabla nueva')
  })
})

describe('nombreDeCampo', () => {
  it('traduce los campos conocidos y deja legible el que no', () => {
    expect(nombreDeCampo('radio_metros')).toBe('Radio (m)')
    expect(nombreDeCampo('precision_max_web_m')).toBe('Precisión máxima en la web (m)')
    expect(nombreDeCampo('campo_nuevo_raro')).toBe('Campo nuevo raro')
  })

  it('al exportar un reporte, el «campo» es el formato del archivo', () => {
    expect(nombreDeCampo('pdf', 'exportar_reporte')).toBe('PDF')
    expect(nombreDeCampo('xlsx', 'exportar_reporte')).toBe('Excel')
    expect(nombreDeCampo('csv', 'exportar_reporte')).toBe('CSV')
    expect(nombreDeCampo('odt', 'exportar_reporte')).toBe('ODT')
  })

  it('crear no tiene campo; decidir un caso lo llama «Decisión»', () => {
    expect(nombreDeCampo(null, 'crear')).toBe('—')
    expect(nombreDeCampo(null, 'decidir_caso')).toBe('Decisión')
  })
})

describe('fechaHoraCompleta', () => {
  it('se ve en hora de Ecuador, con el año', () => {
    expect(fechaHoraCompleta('2026-11-05T15:03:00+00:00')).toBe('5 nov 2026 · 10:03')
    expect(fechaHoraCompleta('2026-11-04T00:10:52.438837+00:00')).toBe('3 nov 2026 · 19:10')
  })
})

describe('formatearValor', () => {
  it('lo vacío es una raya', () => {
    expect(formatearValor('nombre', null).texto).toBe('—')
    expect(formatearValor('nombre', '').texto).toBe('—')
  })

  it('activo/inactivo y sí/no', () => {
    expect(formatearValor('activo', 'true').texto).toBe('Activo')
    expect(formatearValor('activa', 'false').texto).toBe('Inactivo')
    expect(formatearValor('permite_fuera_geocerca', 'true').texto).toBe('Sí')
    expect(formatearValor('permite_fuera_geocerca', 'false').texto).toBe('No')
  })

  it('fechas y horas legibles', () => {
    expect(formatearValor('fecha_registro_rostro', '2026-10-29T18:18:41.188938+00:00').texto).toBe('29 oct 2026 · 13:18')
    expect(formatearValor('fecha_inicio', '2026-12-25').texto).toBe('25 dic 2026')
    expect(formatearValor('jornada_inicio', '08:00:00').texto).toBe('08:00')
  })

  it('los días laborables se escriben con nombre', () => {
    expect(formatearValor('dias_laborables', '[1, 2, 3, 4, 5]').texto).toBe('lunes a viernes')
    expect(formatearValor('dias_laborables', '[1, 3, 5]').texto).toBe('lunes, miércoles, viernes')
    expect(formatearValor('dias_laborables', 'no es una lista').texto).toBe('no es una lista')
  })

  it('las llaves del celular no se muestran: solo se dice que están registradas', () => {
    const llave = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE-clave-publica-muy-larga'
    expect(formatearValor('clave_publica', llave).texto).toBe('Registrada')
    expect(formatearValor('clave_evidencia', 'cadena-de-certificados').texto).toBe('Registrada')
    expect(formatearValor('clave_publica', null).texto).toBe('—')
  })

  it('el identificador del celular largo se acorta, con el completo a mano', () => {
    const largo = 'ios:85C3EAD3-3F27-46F2-BB3E-F02674913168'
    expect(formatearValor('dispositivo_id', largo)).toEqual({ texto: 'ios:85C3EAD3-3F27-46F2…', completo: largo })
    expect(formatearValor('dispositivo_id', 'android:15b8daee3eeededf')).toEqual({ texto: 'android:15b8daee3eeede…', completo: 'android:15b8daee3eeededf' })
    expect(formatearValor('dispositivo_id', 'android:abc')).toEqual({ texto: 'android:abc' })
  })

  it('la decisión de un caso y el rol se leen en español', () => {
    expect(formatearValor(null, 'rechazada', 'decidir_caso').texto).toBe('Rechazada')
    expect(formatearValor(null, 'escalada', 'decidir_caso').texto).toBe('Escalada')
    expect(formatearValor('rol', 'administrador').texto).toBe('Administrador')
  })

  it('la sede se muestra por su nombre si se pudo buscar; si no, tal cual', () => {
    const nombres = new Map([['sedes:s1', 'Matriz']])
    expect(formatearValor('sede_id', 's1', 'actualizar', nombres).texto).toBe('Matriz')
    expect(formatearValor('sede_id', 's9', 'actualizar', nombres).texto).toBe('s9')
  })

  it('un texto cualquiera se deja como llegó (no se interpreta como HTML)', () => {
    expect(formatearValor('nombre', '<b>Matriz</b>').texto).toBe('<b>Matriz</b>')
    expect(formatearValor('modelo_ia', 'gemini-3.5-flash-lite').texto).toBe('gemini-3.5-flash-lite')
    expect(formatearValor('radio_metros', '300').texto).toBe('300')
  })
})

describe('nombreDelRegistro', () => {
  it('usa el nombre buscado; si no hay, las primeras letras del identificador', () => {
    const nombres = new Map([['sedes:abc12345-xyz', 'Matriz']])
    expect(nombreDelRegistro('sedes', 'abc12345-xyz', nombres)).toBe('Matriz')
    expect(nombreDelRegistro('sedes', 'zzzzzzzz-1234', nombres)).toBe('Registro zzzzzzzz')
  })

  it('un reporte se llama por su periodo, con las fechas legibles', () => {
    expect(nombreDelRegistro('reportes', '2026-11-01 a 2026-11-30')).toBe('1 nov 2026 a 30 nov 2026')
    expect(nombreDelRegistro('reportes', '2026-11-05 a 2026-11-05')).toBe('5 nov 2026')
    expect(nombreDelRegistro('reportes', 'algo raro')).toBe('algo raro')
    expect(nombreDelRegistro('auditoria', '2026-11-01 a 2026-11-30')).toBe('1 nov 2026 a 30 nov 2026')
  })

  it('la configuración es una sola fila: se llama «Parámetros del sistema»', () => {
    expect(nombreDelRegistro('configuracion', '1')).toBe('Parámetros del sistema')
  })
})
