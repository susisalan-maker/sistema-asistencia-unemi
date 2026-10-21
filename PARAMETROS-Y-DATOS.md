# Parámetros y datos del sistema: qué es dato y qué está escrito en el código

Este documento responde a una pregunta: **¿dónde vive cada número y cada regla del sistema?**
Hay cuatro lugares. Cuanto más arriba, más fácil de cambiar sin tocar código.

| Nivel | Dónde vive | Quién lo cambia | ¿Cuándo surte efecto? |
|---|---|---|---|
| **1. Datos de la base** | Tablas de Supabase | El administrador, desde el panel | Al instante |
| **2. Variables de entorno** | `.env` del microservicio | El desarrollador, en el servidor | Al reiniciar el microservicio |
| **3. Valores del código** | Constantes en Python / TypeScript | El desarrollador, con un cambio de código | Al publicar una versión nueva |
| **4. Reglas de la base** | Restricciones y tipos de la base (migraciones SQL) | El desarrollador, con una migración | Al aplicar la migración |

Última revisión: 21 de octubre de 2026. Los valores de la sección 1 son los que hoy tiene la base de datos del proyecto.

---

## 1. Datos (se editan sin tocar código)

### 1.1 Tabla `configuracion` (una sola fila, parámetros globales)

El administrador puede leerla y actualizarla (la base lo permite solo a administradores activos) y cada cambio queda en la bitácora con quién lo hizo. La pantalla para editarla es **Configuración** del panel. El microservicio lee esta tabla en cada marcación; no la copia en memoria.

| Parámetro | Valor hoy | Rango permitido | Qué controla | Dónde se usa |
|---|---|---|---|---|
| `tolerancia_min` | 10 min | 0 o más | Minutos de gracia en la entrada, en la salida y en el regreso del almuerzo | `fuera_horario`, `almuerzo_excedido` (`reglas_marcacion.py`) |
| `almuerzo_max_min` | 60 min | 15 a 180 | Duración máxima del almuerzo | `almuerzo_excedido` |
| `plazo_justificacion_h` | 48 h | 1 o más | Tiempo que tiene la persona para justificar una anomalía | Se suma al momento de crear la anomalía (`fecha_vencimiento`) |
| `plazo_revision_h` | 48 h | 1 o más | Tiempo objetivo del administrador para resolver un caso en revisión | Texto «responderá en un plazo de 48 h» en la app |
| `velocidad_max_kmh` | 120 km/h | 1 o más | Velocidad máxima creíble entre dos marcaciones seguidas | `desplazamiento_inusual` |
| `max_marcaciones_web_30d` | 3 | 1 o más | Marcaciones web de contingencia permitidas en 30 días | `uso_recurrente_web` |
| `modelo_ia` | `gpt-4.1-mini` | texto | **No se usa.** Quedó de un diseño anterior; el modelo de IA sale del `.env` (`IA_MODELO`) | Nadie |

**Dos cosas que conviene saber:**
- Cambiar `plazo_justificacion_h` afecta solo a las anomalías **nuevas**. Las que ya existen conservan el vencimiento con el que se crearon.
- `modelo_ia` es una columna huérfana. Se puede borrar en una migración futura o usarse cuando el administrador deba elegir el modelo desde el panel.

### 1.2 Datos por persona (tabla `usuarios`, se editan en Usuarios)

| Dato | Valor por omisión | Nota |
|---|---|---|
| `jornada_inicio` y `jornada_fin` | 08:00 y 17:00 | Horario laboral de cada persona |
| `dias_laborables` | Lunes a viernes | De 1 a 7 días |
| `sede_id` | (la asigna el administrador) | Contra su sede se mide la zona |
| `rol` | usuario | `usuario` o `administrador` |
| `activo` | verdadero | Una cuenta inactiva no puede marcar |
| `dispositivo_id` | vacío | Celular vinculado; el administrador lo reinicia |
| Rostro y consentimiento | vacío hasta que la persona lo registra | El rostro se guarda cifrado en `rostros` |

### 1.3 Sedes, bloques y feriados

| Tabla | Qué se guarda | Límites |
|---|---|---|
| `sedes` | Nombre, centro (latitud y longitud), **radio**, activa, `permite_fuera_geocerca` | Radio de 50 a 1000 m |
| `bloques` | Zonas dentro de una sede: centro, radio, activo | Radio de 20 a 200 m |
| `feriados` | Fecha de inicio y de fin, nombre, activo | Un feriado dura como máximo 31 días y no puede cruzarse con otro activo |

Hoy la base tiene 3 sedes, 1 bloque, 3 feriados, 4 usuarios, 6 marcaciones y 13 anomalías (datos de prueba).

### 1.4 Datos que genera el propio sistema

`marcaciones` (no se pueden editar ni borrar), `anomalias`, `justificaciones`, `mensajes_chat`, `rostros` y `bitacora` (auditoría de cada cambio del administrador).

---

## 2. Variables de entorno (archivo `.env` del microservicio)

Se leen una sola vez al arrancar: si las cambias, reinicia el microservicio. Están definidas en `backend/ia-microservicio/app/config.py`; el modelo está en `.env.example`.

### 2.1 Conexión y secretos (nunca van a git)

| Variable | Para qué sirve |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Conexión del microservicio a la base (la clave `service_role` salta las restricciones de acceso: solo existe en el servidor) |
| `ROSTRO_CLAVE_AES` | Clave AES-256 que cifra los vectores faciales. Si se pierde, todos deben registrar su rostro de nuevo |
| `PROCESOS_SECRETO` | Contraseña que debe enviar quien programa el proceso de ausencias. Sin ella, el proceso queda apagado |
| `GEMINI_API_KEY` o `ANTHROPIC_API_KEY` | Llave del proveedor de IA elegido |
| `URL_PANEL_WEB`, `CORS_ORIGINS` | Direcciones del panel (enlaces de correo y permisos del navegador). Por omisión `http://localhost:5173` |

### 2.2 Verificación facial

| Variable | Por omisión | Qué controla |
|---|---|---|
| `VERIFICACION_FACIAL` | `real` | `simulada` deja pasar toda marcación (solo para desarrollo) |
| `ROSTRO_UMBRAL` | 0.40 | Similitud mínima entre la selfie y el rostro registrado |
| `ROSTRO_UMBRAL_REGISTRO` | 0.35 | Similitud mínima entre las fotos del registro |
| `VIDA_ACTIVA` | verdadero | Detección de vida (rostro real frente a foto o pantalla) |
| `VIDA_UMBRAL` | 0.5 | Probabilidad mínima de «real» |
| `ROSTRO_VERSION_CLAVE` | 1 | Número de versión de la clave de cifrado |
| `MODELOS_DIR` | `modelos` | Carpeta de los modelos faciales |

### 2.3 Proceso de ausencias

| Variable | Por omisión | Qué controla |
|---|---|---|
| `AUSENCIAS_GRACIA_MIN` | 120 min | Minutos que se espera después del fin de la jornada antes de dar el día por terminado |
| `AUSENCIAS_DIAS_ATRAS` | 3 días | Cuántos días hacia atrás revisa cada vez |

Nota: en el `.env` de pruebas de este proyecto ambos están en 0 para poder probar el mismo día. **Antes de producción hay que quitarlos o ponerlos en sus valores normales.**

### 2.4 Chat de justificación con IA

| Variable | Por omisión | Qué controla |
|---|---|---|
| `IA_PROVEEDOR` | `anthropic` | `gemini` o `anthropic` |
| `IA_MODELO` | vacío | Modelo concreto; vacío usa `claude-haiku-5-5` o `gemini-flash-latest` según el proveedor |
| `IA_TIMEOUT_S` | 20 s | Tiempo máximo que se espera a la IA |
| `IA_MAX_MENSAJES_USUARIO` | 3 | Mensajes de la persona por caso (cuentan también los de otro tema) |
| `IA_MAX_PREGUNTAS` | 1 | Repreguntas del asistente por caso |
| `IA_AUTOAPROBAR` | verdadero | Si la IA puede aprobar solas las faltas menores |
| `IA_UMBRAL_AUTOAPROBAR` | 0.9 | Confianza mínima para aprobar sola |

---

## 3. Valores escritos en el código

Estos **no se pueden cambiar sin modificar el código** y publicar una versión nueva.

### 3.1 Reglas de negocio (microservicio)

| Valor | Dónde | Qué es |
|---|---|---|
| Zona horaria UTC−5 fija | `reglas_marcacion.py` (`ZONA_LOCAL`) | Ecuador continental. Galápagos (UTC−6) no está contemplado |
| Orden de las 4 marcaciones | `reglas_marcacion.py` (`ORDEN_DEL_DIA`) | ingreso → salida a almorzar → regreso → salida |
| Margen de hora futura | `routers/marcaciones.py` (`MARGEN_FUTURO`) | 5 min: una marcación con la hora del celular más adelantada se rechaza |
| Tipos de falta que la IA puede aprobar sola | `chat_ia.py` (`TIPOS_AUTOAPROBABLES`) | `fuera_horario`, `almuerzo_excedido`, `sin_regreso_almuerzo`, `sin_salida` |
| Clasificaciones de la IA | `ia.py` (`CLASIFICACIONES`) | `aceptable`, `requiere_revision`, `sospechosa` |
| Largo del texto de justificación | `routers/anomalias.py` | 10 a 1000 caracteres la primera vez; desde 2 caracteres en las respuestas |
| Largo de las respuestas de la IA | `ia.py` | Respuesta hasta 400 caracteres y resumen hasta 800 |
| Mensajes fijos del chat | `chat_ia.py` | Aviso de fuera de tema, cierre por fuera de tema, cierre sin respuesta |
| Instrucciones a la IA (qué puede decir y qué no) | `ia.py` (`instrucciones`) | Solo habla del caso, nunca promete aprobar, ignora órdenes escondidas |
| Modelos por omisión | `ia.py` | `claude-haiku-5-5` y `gemini-flash-latest` |
| Tipos de ausencia del proceso periódico | `reglas_ausencia.py` | `sin_ingreso`, `sin_salida`, `sin_regreso_almuerzo` |
| Giro máximo del rostro | `routers/rostro.py` y `verificacion.py` | 0.30 de frente, 0.60 leve en el registro y 0.40 al marcar |
| Detector de rostros (tamaño, umbrales, modelos de vida) | `biometria.py` | Parámetros de los modelos ONNX |
| Cifrado de rostros | `cifrado.py` | AES-256-GCM, 512 números por vector, nonce de 12 bytes |
| Máximo de días de un feriado | `schemas.py` | 31 |
| Textos de los tipos de anomalía que ve la IA | `ia.py` (`NOMBRES_TIPO`) | Cómo se nombra cada tipo en el chat |

### 3.2 Reglas que **no existen** hoy (conviene saberlo)

- No hay tiempo mínimo entre marcaciones: ingreso, salida a almorzar, regreso y salida seguidas en un minuto se aceptan.
- No hay franja horaria para el almuerzo: se puede salir a cualquier hora; solo se mide cuánto dura.
- La hora de la marcación la pone siempre el servidor (la del celular se ignora). La ubicación falsa se detecta solo en Android (Android avisa cuando la posición es simulada): esa marcación se rechaza y queda la anomalía `ubicacion_simulada`. No cubre celulares con root ni emuladores que oculten el aviso (trabajo futuro: Google Play Integrity); en iPhone el aviso no existe.
- La precisión del GPS no se descuenta del radio: la tolerancia ya está en el margen del círculo.

### 3.3 App móvil

| Valor | Dónde | Qué es |
|---|---|---|
| Espera máxima a la red | `lib/api.ts` | 15 s (45 s al enviar fotos del rostro, en `lib/rostro.ts`) |
| Espera del GPS | `lib/ubicacion.ts` | 20 s; la posición medida vale 90 s |
| Espera del mapa | `components/MapaGeocerca.tsx` | 10 s antes de quitar el esqueleto de carga |
| Días del historial | `app/(app)/historial.tsx` | 7 |
| Largo de justificación | `lib/anomalias.ts` | 10 a 1000 caracteres (igual que el servidor) |
| Texto del consentimiento biométrico y pasos del registro | `lib/rostro.ts` | Texto fijo |
| Proveedor de mapas | `lib/mapa.ts` | OpenStreetMap con Leaflet |
| Direcciones de servidor y panel | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | Se leen del `.env.local`; cambian con la red |

### 3.4 Panel web

| Valor | Dónde | Qué es |
|---|---|---|
| Tarjetas por página | `pages/admin/Anomalias.tsx` | 9 |
| Tope de anomalías cargadas | `pages/admin/Anomalias.tsx` | 500 |
| Radios permitidos | `lib/geo.ts` | Sedes 50 a 1000 m; bloques 20 a 200 m (igual que la base) |
| Zona horaria de las fechas | `pages/admin/anomaliasTipos.ts` | `America/Guayaquil` |
| Nombres de los tipos y estados de anomalía | `pages/admin/anomaliasTipos.ts` | Textos que se muestran |
| Motivos de marcación de contingencia | `pages/admin/anomaliasTipos.ts` | Lista fija |
| Buscador de lugares | `lib/buscarLugares.ts` | Photon (OpenStreetMap), limitado a Ecuador, desde 3 letras |

---

## 4. Reglas fijas de la base (migraciones SQL)

| Regla | Dónde | Detalle |
|---|---|---|
| Tipos de anomalía | `tipo_anomalia` | 12 tipos (los 10 originales, `sin_ingreso` de la migración 0002 y `ubicacion_simulada` de la 0005) |
| Estados de una anomalía | `estado_anomalia` | `pendiente`, `en_revision`, `justificada`, `rechazada`, `sin_justificar` |
| Decisiones del administrador | `decision_caso` | `aprobada`, `rechazada`, `escalada` |
| Rechazar exige comentario | `rechazo_con_comentario` | Restricción de la tabla de justificaciones |
| Marcaciones inmutables | `marcaciones_inmutable` | No se pueden editar ni borrar |
| Rostro requiere consentimiento | `rostro_requiere_consentimiento` | No hay rostro sin consentimiento |
| Máximo de mensajes por caso | `registrar_mensaje_usuario` | Se pasa desde el microservicio (`IA_MAX_MENSAJES_USUARIO`) |
| Qué decisión admite el sistema | `decidir_anomalia` | Solo casos `en_revision` o `sin_justificar` |

---

## 5. Qué conviene pasar a datos (propuesta, por orden de utilidad)

1. **Tolerancia, almuerzo, plazos, velocidad y marcaciones web**: ya son datos, solo faltaba la pantalla (se construye con la pantalla Configuración).
2. **Tipos de falta que la IA puede aprobar sola** y **confianza mínima**: hoy están en el código y en el `.env`. Si Talento Humano necesita ajustarlos sin pedir un despliegue, pasarlos a `configuracion`.
3. **Mensajes máximos del chat y repreguntas**: igual que el punto anterior.
4. **Gracia y días atrás del proceso de ausencias**: son del servidor; solo tendría sentido moverlos si se quiere ajustarlos en producción sin reiniciar.
5. **Margen de hora futura** y la regla del **tiempo mínimo entre marcaciones**: para endurecer la validación contra manipulación del reloj.
6. **Columna `modelo_ia`**: borrarla o usarla; hoy confunde.
7. **Franja del almuerzo** (por ejemplo, entre las 12:00 y las 15:00): si la institución lo exige, es una regla nueva, no un cambio de dato.

Los secretos (llaves, clave de cifrado) **nunca** deben pasar a la base ni al panel.
