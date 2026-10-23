# Lógica de negocio — reglas, permisos y límites de la IA

Documento base para empezar a desarrollar: qué puede hacer cada rol, cuándo se puede justificar una anomalía y cuándo no, y qué le corresponde decidir a la IA vs. a una persona.

## 1. Permisos por rol

| Acción | Usuario | Administrador |
|---|:---:|:---:|
| Marcar asistencia (ingreso, salida y regreso de almuerzo, salida final) desde la app | ✅ (solo la suya) | ❌ |
| Marcar desde la web por contingencia (con motivo) | ✅ (solo la suya) | ❌ |
| Registrar su propio rostro (con consentimiento) | ✅ | ❌ |
| Resetear el rostro de un usuario | ❌ | ✅ |
| Ver su propio historial de marcaciones | ✅ | ✅ (de todos) |
| Ver marcaciones de otros usuarios | ❌ | ✅ |
| Responder/justificar una anomalía | ✅ (solo las suyas) | ❌ |
| Ver el estado de sus justificaciones | ✅ (solo las suyas) | ✅ (de todos) |
| Aprobar / rechazar / escalar una justificación (decisión final) | ❌ | ✅ (rechazar exige comentario) |
| Editar el texto de una justificación ya enviada | ❌ | ❌ (nadie la edita, solo se anexa la decisión) |
| Ver el dashboard de analítica | ❌ | ✅ |
| Crear/editar sedes y sus bloques (zonas de marcación) | ❌ | ✅ |
| Dar de alta/baja usuarios | ❌ | ✅ |
| Consultar la bitácora de auditoría (solo lectura) | ❌ | ✅ |
| Ajustar plazos, parámetros de las reglas y modelo de IA | ❌ | ✅ |

**Regla de acceso técnica:** se aplica con Row Level Security en Supabase. En `marcaciones`, `anomalias`, `justificaciones` y `mensajes_chat` el Usuario solo **lee** filas propias y el Administrador lee todo; ningún cliente tiene permiso de escritura sobre esas cuatro tablas. Las marcaciones, anomalías, justificaciones y mensajes los escribe el microservicio (con la `service_role key`) después de verificar rostro, ubicación y propiedad del caso. La decisión del Administrador pasa por la función `decidir_anomalia()`, que valida que quien la ejecuta sea un administrador activo. La tabla `rostros` (vectores faciales cifrados) es más restrictiva todavía: **ningún cliente, ni el Administrador, puede leerla ni escribirla**; solo el microservicio. Nada de esto se implementa "a mano" en el frontend, porque se puede saltar.

## 2. Acceso por interfaz

- **App móvil:** canal principal del Usuario (`rol = 'usuario'`).
- **Web, ruta `/usuario`:** canal de **contingencia** del Usuario, para cuando se le pierde, le roban, olvida, daña o descarga el celular. Misma cuenta, mismas reglas.
- **Web, ruta `/admin`:** solo cuentas con `rol = 'administrador'`. Si un Usuario intenta entrar, se le rechaza antes de cargar cualquier dato.
- Es una sola aplicación web: el login lee el rol y redirige.

### 2.1 Verificación de identidad (rostro)
- Antes de la primera marcación, el Usuario **registra su rostro** y acepta el consentimiento de datos biométricos (LOPDP). Sin rostro registrado no puede marcar.
- **Registro guiado:** la app pide 3 a 5 fotos (frente y giros leves de la cara) con una guía en pantalla y controles de calidad (una sola cara, buena luz, sin lentes oscuros). Se guarda un vector por foto.
- Cada marcación incluye una selfie de frente; el microservicio verifica que sea una **cara real** (detección de vida pasiva) y la compara con los vectores guardados. Resultado: `verificada`, `pendiente` o `fallida`. La foto **no se guarda**, solo los vectores (cifrados) y el puntaje de cada marcación.
- **Estado:** el registro, la comparación y la detección de vida **pasiva** (modelos MiniFASNet en el servidor) están implementados; la activa (parpadeo o giro) no. Cuando la foto del registro o de la marcación no sirve (borrosa, oscura, varias caras…), se pide repetirla sin generar anomalía; solo un rostro que no coincide genera `verificacion_fallida`.
- **Dónde y cómo se guardan los vectores:** el microservicio los cifra con AES-256-GCM y los guarda en la tabla `rostros` (un registro por usuario). La clave de cifrado vive solo en el servidor. Los clientes no pueden leer esa tabla; el panel del Administrador solo muestra el estado (registrado / sin registrar), tomado de las fechas de `usuarios`.
- Si la selfie parece una foto o una pantalla, se trata como verificación fallida (anomalía `verificacion_fallida`, con el motivo).
- **Verificación fallida:** la marcación no se registra y se genera una anomalía `verificacion_fallida` (con el número de intentos fallidos). El Usuario puede reintentar.
- **Sin conexión (app Android):** si no hay internet, la app guarda la marcación (con su selfie) en una carpeta privada del celular, con su UUID y la hora que marcaba el reloj del celular, y le dice a la persona «Ingreso guardado» (se enviará cuando haya conexión). Al volver la señal (o con el botón «Sincronizar ahora») la app envía las pendientes **en orden cronológico**; el servidor verifica el rostro en ese momento y registra la marcación con `sin_conexion = true`. La selfie se borra del celular en cuanto el servidor la procesa (también está declarada en el consentimiento) y la app no entra en la copia de seguridad automática de Android.
  - **Hora:** en estas marcaciones `fecha_hora` es la hora del celular, validada por el servidor: no puede ser futura (tolerancia de 5 min), no puede tener más antigüedad que `max_horas_sin_conexion` (48 h por omisión, editable en el panel) ni ser anterior a otra marcación ya registrada. Si no cumple, el servidor la rechaza (`hora_invalida`, `marcacion_expirada` o `fuera_de_orden`) y la persona debe justificar desde Avisos. `created_at` guarda cuándo llegó al servidor, así la diferencia entre ambas horas queda como evidencia.
  - **Rostro:** si la verificación **falla** al sincronizar, la marcación se registra igual como `fallida` y se crea una anomalía `verificacion_fallida` ligada a ella (en línea, en cambio, una verificación fallida no registra nada y permite reintentar). Si el servidor no pudo verificar por un problema técnico, queda `pendiente`.
  - **Ausencias ya anotadas:** si el proceso periódico ya había creado una anomalía de ausencia para ese día, al llegar la marcación se le añade una nota en el detalle («llegó una marcación hecha sin conexión»); no se cierra sola, la revisa el Administrador.
  - **Limitaciones declaradas:** sin internet el servidor no controla el reloj del celular, por lo que alguien podría cambiarlo para marcar a otra hora. Lo limitan los topes de arriba, la marca «Sin conexión» visible en el panel y en el historial, la comparación `fecha_hora` / `created_at` y la revisión humana. Si dos personas comparten un celular, la cola de cada una se guarda por separado y no se mezcla. El envío en segundo plano (con la app cerrada) no está implementado: la app envía al abrirse, al volver la señal y cada minuto mientras está abierta.
- El Administrador puede resetear el rostro (cambio de apariencia, error de registro) con `resetear_rostro()`: se borra el rostro cifrado y se retira el consentimiento, y el Usuario lo vuelve a registrar aceptando un consentimiento nuevo. Un usuario que ya tiene rostro no puede registrar otro sin que antes se resetee.
- Al **desactivar** a un usuario, su rostro y su consentimiento se borran automáticamente (la base de datos lo hace con un trigger). Si se reactiva, debe registrarse de nuevo.

### 2.1.1 Las cuatro marcaciones del día y el almuerzo
- Cada jornada tiene **cuatro marcaciones**, en este orden: `ingreso` → `salida_almuerzo` → `entrada_almuerzo` → `salida`. Las cuatro pasan por las mismas validaciones: rostro, detección de vida, zona (bloque o sede) y duplicidad.
- **Secuencia:** el microservicio solo acepta la marcación que corresponde según la última del día (por ejemplo, no se puede registrar `entrada_almuerzo` sin haber marcado antes `salida_almuerzo`). Una marcación fuera de secuencia o repetida se trata como `duplicada`.
- **Duración del almuerzo:** es el tiempo entre `salida_almuerzo` y `entrada_almuerzo`. El máximo lo define el Administrador en Configuración (`configuracion.almuerzo_max_min`, 60 minutos por defecto, entre 15 y 180).
- **Anomalías del almuerzo:** `almuerzo_excedido` si el regreso se marca después del máximo (más la tolerancia de puntualidad) y `sin_regreso_almuerzo` si hay `salida_almuerzo` pero no `entrada_almuerzo` al terminar la jornada. Se justifican y se revisan igual que las demás.
- La anomalía `sin_salida` (falta la `salida` final) sigue funcionando como antes.

### 2.2 Marcación web de contingencia
- Exige elegir un motivo: celular perdido, robado, olvidado, dañado, sin batería u otro. Sin motivo no se registra.
- Queda con `origen = 'web'`, visible en el historial y en el panel del Administrador.
- Pasa por las mismas validaciones que la app: rostro, detección de vida y zona de marcación (la ubicación viene del navegador).
- No hay modo offline ni vinculación de dispositivo en la web.
- **Uso recurrente:** si un Usuario marca por web de forma repetida, el sistema genera la anomalía `uso_recurrente_web` para revisión humana, de modo que la contingencia no se use como atajo. El umbral exacto de "recurrente" se define al implementar (propuesta: más de 3 veces en 30 días) y debe calibrarse.

### 2.3 Reglas de detección de anomalías
- La detección se hace con **reglas deterministas escritas en código** (Python, en el microservicio). **No se entrena ningún modelo**: cada anomalía se puede explicar con "se marcó porque pasó esto". Cada regla compara datos que ya están en Supabase con límites que el Administrador puede ajustar en Configuración (tabla `configuracion`), con la jornada del usuario y con los radios de los bloques.
- Al detectar una anomalía se guarda con `detector = 'regla'`, junto con los datos de la regla (qué valor se midió y cuál era el límite) en la columna `detalle`; el aviso que redacte la IA va aparte, en `descripcion_ia`, y nunca reemplaza al `detalle`. Con esos datos, OpenAI solo **redacta el aviso**; no decide.

| Anomalía | Cuándo se revisa | Condición |
|---|---|---|
| `fuera_geocerca` | al marcar | la ubicación está fuera del radio de los bloques de su sede (o de la sede, si no tiene bloques) |
| `ubicacion_simulada` | al marcar | la app informa que Android detectó una ubicación simulada (GPS falso): la marcación **no se registra** y queda solo esta anomalía, sin marcación |
| `duplicada` | al marcar | esa marcación ya existe hoy o está fuera de la secuencia del día |
| `verificacion_fallida` | al marcar | el rostro no coincide o no es una cara real |
| `fuera_horario` | al marcar | ingreso después de `jornada_inicio` + `tolerancia_min`, o salida antes de `jornada_fin` − `tolerancia_min` (no se evalúa en un día no laborable) |
| `dia_no_laborable` | al marcar | marcó en un feriado activo o en un día de la semana que no está en sus `dias_laborables` |
| `almuerzo_excedido` | al marcar el regreso | el tiempo entre `salida_almuerzo` y `entrada_almuerzo` supera `almuerzo_max_min` + `tolerancia_min` |
| `desplazamiento_inusual` | al marcar | la velocidad entre dos marcaciones consecutivas (distancia ÷ tiempo) supera `velocidad_max_kmh` (120 por defecto) |
| `uso_recurrente_web` | al marcar por web | más de `max_marcaciones_web_30d` marcaciones web (3 por defecto) en los últimos 30 días |
| `sin_ingreso` | proceso periódico | día laborable (no feriado) sin ninguna marcación, pasada la jornada más la gracia |
| `sin_salida` | proceso periódico | terminó la jornada y no hay marcación de `salida` |
| `sin_regreso_almuerzo` | proceso periódico | hay `salida_almuerzo` y no `entrada_almuerzo` al terminar la jornada |

- **Proceso periódico:** `POST /procesos/ausencias` (cabecera `X-Proceso-Secreto`) revisa, por persona activa con sede, los últimos `AUSENCIAS_DIAS_ATRAS` días cuya jornada terminó hace más de `AUSENCIAS_GRACIA_MIN` minutos. Salta feriados, días no laborables y el día en que se creó la cuenta o antes. Cada jornada genera como mucho una anomalía (`sin_ingreso`, `sin_regreso_almuerzo` o `sin_salida`) y queda ligada a la última marcación del día; `anomalias.fecha_jornada` con un índice único impide duplicados aunque el proceso corra dos veces. Al final llama a `marcar_sin_justificar()`, así que no hace falta `pg_cron`. Se programa con `.github/workflows/ausencias.yml` (cada 30 min).
- **Hora de la marcación:** con conexión, siempre la del servidor; la hora que envíe el celular se ignora (atrasar el reloj del teléfono no sirve para parecer puntual). Solo las marcaciones hechas **sin conexión** usan la hora del celular, con las validaciones descritas en §2.1.
- **Límites configurables:** `tolerancia_min`, `almuerzo_max_min`, `velocidad_max_kmh`, `max_marcaciones_web_30d` y `max_horas_sin_conexion` (editables desde el panel).
- **Trabajo futuro:** un modelo de aprendizaje automático (por ejemplo Isolation Forest) para patrones que las reglas no ven, cuando haya historial suficiente. La columna `detector` ya admite el valor `modelo` para ese caso.

## 3. Estados de una anomalía (máquina de estados)

| Estado | Qué significa | Quién/qué lo dispara |
|---|---|---|
| `pendiente` | Se detectó la anomalía, esperando que el Usuario la justifique | El microservicio, al detectarla (una regla) |
| `en_revision` | El Usuario ya justificó, o la IA la marcó de alto riesgo | El chat de justificación, o la clasificación de la IA |
| `sin_justificar` | Venció el plazo y el Usuario no respondió | Automático (`marcar_sin_justificar()`, llamada por el proceso periódico) |
| `justificada` | Se aceptó la explicación | La IA (auto-aprobación, ver regla 5) o el Administrador |
| `rechazada` | Se determinó que no es válida | Solo el Administrador (comentario obligatorio) |

`sin_justificar` y `rechazada` **siempre** terminan en la bandeja del Administrador — nunca se cierran solas. Un caso `sin_justificar` también lo resuelve el Administrador (aprobar o rechazar) mediante `decidir_anomalia()`. Si **escala**, el caso se queda en `en_revision` hasta que jefatura decida.

**Plazos (en `configuracion`, editables desde el panel):** `plazo_justificacion_h` (48 h por defecto) es el tiempo que tiene el Usuario para justificar; `plazo_revision_h` (48 h por defecto) es el tiempo objetivo que tiene el Administrador para resolver un caso en revisión. Son dos plazos distintos.

## 4. Cuándo sí se puede justificar, cuándo no

**Se puede justificar cuando:**
- La anomalía es propia (el `usuario_id` coincide con el que inició sesión).
- El estado es `pendiente`.
- Está dentro del plazo definido (propuesta: 48 horas desde que se generó la alerta — ajustable).

**No se puede justificar cuando:**
- La anomalía es de otro usuario (bloqueado por RLS, ni siquiera llega a mostrarse).
- El estado ya es `justificada`, `rechazada` o `sin_justificar` — el chat no se reabre; si el Usuario quiere aclarar algo después, es un caso para hablar directo con Talento Humano, fuera del sistema.
- Venció el plazo — pasa automáticamente a `sin_justificar` y ya no hay botón de "Explicar" en la app, solo se ve el estado.

**Cómo se aplica:** la app llama a `POST /anomalias/{id}/justificacion` y el microservicio ejecuta la función `justificar_anomalia()` de la base, que en una sola transacción comprueba las tres condiciones (dueño, estado `pendiente`, plazo y largo del texto de 10 a 1000 caracteres), crea la justificación, guarda el mensaje de la persona en `mensajes_chat` y pasa la anomalía a `en_revision`. Bloquea la fila, así que dos envíos a la vez no pueden justificarla dos veces. Una anomalía ajena se responde como «no encontrada». Mientras no esté la clasificación por IA, toda justificación queda en `en_revision` para el Administrador.

## 5. Clasificación de la IA y quién decide al final

La IA clasifica, pero **nunca decide sola un caso de riesgo alto** — esa es la regla central para que quede claro en la sustentación que hay control humano.

| Clasificación IA | Regla |
|---|---|
| `aceptable` + score de anomalía bajo | Se puede **auto-aprobar** → pasa directo a `justificada`, sin esperar al Administrador |
| `aceptable` + score de anomalía alto | Igual pasa a `en_revision` — el Administrador decide, aunque la IA la considere razonable |
| `requiere_revision` | Siempre a `en_revision`, en la bandeja del Administrador |
| `sospechosa` | Siempre a `en_revision`, marcada con prioridad alta |

Una aprobación automática queda registrada en `justificaciones` con `decision_final = 'aprobada'` y `revisado_por` vacío (así se distingue de una aprobación humana). El umbral de "score bajo" es fijo en el servidor, no se edita desde el panel.

**Cómo se aplica (`app/chat_ia.py`):** solo se aprueban solas las faltas `fuera_horario`, `almuerzo_excedido`, `sin_regreso_almuerzo` y `sin_salida`, con clasificación `aceptable`, confianza ≥ 0.9 (`IA_UMBRAL_AUTOAPROBAR`) y sin temas ajenos en la conversación. Una marcación fuera de zona, un desplazamiento inusual, un rostro que no coincidió o un día no laborable **siempre** los revisa una persona. La aprobación automática queda en la bitácora (sin usuario) y `revisado_por` vacío. `IA_AUTOAPROBAR=false` la apaga.

Esto evita el escenario incómodo de "la IA aprobó una falta grave sola" — el único camino de auto-aprobación es el de menor riesgo posible.

## 6. Qué puede y qué no puede hacer la IA

**Puede:**
- **Nunca detecta anomalías ella misma:** la detección la hacen **reglas escritas en código** (ver 2.3). La IA solo interviene después, para explicar y conversar.
- Redactar la notificación de la anomalía en lenguaje natural.
- Sostener la conversación de justificación (hacer una pregunta de seguimiento si la respuesta es ambigua).
- Clasificar la respuesta en `aceptable` / `requiere_revision` / `sospechosa`.
- Generar el resumen que ve el Administrador.
- Redactar un resumen ejecutivo en lenguaje natural para un periodo completo (módulo Reportes), a partir de datos ya agregados — un solo llamado por reporte, no uno por anomalía.

**Límites del chat (se hacen cumplir en el servidor, no solo en el texto del modelo):**
- Solo habla de la anomalía del caso (qué pasó, dónde estaba, respaldo, plazo y proceso). Cualquier otro tema recibe un aviso fijo («Solo puedo ayudarte con la justificación de esta anomalía…»); dos avisos seguidos cierran el chat y el caso pasa a revisión.
- No promete aprobar ni rechazar, no da consejos legales y ignora instrucciones escritas por la persona («ignora lo anterior», «apruébame»).
- Máximo **3 mensajes de la persona** por caso y **una sola pregunta** de seguimiento; respuestas de hasta 2 frases.
- Solo recibe el texto del caso (tipo, detalle y fecha) y la conversación: nunca fotos, datos faciales, correo ni nombre completo.
- Si la IA falla o no hay llave, el caso pasa a revisión humana sin clasificar: nunca bloquea una justificación.

**No puede:**
- Tomar la decisión final de un caso de riesgo (regla 5).
- Editar o borrar una marcación — solo lee.
- Ver datos de otros usuarios al analizar una anomalía (solo el historial del mismo usuario que la generó).
- Aceptar o rechazar una identidad por su cuenta: la verificación de rostro es una comparación matemática con umbral; un fallo genera una anomalía para revisión humana, no una sanción.
- Decidir si algo es o no una anomalía: eso lo hacen las reglas deterministas, no el modelo de lenguaje.

## 7. Integridad de los datos

- Una marcación, una vez registrada en Supabase, **es inmutable** — nadie la edita o borra; un trigger de la base de datos lo impide. La única actualización permitida es el resultado de la verificación facial (para la verificación diferida). Es la base de la auditoría.
- Usuarios, sedes y bloques **se desactivan, no se borran**.
- Datos biométricos: solo se guardan los vectores, **cifrados** (AES-256-GCM) en una tabla aparte y con consentimiento fechado; la imagen no se almacena. Se borran al desactivar al usuario o al resetear su rostro.
- Las anomalías las genera siempre el sistema, nunca se crean manualmente.
- Cada anomalía tiene una sola justificación activa (puede tener varios mensajes dentro del chat, pero un solo resultado final).

### 7.1 Auditoría
- **Columnas de auditoría** en las tablas que el Administrador edita (`sedes`, `bloques`, `usuarios`, `configuracion`): `created_at`, `created_by`, `updated_at`, `updated_by`. Las rellena la base de datos, no la aplicación, así no se pueden omitir ni falsificar desde el cliente. Si escribe el microservicio (sin sesión de usuario), debe enviar `updated_by` siempre de forma explícita: el id del administrador que hizo el cambio o vacío si lo hizo el sistema.
- **Bitácora** (`bitacora`): registra cada cambio del Administrador con quién, cuándo, sobre qué registro, qué campo, valor anterior y valor nuevo. Eventos: crear, actualizar, activar, desactivar, registrar rostro, resetear rostro, resetear dispositivo y decidir caso (con su comentario).
- La bitácora **no se edita ni se borra** (lo impide la base de datos) y solo la lee el Administrador.
- Por privacidad, la bitácora registra *que* se registró o reseteó un rostro (con su fecha), pero los datos del rostro nunca pasan por ella; tampoco guarda el `push_token`.
- Las marcaciones, los mensajes del chat y la propia bitácora no llevan `updated_*` porque son inmutables; basta con `created_at`. `rostros` tampoco: nunca se edita, se elimina y se vuelve a crear.

## 8. Módulo de Usuarios

**Contiene:**
- Lista de usuarios: nombres y apellidos, email, rol, sede asignada, estado (activo/inactivo), estado de vinculación de dispositivo, estado del rostro (registrado / sin registrar).
- Alta de usuario nuevo: nombres, apellidos, email, rol (Usuario o Administrador), sede, jornada y días laborables — **sin contraseña**: el sistema crea la cuenta en Supabase Auth y envía una invitación al correo; el usuario crea su propia contraseña.
- Reenviar invitación (si venció o no llegó; solo mientras la persona no haya aceptado).
- Restablecer contraseña (solo si la persona ya activó su cuenta).
- Edición: **cambiar el horario (jornada y días laborables)**, cambiar sede asignada, cambiar rol, **corregir nombres y apellidos**, **cambiar el correo** (es el usuario de acceso: se cambia a la vez en Supabase Auth y en `usuarios`; si falla uno se revierte el otro; si la persona aún no aceptó la invitación se le envía una nueva al correo nuevo; el Administrador no puede cambiar su propio correo ni su propio rol), resetear vinculación de dispositivo (para cuando el usuario cambia de celular) y **resetear rostro** (botón «Resetear rostro» en Editar: llama a `resetear_rostro()`; la persona debe registrarlo de nuevo con un consentimiento nuevo).
- Baja: se **desactiva**, no se elimina — su historial de marcaciones y anomalías debe quedar intacto para la auditoría (misma regla de integridad de la sección 7).

**Qué hace (flujo):** el Administrador da de alta a un colaborador → el sistema crea su cuenta con sede/rol asignados y le envía un correo de invitación → el colaborador abre el enlace y **crea su propia contraseña** (el Administrador nunca la conoce) → hace login, vincula su dispositivo y **registra su rostro con consentimiento** desde la app (pantalla M1 y registro facial). Si olvida la contraseña, usa «Olvidé mi contraseña» en el login y recibe un enlace por correo, sin intervención del Administrador. Si cambia de celular, el Administrador resetea `dispositivo_id` para permitir una nueva vinculación. Si deja la universidad, se desactiva su cuenta — deja de poder marcar asistencia, pero su historial sigue visible en Reportes.

**Regla:** siempre debe existir al menos un Administrador activo; el sistema no debería permitir desactivar al último que queda.

**Contraseñas y acceso:** no hay registro público; solo entra quien fue invitado. La contraseña tiene mínimo 8 caracteres con letras y números. Al desactivar a un usuario se bloquea además su inicio de sesión. Detalle técnico en `plan-tecnico-arquitectura.md`, sección 3.3.1.

### 8.1 Horario laboral y feriados

- **Días laborables por persona:** `usuarios.dias_laborables` (1 = lunes … 7 = domingo). Por defecto, de lunes a viernes; el Administrador lo cambia al dar de alta o desde Usuarios → editar horario. Quien trabaja de lunes a jueves, o incluye el sábado, se configura aquí.
- **Feriados:** tabla `feriados` (`fecha_inicio`, `fecha_fin`, nombre, activo), para toda la institución. Un feriado es **un solo registro** aunque dure varios días (p. ej. Carnaval del 8 al 9 de febrero); si dura un día, inicio y fin son iguales. Duración máxima: 31 días seguidos. Dos feriados **activos** no pueden cruzarse (lo impide la base de datos); uno desactivado no bloquea. El Administrador los crea, edita y desactiva desde la pantalla Feriados; no se borran. Para que un puente se trabaje, se recorta el feriado o se crea uno por separado.
- **Qué pasa al marcar en un día no laborable (fin de semana que no trabaja, o feriado):** la marcación **se registra** y genera la anomalía `dia_no_laborable` (el Usuario la justifica y el Administrador la revisa, como cualquier otra). Ese día **no** se evalúa `fuera_horario`, para no duplicar el aviso. El día se cuenta en hora de Ecuador continental (UTC-5).
- **Límites declarados:** hoy una persona tiene **una sola jornada** (la misma hora de entrada y salida en todos sus días laborables). Quedan fuera los **turnos rotativos**, los **horarios distintos por día**, las **vacaciones** y los **permisos**: en producción se tomarán de las tablas reales de la institución (talento humano) en lugar de capturarse aquí; mientras tanto se cubren con los días laborables y con el flujo de justificación. La **ausencia total** (no marcó nada en un día laborable) la detecta el proceso periódico (`sin_ingreso`); se calcula con la jornada vigente, aunque haya cambiado en los días revisados.

## 9. Módulo de Sedes y Bloques

Una **sede** es un campus o extensión (por ejemplo, la matriz de Milagro, Santo Domingo, Quito o Guayaquil). Un **bloque** es un edificio dentro de una sede (por ejemplo, los bloques M, P y V de la matriz). Los bloques se registran por sede: el bloque M de Milagro y el bloque M de Quito son registros distintos.

**Contiene:**
- Lista de sedes: nombre, coordenadas (lat/long), radio en metros (entre 50 y 1000, cubre todo el campus), estado y si permite marcar fuera de la zona (`permite_fuera_geocerca`).
- Lista de bloques de cada sede: nombre, coordenadas, radio en metros (entre 20 y 200) y estado (activo/inactivo). El nombre del bloque no se repite dentro de la misma sede.
- Alta/edición de sede y de bloque: el Administrador elige el punto **buscando el lugar por nombre** (por ejemplo «universidad»: sugiere las de Ecuador, con Photon sobre datos de OpenStreetMap; solo se envía el texto buscado), **haciendo clic en el mapa o escribiendo la latitud y longitud** (las tres formas se sincronizan), y ajusta el radio con un control deslizante; el mapa dibuja el círculo. Se usa Leaflet con OpenStreetMap (gratis, sin API key).
- No se elimina una sede ni un bloque con usuarios o marcaciones asociadas — se desactivan, misma lógica que en Usuarios.
- **Reglas al desactivar:** una sede no se puede desactivar mientras tenga usuarios activos asignados (hay que cambiarlos de sede o desactivarlos antes); no se agregan bloques a una sede inactiva, ni se activa un bloque de una sede inactiva. Si se desactiva el último bloque activo de una sede, el sistema avisa que desde ese momento se valida contra el círculo completo de la sede. Un bloque no cambia de sede.
- **Avisos al dibujar un bloque (no bloquean):** si su centro queda fuera del círculo de la sede, y si se traslapa con otro bloque activo de la misma sede (en esa franja no se puede saber en cuál se marcó).

**Qué hace (flujo):** el Administrador crea o ajusta una sede y sus bloques → esos datos alimentan la validación de la zona. El microservicio calcula la distancia entre la ubicación de quien marca y el centro de cada bloque activo de su sede: si está dentro del radio de alguno, la marcación es válida y queda registrada con ese bloque; si la sede no tiene bloques registrados, se valida contra el círculo de la sede. La app móvil hace una primera comprobación local (`expo-location`) solo para guiar al usuario; la validación que cuenta es la del servidor, tanto para la app como para la web. Cualquier cambio aquí afecta de inmediato a todos los usuarios de esa sede, sin actualizar la app.

**Límite que debe quedar declarado:** el sistema solo conoce un punto y un radio, no la forma del edificio. El GPS tiene un error de 5 a 20 metros (peor dentro de edificios), y el círculo es un poco más grande que el edificio a propósito (radio ≈ la mitad de su dimensión más larga + 15 a 20 m de margen), así que también puede marcar quien esté pegado al bloque. Si los bloques están muy juntos, los círculos se traslapan y no se puede garantizar en cuál edificio exacto se estuvo: es una **zona aproximada**, no un control por edificio. Mejora futura: dibujar el contorno real de cada bloque como polígono (con PostGIS).

**Marcar fuera de la zona (definido):** la marcación **sí se registra** (sin `bloque_id`) y se genera la anomalía `fuera_geocerca` para que el Usuario la justifique y el Administrador la revise. Si la sede tiene `permite_fuera_geocerca` activo, se registra igual pero **no** se genera anomalía. La precisión del GPS no se descuenta del radio: la tolerancia ya está en el margen del círculo (ver el límite declarado arriba).

**Qué se registra y qué no al marcar:** una marcación con rostro no verificado o fuera de secuencia **no se registra** (queda solo la anomalía `verificacion_fallida` o `duplicada`, sin `marcacion_id`); todas las demás anomalías (zona, horario, almuerzo, desplazamiento, uso web) se guardan junto con la marcación. Reintentar la misma marcación (mismo `id`) devuelve la ya registrada y no crea nada nuevo.

## 10. Módulo de Reportes

Distinto del Dashboard: el Dashboard muestra el estado *actual* (últimos 7 días, solo pendientes en la tabla); Reportes arma un corte histórico completo de un periodo elegido.

- **Filtros:** periodo (semana/mes/rango personalizado) y sede — mismos filtros que el Dashboard.
- **Resumen ejecutivo:** párrafo generado por IA a partir de los datos ya agregados del periodo (un solo llamado a OpenAI por reporte).
- **Tabla histórica completa:** todos los estados de anomalía del periodo (`justificada`, `rechazada`, `sin_justificar`, `en_revision`), no solo las pendientes.
- **Exportar:** genera PDF o CSV descargable con el resumen y la tabla, para archivo o para compartir fuera del sistema.

## 11. Checklist para empezar a desarrollar

- [ ] Ejecutar `supabase/migrations/0001_init.sql` y crear el primer Administrador a mano (ver `pasos-manuales.md`).
- [ ] Verificar las políticas RLS: lectura propia/admin en las cuatro tablas de datos y ninguna política de escritura de clientes sobre ellas.
- [x] Programar `marcar_sin_justificar()`: lo hace `POST /procesos/ausencias` (sin `pg_cron`). Falta definir `PROCESOS_SECRETO` y los secretos del workflow en producción.
- [x] Endpoint de marcación en el microservicio (`POST /marcaciones`): sesión, secuencia del día, zona (bloques de la sede o, si no hay, la sede), horario, almuerzo, desplazamiento, uso web, reintento por `id` y `bloque_id`.
- [x] Verificación facial **real** en la marcación (`app/verificacion.py`): comparación con los vectores de `rostros` (similitud coseno; umbral y límites de calidad editables en Configuración → Reconocimiento facial). Las marcaciones guardadas antes de este cambio son de prueba.
- [x] **Detección de vida pasiva** en el servidor (registro y marcación): rechaza fotos de pantalla o impresas; no es infalible (limitación declarada).
- [ ] Calibrar la probabilidad mínima de rostro real (panel, `vida_umbral`) con selfies reales (falsos rechazos de personas en persona vs. fotos de pantalla que pasan).
- [ ] Detección de vida **activa** (parpadeo o giro guiado): segunda etapa; requiere build de desarrollo de la app, no Expo Go.
- [ ] Calibrar el umbral de similitud (panel, `rostro_umbral`) con fotos reales de celulares (varias personas, días y luz) y medir la memoria en Render.
- [x] Marcación **sin conexión** (app Android): cola local en SQLite, envío en orden al volver la señal, verificación diferida en el servidor, `sin_conexion` y `max_horas_sin_conexion` (migración 0010). Pruebas automáticas hechas; falta probarla en un celular real.
- [ ] Envío de marcaciones pendientes **en segundo plano** (con la app cerrada): requiere `expo-background-task` y una build de desarrollo / APK, no Expo Go.
- [x] Endpoint de registro de rostro (`POST /rostro/registro`, con consentimiento y 3 fotos guiadas en la app): cifra los vectores con AES-256-GCM y los guarda con `registrar_rostro()`. El reseteo desde el panel usa `resetear_rostro()`.
- [ ] Generar la clave de cifrado (`ROSTRO_CLAVE_AES`; en local la genera `levantar.ps1`), guardarla solo como variable de entorno en Render y respaldarla aparte.
- [ ] Probar que la app y el panel (también con la cuenta de Administrador) **no pueden leer** la tabla `rostros`.
- [x] Pantalla de sedes y bloques con mapa (clic en el mapa + coordenadas + radio).
- [x] Horario por persona (días laborables y jornada) y pantalla de Feriados; anomalía `dia_no_laborable`.
- [x] Proceso periódico de ausencias (`sin_ingreso`, `sin_salida`, `sin_regreso_almuerzo`): `POST /procesos/ausencias`.
- [ ] **Probar de punta a punta el proceso de ausencias** (PRUEBA-LOCAL.md §8.5): preparar una cuenta de prueba creada antes de hoy y comprobar `sin_ingreso`, `sin_salida` y `sin_regreso_almuerzo`, que repetir no duplica, y el workflow `ausencias.yml` en GitHub.
- [ ] **Probar el cambio de correo** de un usuario desde el panel (Editar → correo): en Supabase Auth y en `usuarios`, y la invitación nueva si aún no la aceptó.
- [ ] Conectar turnos rotativos, vacaciones y permisos a las tablas reales de la institución (hoy fuera de alcance).
- [ ] Pantalla de Auditoría (bitácora, solo lectura).
- [ ] Dejar la regla de auto-aprobación (sección 5) como función aislada: el umbral de "score bajo" se calibrará varias veces.
- [x] Bloquear en el backend (no solo en el frontend) justificar una anomalía ajena o fuera de plazo: lo hace `justificar_anomalia()` en la base (y el endpoint la traduce a 404/409).
- [x] App móvil según el mockup: pestañas Inicio, Historial, Avisos y Perfil; justificación como chat (`GET /anomalias`, `GET /anomalias/{id}`, `POST /anomalias/{id}/justificacion`); flujo de marcación M3 (`GET /marcaciones/zona`, `GET /marcaciones/historial`, `/marcaciones/hoy` con `ultima` y `jornada`).
- [ ] **Probar en el celular** las pantallas nuevas (Inicio, Historial, Avisos, chat y marcación) y la justificación (PRUEBA-LOCAL.md, pruebas 1 a 13).
- [x] Chat con IA para la justificación (pregunta de seguimiento, clasificación `aceptable` / `requiere_revision` / `sospechosa`, resumen para el Administrador y auto-aprobación de menor riesgo, sección 5): `app/ia.py`, `app/chat_ia.py`, migración `0004_chat_ia.sql`. Proveedor a elección (`IA_PROVEEDOR`: `gemini` o `anthropic`). Falta definir la llave en el `.env` y probarlo con casos reales.
- [ ] Calibrar con casos reales: `IA_UMBRAL_AUTOAPROBAR` (0.9 por defecto), la lista `TIPOS_AUTOAPROBABLES` (`chat_ia.py`) y las instrucciones del asistente (`app/ia.py`). Idea pendiente: dar a la IA el historial de 90 días de la misma persona y tipo (hoy no se usa).
- [x] Panel del Administrador (`/admin/anomalias`): bandeja con filtros (por resolver, esperando a la persona, resueltas, todas), búsqueda y tipo; detalle del caso con registro original (mapa, sede, origen, verificación facial), historial, justificación de la persona y decisión Aprobar / Rechazar / Escalar con confirmación, vía `decidir_anomalia()`. El resumen de la IA aparece solo cuando exista (`justificaciones.resumen_ia`).
- [x] `decidir_anomalia()` rechaza a quien no es administrador (probado en la base: «Solo un administrador puede decidir un caso»); el panel exige comentario al rechazar y la base lo refuerza con `rechazo_con_comentario`.
- [ ] Probar en el panel, con un caso real en revisión, aprobar / rechazar / escalar y ver el cambio en la app del usuario.
- [ ] Guardar quién tomó cada `decision_final` y cuándo (`revisado_por`, `fecha_decision`) y que aparezca en la bitácora, para mostrar la trazabilidad en la sustentación.
- [ ] Impedir desactivar al último Administrador activo.
