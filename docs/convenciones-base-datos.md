# Convenciones de nombres y auditoría — base de datos

Documento para la tesis. Aclaración importante: **no existe un estándar oficial único** para nombrar objetos en una base de datos. Lo que existe son convenciones ampliamente aceptadas (PostgreSQL, Supabase, guías de la industria) y principios generales de nomenclatura (ISO/IEC 11179). Lo que se evalúa es que haya una convención **explícita y aplicada de forma consistente**. Esta es la que usa el proyecto.

## 1. Reglas generales

| Regla | Aplicación en el proyecto |
|---|---|
| **snake_case**: minúsculas separadas por guion bajo | `mensajes_chat`, `fecha_vencimiento` |
| Sin mayúsculas, tildes, `ñ`, espacios ni guiones medios | `configuracion`, `anomalias`, `bitacora` (sin tilde) |
| Sin palabras reservadas de SQL como nombres | no se usa `user`, `order`, `desc`; por eso `usuarios`, no `user` |
| Nombres descriptivos, sin abreviaturas, salvo unidades universales | `radio_metros`, `precision_m`, `plazo_justificacion_h`, `tolerancia_min` |
| Máximo 63 bytes (límite de PostgreSQL) | el más largo es `fecha_consentimiento_biometrico` (31) |
| Un solo idioma de negocio: español | `marcaciones`, `justificaciones`, `fecha_hora` |
| Columnas técnicas de auditoría en inglés estándar | `created_at`, `created_by`, `updated_at`, `updated_by` |

**Por qué snake_case y no CamelCase:** PostgreSQL convierte a minúsculas todo identificador que no lleve comillas. Si una tabla se creara como `MensajesChat`, la base la guardaría como `mensajeschat`; para conservar las mayúsculas habría que escribir comillas dobles en cada consulta, en el código y en las políticas de seguridad. snake_case evita ese problema y es la convención más usada en PostgreSQL y Supabase. CamelCase sí es la convención para **clases en el código** (Python, TypeScript), no para tablas ni columnas.

## 2. Reglas por tipo de objeto

| Objeto | Regla | Ejemplos |
|---|---|---|
| Tabla | Sustantivo en **plural** | `sedes`, `bloques`, `usuarios`, `rostros`, `marcaciones`, `anomalias` |
| Clave primaria | Siempre `id` | `usuarios.id` |
| Clave foránea | `<entidad_en_singular>_id` | `usuario_id`, `sede_id`, `anomalia_id` |
| FK con un rol específico | participio + `_por` | `revisado_por` (usuario que decide el caso) |
| Fecha y hora | `fecha_<qué>` en columnas de negocio | `fecha_hora`, `fecha_vencimiento`, `fecha_decision` |
| Booleano | adjetivo o `permite_`/`es_` | `activo`, `activa`, `permite_fuera_geocerca` |
| Unidad de medida | sufijo corto de la unidad | `_m` (metros), `_h` (horas), `_min` (minutos) |
| Tipo enumerado | singular, describe el dominio | `estado_anomalia`, `tipo_marcacion` |
| Valor de enumerado | minúsculas con guion bajo | `en_revision`, `celular_perdido` |
| Índice | `<tabla>_<columnas>_idx` | `marcaciones_usuario_fecha_idx` |
| Restricción (check, única, FK compuesta) | descripción de la regla | `rostro_requiere_consentimiento`, `bloques_nombre_por_sede_unico`, `marcaciones_bloque_de_la_sede` |
| Función | verbo en infinitivo; `es_` si devuelve verdadero/falso | `decidir_anomalia`, `registrar_rostro`, `resetear_rostro`, `es_administrador` |
| Trigger | `<tabla>_<acción>` | `marcaciones_inmutable`, `sedes_auditoria`, `usuarios_borrar_rostro` |
| Vista | prefijo `v_` | `v_anomalias_detalle` |

## 3. Excepciones documentadas

- **`configuracion`** está en singular porque es una tabla de **una sola fila** (`id = 1`).
- **`bitacora`** está en singular porque es un sustantivo colectivo (el registro de eventos) y es el término que se usa en el dominio de auditoría.
- **`dispositivo_id`** termina en `_id` pero **no es clave foránea**: guarda el identificador externo del celular vinculado.
- **`entidad_id`** (en `bitacora`) apunta a un registro de cualquier tabla, por eso no es clave foránea.
- **`rostros`** tiene relación 1 a 1 con `usuarios`: su PK es `id` y la FK `usuario_id` es además única (una sola fila por usuario).
- **`marcaciones`** tiene una FK **compuesta** `(bloque_id, sede_id)` hacia `bloques (id, sede_id)`: así la base de datos garantiza que el bloque de una marcación pertenezca a la sede de esa marcación. Cada columna sigue la regla `<entidad>_id`.
- **Tablas de Supabase:** `auth.users` pertenece al esquema `auth` y no sigue estas reglas, porque la administra Supabase.

## 4. Auditoría: columnas base y bitácora

Son dos mecanismos distintos que se complementan.

### 4.1 Columnas de auditoría (equivalente a una *BaseModel*)
En frameworks como Django o SQLAlchemy se define una clase base de la que heredan los modelos. **En la base de datos relacional no existe la herencia:** esa clase se traduce a las mismas columnas repetidas en cada tabla. En este proyecto:

| Columna | Significado |
|---|---|
| `created_at` | cuándo se creó el registro |
| `created_by` | qué usuario lo creó (FK a `usuarios.id`) |
| `updated_at` | cuándo se modificó por última vez |
| `updated_by` | qué usuario lo modificó por última vez (FK a `usuarios.id`) |

- Se aplican a las tablas que el Administrador **edita**: `sedes`, `bloques`, `usuarios` y `configuracion`. Las rellena un trigger de la base de datos (`asignar_auditoria`), no la aplicación.
- Si escribe el microservicio sin sesión de usuario, `updated_by` queda vacío (significa "el sistema").
- **No llevan `updated_*`** las tablas inmutables (`marcaciones`, `mensajes_chat`, `bitacora`): nunca se modifican, así que solo tienen `created_at`. `rostros` tampoco: nunca se edita (se elimina y se vuelve a crear), así que solo tiene `created_at`. Los registros de `anomalias` y `justificaciones` los escribe el sistema, y las decisiones sobre ellos quedan en `revisado_por`, `fecha_decision` y la bitácora.
- No se usa `deleted_at`: en vez de borrado lógico con fecha, el proyecto usa el campo `activo` (los usuarios y las sedes se desactivan, no se borran).

### 4.2 Bitácora (`bitacora`)
Es una tabla que guarda **el historial de cambios**: quién, cuándo, sobre qué registro, qué campo, valor anterior y valor nuevo.

| Columna | Contenido |
|---|---|
| `usuario_id` | quién hizo el cambio (vacío = el sistema) |
| `evento` | crear, actualizar, activar, desactivar, registrar_rostro, resetear_rostro, resetear_dispositivo, decidir_caso |
| `entidad`, `entidad_id` | tabla y registro afectados |
| `campo`, `valor_anterior`, `valor_nuevo` | el cambio concreto |
| `motivo` | comentario (por ejemplo, el del Administrador al decidir un caso) |
| `created_at` | cuándo ocurrió |

- Se llena **automáticamente** con triggers en `sedes`, `bloques`, `usuarios` y `configuracion`, y desde `decidir_anomalia()`.
- Es **inmutable**: un trigger impide editar o borrar sus filas. La consulta solo el Administrador (políticas RLS).
- **Privacidad:** los datos del rostro nunca pasan por ella (viven cifrados en `rostros`, que no tiene este trigger) ni guarda el `push_token`; solo registra que hubo un registro o reseteo de rostro, con su fecha.

### 4.3 Datos biométricos (`rostros`)
- Los vectores faciales **no están en `usuarios`**: viven en la tabla `rostros`, cifrados por el microservicio con AES-256-GCM (`vectores_cifrados`, tipo `bytea`: valor aleatorio + texto cifrado + etiqueta de autenticación). `version_clave` indica con qué versión de la clave se cifraron, para poder rotarla.
- La tabla tiene RLS activado, **sin políticas**, y se le quitan los permisos de tabla a `anon` y `authenticated`: solo el microservicio (`service_role`) accede. Se escribe con `registrar_rostro()` y la resetea el Administrador con `resetear_rostro()`.
- `usuarios` conserva solo el estado: `fecha_registro_rostro` y `fecha_consentimiento_biometrico` (sin datos biométricos). Al desactivar a un usuario, un trigger borra su rostro y esas fechas.

## 5. Lista de verificación para la revisión

- [ ] Todos los nombres están en minúsculas con guion bajo y sin tildes.
- [ ] Todas las tablas están en plural (salvo las dos excepciones documentadas).
- [ ] Toda PK se llama `id` y toda FK `<entidad>_id` (o `_por` con rol).
- [ ] Las tablas editables (`sedes`, `bloques`, `usuarios`, `configuracion`) tienen las 4 columnas de auditoría; las inmutables y `rostros` solo `created_at`.
- [ ] `rostros` no tiene políticas de acceso y su contenido está cifrado; el administrador no puede leerlo.
- [ ] Hay bitácora inmutable y solo consultable por el Administrador.
- [ ] El diagrama (PK, FK, multiplicidades) coincide con el SQL ejecutado.
