# Prompt para Claude Design — ajustes del mockup (adjuntar el HTML "Asistencia Universitaria 4.0 Completo")

Actualiza el mockup adjunto del sistema "Asistencia Universitaria". **Mantén exactamente el mismo sistema visual** (colores, tipografía, componentes, marcos de teléfono y navegador, formato de tarjetas con ID + título + descripción de navegación) y la misma numeración de pantallas. Entrégame **solo las pantallas nuevas y las modificadas**, indicando en cada una su ID y desde dónde se abre y a dónde lleva. Las pantallas web de usuario (U) se muestran en los 3 tamaños (≥1200 px, 768–1199 px, <768 px) como en el mockup actual.

**Reglas generales:** no inventes datos ni funciones que no estén descritos aquí. No existe ningún sistema externo de autorizaciones de traslado, no existe el rol "jefatura" y no hay administradores por sede: **el Administrador (Talento Humano) ve todas las sedes**. Solo hay dos roles: Usuario y Administrador.

---

## A. Pantallas NUEVAS

### App móvil — registro del rostro (primer ingreso)
Flujo: M1 → **M1.1 → M1.2 → M1.3** → M2. Se muestra después de «Ingresar y vincular», solo la primera vez (o cuando el Administrador reseteó el rostro).

- **M1.1 Consentimiento biométrico.** Título «Registro de tu rostro». Explica en lenguaje simple: se usa tu rostro para confirmar tu identidad al marcar; **se guarda solo una representación matemática, nunca tu foto**; puedes pedir su eliminación a Talento Humano; el tratamiento cumple la Ley Orgánica de Protección de Datos Personales del Ecuador. Casilla «Acepto el tratamiento de mi dato biométrico» (el botón «Continuar» queda deshabilitado hasta marcarla) y enlace «Leer el aviso completo».
- **M1.2 Captura guiada del rostro.** Cámara frontal con óvalo guía y una barra de progreso de 3 a 5 pasos (por ejemplo «1 de 5»). Cada paso muestra una instrucción: «Mira al frente», «Gira ligeramente a la izquierda», «Gira ligeramente a la derecha» y, opcionalmente, «Levanta un poco el mentón» y «Baja un poco el mentón». Consejos (buena luz, sin gafas oscuras/gorra/mascarilla, una sola persona en cámara) y un aviso de calidad en vivo («Falta luz», «Acércate un poco», «Se detectó más de un rostro»). Botón de captura por paso. Estado de análisis breve al terminar.
- **M1.2.1 No se pudo registrar.** Variante de error, para cuando el sistema detecta que no es una persona real frente a la cámara (por ejemplo, una foto o una pantalla) o que la imagen no tiene calidad: «No pudimos confirmar que eres tú en persona. Intenta de nuevo con buena luz y mirando a la cámara». Botón «Reintentar» → M1.2.
- **M1.3 Rostro registrado.** Confirmación de éxito y botón «Ir al inicio» → M2.

### Web de usuario — contingencia
La web de usuario es el canal para cuando el celular se pierde, lo roban, se olvida, se daña o no tiene batería.

- **U2.2 Motivo de la marcación web** (modal en desktop/tablet, hoja inferior en móvil). Se abre al presionar «Registrar asistencia» en U2 → continúa a U3. Título «¿Por qué marcas desde la web?». Lista de opciones (una sola): *Celular perdido · Celular robado · Celular olvidado · Celular dañado · Sin batería · Otro*. Botón «Continuar» deshabilitado hasta elegir. Nota: «Este canal es de contingencia; tu marcación quedará identificada como web».
- **U2.3 Inicio · rostro no registrado.** Igual que U2, pero con aviso «Aún no registraste tu rostro. Regístralo primero desde la app para poder marcar» y «Registrar asistencia» deshabilitado.

### Panel del Administrador — Configuración
- **Menú lateral (en TODAS las pantallas del panel):** Dashboard, Anomalías, Usuarios, **Sedes** (antes «Geocercas»), Reportes, **Auditoría** (nuevo), **Configuración** (nuevo).
- **W7 Configuración.** Tres tarjetas:
  1. *Modelo de IA*: selector del modelo (por ejemplo gpt-4.1-mini, gpt-4.1, gpt-4o-mini). Texto de ayuda: «La clave de API se gestiona de forma segura en el servidor y no se muestra aquí».
  2. *Reglas de detección*: **elimina la tarjeta «Sensibilidad del modelo»** (ya no se entrena ningún modelo; la detección es por reglas). En su lugar, campos numéricos: «Velocidad máxima entre marcaciones» (km/h, 120 por defecto) y «Máximo de marcaciones web en 30 días» (3 por defecto).
  3. *Plazos y tolerancia*: «Plazo para que el usuario justifique» (horas, 48 por defecto), «Plazo objetivo de revisión del Administrador» (horas, 48 por defecto), «Tolerancia de puntualidad» (minutos, 10 por defecto), «Duración máxima del almuerzo» (minutos, 60 por defecto, entre 15 y 180).
  Botones «Restablecer» y «Guardar cambios».
- **W7.1 Confirmar cambio de modelo de IA** (diálogo): «¿Cambiar el modelo a …? Se aplicará a las nuevas conversaciones y resúmenes».

### Panel del Administrador — Bloques de cada sede
Una **sede** es un campus o extensión (Matriz Milagro, Santo Domingo, Quito, Guayaquil…). Un **bloque** es un edificio dentro de una sede (Bloque M, Bloque P, Bloque V…). Los bloques se registran **por sede**: el bloque M de Milagro y el bloque M de Quito son registros distintos.

- **W5.4 Bloques de una sede.** Se abre desde W5 al elegir una sede (botón «Ver bloques» o clic en la fila). Título «Bloques · Matriz Milagro». A la izquierda, tabla de bloques: Nombre, Latitud, Longitud, Radio (m), Estado (Activo/Inactivo), Acciones (editar, desactivar/activar). A la derecha, un mapa con la sede (círculo grande) y sus bloques (círculos pequeños con su nombre). Botón «Nuevo bloque» → W5.5. Texto de ayuda: «Si una sede no tiene bloques, la marcación se valida contra el círculo de la sede».
- **W5.5 Nuevo / editar bloque** (modal grande con mapa). Campos: Nombre del bloque (ej. «Bloque M»), **Latitud** y **Longitud** (editables), y un **mapa**. El Administrador puede elegir el punto de **dos formas que se sincronizan**: haciendo clic o arrastrando el marcador en el mapa (los campos de latitud y longitud se llenan solos), o escribiendo las coordenadas (el marcador se mueve). **Radio** con un control deslizante (de 20 a 200 m) y el valor numérico; el mapa dibuja el círculo en tiempo real. Ayuda: «El radio debería ser la mitad de la dimensión más larga del edificio más unos 15–20 m de margen por el error del GPS». Mini aviso: «Los círculos de bloques contiguos pueden traslaparse: es una zona aproximada, no el contorno exacto del edificio». Botones «Guardar» / «Cancelar» → W5.4.
- **W5.6 Desactivar bloque** (diálogo): «¿Desactivar el Bloque M? Las nuevas marcaciones ya no se validarán contra este bloque. Las marcaciones anteriores se conservan».

### Panel del Administrador — Auditoría
- **W8 Auditoría** (solo lectura, sin ninguna acción de edición). Título «Auditoría», subtítulo «Registro inmutable de los cambios en el sistema». Filtros: Periodo, Evento (Crear, Actualizar, Activar, Desactivar, Registrar rostro, Resetear rostro, Resetear dispositivo, Decidir caso), Entidad (Sedes, Bloques, Usuarios, Configuración, Anomalías) y «Realizado por» (nombre del Administrador o «Sistema»). Tabla con: Fecha y hora, Evento, Entidad, Registro afectado, Campo, Valor anterior, Valor nuevo, Realizado por, Motivo (por ejemplo el comentario de una decisión). Nota al pie: «La bitácora no se puede editar ni eliminar. Los datos del rostro nunca aparecen aquí: solo que se registró o se reseteó».

### Panel — nuevos diálogos y variantes
- **W3.3 Confirmar rechazo** (diálogo sobre W3). Pide un **comentario obligatorio** («Motivo del rechazo»); «Confirmar rechazo» deshabilitado si está vacío. El usuario será notificado y el caso pasa a Rechazada.
- **W3.4 Detalle · caso sin justificar.** Variante de W3 para un caso cuyo plazo venció sin respuesta: en lugar del resumen de la IA, muestra «El usuario no respondió dentro del plazo». Botones «Aprobar» y «Rechazar» (el comentario es obligatorio solo al rechazar).
- **W4.5 Resetear rostro** (diálogo desde la nueva acción en W4): «¿Resetear el rostro de Rocío Molina? Se eliminarán su rostro y su consentimiento biométrico. Deberá registrarlo nuevamente al ingresar a la app».

---

## B. Pantallas MODIFICADAS

- **M3.3 Verificación exitosa.** Dos variantes: (a) *con conexión*: «Identidad verificada por reconocimiento facial»; (b) *sin conexión*: «Marcación guardada · **verificación pendiente**» con el texto «Se verificará tu rostro y se sincronizará automáticamente al recuperar red». No digas "identidad verificada" en la variante sin conexión.
- **M4 Historial (app) y su equivalente web.** Además de SINCRONIZADO / PENDIENTE, las marcaciones hechas por web muestran una etiqueta «WEB» con el motivo (por ejemplo «WEB · Celular olvidado»).
- **U5 Asistencia registrada (web).** Agrega las filas «Origen: Navegador web (contingencia)» y «Motivo: Celular olvidado».
- **U2 / U2.1.** Agrega un aviso discreto: «Estás usando el canal web de contingencia».
- **W3 Detalle de anomalía.**
  - Agrega el botón **«Rechazar»** (estilo de peligro) junto a «Aprobar justificación» y «Escalar a jefatura» → este último pasa a llamarse **«Escalar»**. «Rechazar» → W3.3.
  - **Elimina** la línea «Autorización de traslado encontrada en el sistema (folio TR-0912)». En el resumen de la IA, la autorización debe aparecer como algo que **el usuario afirma**, no como algo verificado.
  - Cambia «La evidencia documental respalda la explicación del usuario» por «La explicación es coherente con el historial del usuario. La decisión final es de Talento Humano».
  - En «Registro original» agrega la fila «Origen: App / Web (motivo)».
  - El comentario sigue siendo opcional al aprobar y se vuelve obligatorio al rechazar.
- **W3.2 Confirmar escalamiento.** Texto: «El caso quedará marcado como escalado y permanecerá En revisión hasta que Talento Humano decida. El usuario será notificado». Quita toda mención a "jefatura de Campus Central".
- **W4 Usuarios.**
  - Agrega la columna **«Rostro»** con valores «Registrado» / «Sin registrar».
  - La columna «Dispositivo» solo tiene «Vinculado» y «Sin vincular» (elimina «Revocado»).
  - Todos los Administradores muestran «Todas las sedes» (incluida Daniela Cueva).
  - Agrega una acción nueva por fila para **resetear rostro** (junto a editar, resetear vinculación y desactivar) → W4.5.
- **W4.1 / W4.2.** Si el rol es Administrador, el campo «Sede asignada» queda deshabilitado con «Todas las sedes». En W4.1 agrega la nota: «El usuario registrará su rostro y aceptará el consentimiento al ingresar por primera vez».
- **W5 Sedes** (antes «Geocercas»). Quita la tarjeta de sensibilidad (ya no existe; ver W7). Renombra el título y los textos («Nueva geocerca» → «Nueva sede»). En la lista de sedes agrega la columna «Bloques» (cantidad) y la acción «Ver bloques» → W5.4. Los radios de sede son amplios (entre 50 y 1000 m) porque cubren todo el campus.
- **W5.1 Nueva sede y W5.2 Editar sede.** Agrega el mismo selector de punto que en W5.5: **clic o arrastre en el mapa y, a la vez, campos de latitud y longitud editables** (se sincronizan), y el radio con control deslizante que dibuja el círculo en el mapa.
- **W4.4 Desactivar usuario.** Agrega al texto: «Se eliminarán también su rostro y su consentimiento biométrico. Si se reactiva, deberá registrarlos de nuevo».
- **M2 / M3.x / U2 / U2.x (estado de ubicación).** Donde hoy dice «A 42 m del centro de la geocerca · radio 150 m», muestra la zona: **«Dentro de la zona · Bloque M»** (y la distancia al centro, p. ej. «a 42 m»). Cuando la ubicación está fuera: «Fuera de las zonas de tu sede. Acércate a un bloque de Campus Central» (en vez de «A 1.2 km del centro de la geocerca»). El mapa dibuja los círculos de los bloques de la sede del usuario, no un solo círculo. Si la sede no tiene bloques, se muestra el círculo de la sede.
- **W2 y W6 (tablas y filtros).** El filtro «Tipo» incluye: Desplazamiento inusual, Fuera de geocerca, Falta marcación de salida, Marcación fuera de horario, Marcación duplicada, **Verificación fallida** y **Uso recurrente de la web**. En W6, la fila A-2412 «Rechazada» muestra «Sin evidencia · M. Terán» (no D. Cueva).

**No modifiques** el login del Administrador (W1, incluido el código de verificación), M1, M3.1, M3.2, M3.4, M5, M6.x, U1, U3, U4, U6, ni los diálogos W3.1, W4.3 y W5.3 (salvo el menú lateral nuevo y los cambios indicados arriba).
