# Plan técnico — Sistema de asistencia universitaria con IA

Actualización del documento de arquitectura inicial, con la implementación completa: 2 roles, verificación de identidad por **rostro**, **portal web de contingencia** para el empleado, justificación conversacional, panel de analítica y el cambio de proveedor de IA generativa de Gemini a OpenAI.

## 1. Roles y canales de acceso

| Rol | Canal principal | Canal de contingencia |
|---|---|---|
| **Usuario (empleado)** | App móvil | Portal web (`/usuario`) — para cuando el celular se pierde, se lo roban, se olvida, se daña o no tiene batería |
| **Administrador (Talento Humano)** | Panel web (`/admin`) | — |

Es **un solo sistema**: una sola base de datos, un solo microservicio y las mismas reglas de negocio. La app móvil y la web son dos clientes del mismo backend.

## 2. Arquitectura general

```
┌────────────────────┐   ┌──────────────────────────────────────────┐
│  App móvil          │   │  Web (una sola app React, rutas por rol)  │
│  React Native/Expo  │   │  /usuario  → contingencia del empleado    │
│  rol Usuario        │   │  /admin    → panel de Talento Humano      │
└───────┬─────────┬───┘   └───────┬──────────────────────┬───────────┘
        │         │               │                      │
        │ ESCRITURAS              │ ESCRITURAS           │ LECTURAS + decisión
        │ (marcar, chat)          │ (marcar web, chat)   │ del admin
        ▼         │               ▼                      │
┌───────────────────────────────────────────┐            │
│  Microservicio (Python 3.11 + FastAPI)      │            │
│  · Rostro (embedding) + detección de vida   │            │
│  · Valida bloque/sede y aplica reglas       │            │
│  · Isolation Forest → detecta anomalías     │            │
│  · OpenAI: alerta, chat y clasificación     │            │
│  · Escribe con la service_role key          │            │
└──────────────────────┬────────────────────┘            │
                       ▼                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                        │
│  Auth + Row Level Security (cada rol lee solo lo suyo)        │
│  Tablas: sedes, bloques, usuarios, rostros, configuracion,    │
│    marcaciones, anomalias, justificaciones, mensajes_chat,    │
│    bitacora                                                   │
└─────────────────────────────────────────────────────────────┘
        ▲ lecturas directas con RLS (historial, estado de casos)
        └─ app móvil y web de usuario
```

**Regla de escritura (cambio importante frente a la versión anterior):**
- Los clientes **leen** de Supabase directamente (protegidos por RLS).
- Los clientes **no escriben** marcaciones, anomalías, justificaciones ni mensajes: lo hace el microservicio con la `service_role key`. Motivo: la verificación facial y la IA corren en el servidor, y un cliente (celular o navegador) no es de confianza — si pudiera insertar directo, podría saltarse la verificación.
- La única escritura del Administrador es su decisión sobre un caso, mediante la función `decidir_anomalia()` de la base de datos (atómica, solo ejecutable por un administrador activo). También edita sedes, bloques, usuarios y configuración bajo RLS, y resetea rostros con la función `resetear_rostro()`. **Nadie**, ni siquiera el Administrador, puede leer la tabla `rostros` desde el cliente.

El módulo de IA sigue siendo un microservicio independiente. Contrapartida de que ahora **toda marcación pasa por él**: si el microservicio está caído, no se puede marcar en línea. Por eso la app guarda en SQLite y reintenta (ver sección 3.1), y el servicio se mantiene activo en Render Starter.

## 3. Stack tecnológico

### 3.1 App móvil — rol Usuario
- **Tecnología:** React Native + Expo (SDK 51+).
- **Librerías:** `expo-location` (geocerca), **`expo-camera`** (captura del rostro; reemplaza a `expo-local-authentication`), `expo-sqlite` (cola offline), `NetInfo` (estado de conexión).
- **Offline:** la marcación se guarda en SQLite con su UUID y la verificación queda **pendiente**; al volver la señal se envía al microservicio, que verifica el rostro y registra la marcación (**verificación diferida**). SQLite solo guarda la cola `marcaciones_pendientes` y la caché de la sede; la fuente de verdad sigue siendo Supabase.
- **Costo:** $0.

### 3.2 Web — Administrador y contingencia del Usuario
- **Tecnología:** una sola app React + Tailwind CSS + Recharts o Chart.js + `jsPDF` (PDF) o CSV directo + Leaflet/OpenStreetMap para ubicar sedes y bloques en el mapa (gratis, sin API key).
- **Sedes y bloques:** el Administrador registra cada sede (campus) y, dentro de ella, sus bloques o edificios (p. ej. bloques M, P y V de la matriz de Milagro). Para cada uno elige el punto **haciendo clic en el mapa o escribiendo latitud y longitud** (las dos formas se sincronizan) y fija el radio con un control deslizante; el mapa dibuja el círculo.
- **Rutas por rol:** `/admin` (dashboard, anomalías, usuarios, sedes y bloques, reportes, auditoría) y `/usuario` (marcar por contingencia, historial, chat de justificación). El login redirige según el rol y cada ruta rechaza al otro rol.
- **Marcación web:** exige elegir un motivo (celular perdido, robado, olvidado, dañado, sin batería u otro), usa la ubicación del navegador y la cámara para el rostro. Queda con `origen = 'web'`. **No tiene modo offline** ni vinculación de dispositivo.
- **Control de abuso:** si un usuario usa la web de forma recurrente, el sistema genera la anomalía `uso_recurrente_web` para que Talento Humano la revise.
- **Requisito:** interfaz responsive (computadora, tablet y celular) con el mismo diseño adaptado, no versiones aparte.
- **Costo:** $0 en desarrollo.

### 3.3 Backend, base de datos y autenticación
- **Tecnología:** Supabase (PostgreSQL 15+), Auth y Row Level Security.
- **Esquema:** `supabase/migrations/0001_init.sql` (10 tablas, enums, triggers, funciones y políticas RLS). Convenciones de nombres en `convenciones-base-datos.md`.
- **Piezas de base de datos:**
  - Trigger que hace **inmutables** las marcaciones (no se borran ni editan; solo se actualiza el resultado de la verificación facial).
  - `decidir_anomalia()`: aprobar, rechazar (comentario obligatorio) o escalar.
  - `marcar_sin_justificar()`: pasa a `sin_justificar` las anomalías vencidas; se programa con `pg_cron` cada 15 min.
  - Vista `v_anomalias_detalle` para el dashboard y los reportes.
  - **Auditoría:** las tablas editables (`sedes`, `bloques`, `usuarios`, `configuracion`) llevan `created_at`, `created_by`, `updated_at` y `updated_by`, que rellena un trigger (equivalente a una *BaseModel*; en SQL no hay herencia, son columnas repetidas). Además, la tabla `bitacora` registra automáticamente quién hizo cada cambio, sobre qué registro, con el valor anterior y el nuevo; es inmutable y solo la consulta el Administrador. El `push_token` y los datos del rostro nunca se guardan en ella: solo queda constancia de que hubo un registro o un reseteo.
  - **Zonas de marcación:** una `sede` es un campus (punto + radio amplio) y puede tener varios `bloques` (edificios), cada uno con su punto y radio. Cada marcación guarda en qué bloque se hizo (`bloque_id`); una clave foránea compuesta asegura que el bloque pertenezca a la sede de la marcación.
  - **Rostro cifrado:** el vector facial no está en `usuarios` sino en la tabla `rostros` (1 a 1), cifrado, sin políticas de acceso para los clientes. `registrar_rostro()` (solo el microservicio) y `resetear_rostro()` (solo el Administrador) son las únicas vías. Al desactivar a un usuario, un trigger borra su rostro y retira el consentimiento.
- **Costo:** $0 en la capa gratuita para un piloto universitario.

#### 3.3.1 Acceso, alta de usuarios y contraseñas
Nadie se registra solo y el Administrador **nunca define ni conoce** la contraseña de otra persona. Cada usuario crea la suya desde un correo de invitación.
1. **Alta:** en `/admin` → Usuarios, el Administrador llena nombre, correo, rol, sede y jornada (sin campo de contraseña). La web llama al microservicio (`POST /usuarios`), que comprueba que quien llama sea un Administrador activo.
2. **Invitación:** con la `service_role key`, el microservicio invita al correo mediante Supabase Auth (`auth.admin.inviteUserByEmail`), que crea el usuario en `auth.users` y envía el enlace. Con el `id` devuelto inserta la fila en `usuarios`, indicando `created_by` (el `service_role` no tiene sesión). Si la inserción falla, elimina el usuario recién creado de Auth para no dejar cuentas huérfanas.
3. **Crear la contraseña:** el enlace abre la página web `/aceptar-invitacion`, donde el usuario escribe su contraseña (`supabase.auth.updateUser`). Sirve igual para quien usará la app móvil: crea la contraseña en la web y luego inicia sesión en la app. Así se evita configurar enlaces profundos (*deep links*) en el móvil.
4. **Primer ingreso:** inicia sesión, vincula el dispositivo, acepta el consentimiento biométrico y registra su rostro (ver `flujo-logica-negocio.md`, Flujo 0).
5. **Olvidé mi contraseña:** el login tiene esa opción; Supabase envía un enlace a `/restablecer-contrasena` (`resetPasswordForEmail`). No interviene el Administrador.
6. **Invitación vencida o perdida:** el Administrador usa «Reenviar invitación» (`POST /usuarios/{id}/reenviar-invitacion`); si el usuario ya activó su cuenta, se le envía en cambio un enlace de restablecimiento.
7. **Baja:** al desactivar a un usuario, además de borrar su rostro (trigger), el microservicio bloquea su cuenta en Auth (*ban*) para que no pueda iniciar sesión; al reactivarla se levanta el bloqueo.
- **Reglas de Auth (configurar en Supabase):** registro público desactivado, confirmación por correo, contraseña de mínimo 8 caracteres con letras y números, y las URL de redirección permitidas (`/aceptar-invitacion` y `/restablecer-contrasena` de local y de producción).
- **Correo:** el servicio de correo por defecto de Supabase tiene un límite muy bajo de envíos por hora; para el piloto hay que configurar un SMTP propio (por ejemplo Resend, capa gratuita) y personalizar las plantillas de invitación y de restablecimiento en español.
- **Sesión:** el control de acceso sigue siendo Row Level Security; la web redirige según el rol (`/admin` o `/usuario`) y la app móvil solo admite el rol Usuario. Autenticación en dos pasos para el Administrador: pendiente de decidir.

### 3.4 Microservicio (verificación de rostro + IA)
- **Tecnología:** Python 3.11+, FastAPI, scikit-learn (Isolation Forest) y un modelo ligero de embeddings faciales en ONNX (`onnxruntime`).
- **Verificación de rostro:** la app o la web envía la selfie; el servidor calcula el *embedding*, descifra los vectores guardados en `rostros` (en memoria, solo para comparar) y mide la similitud. **La foto no se guarda**: solo se conservan los vectores cifrados y el puntaje de cada marcación (`similitud_score`).
- **Librerías de rostro (código abierto, sin costo):** detector y modelo de embeddings (por ejemplo InsightFace/ArcFace en formato ONNX) con `onnxruntime`, y similitud coseno con `numpy`. **Nota de licencia:** los modelos preentrenados de InsightFace son gratuitos para investigación y uso académico, pero no para uso comercial; si el sistema pasa a producción hay que cambiar de modelo o pedir licencia.
- **Validación de la zona:** el servidor calcula la distancia entre la ubicación del celular o navegador y el centro de cada bloque activo de la sede del usuario (fórmula de Haversine). Si está dentro del radio de alguno, la marcación es válida y se guarda ese bloque. Si la sede no tiene bloques registrados, se valida contra el círculo de la sede. Si no, se genera la anomalía `fuera_geocerca`. Es una **zona aproximada**: el GPS tiene un error de 5 a 20 m (peor dentro de edificios), por lo que los círculos de bloques contiguos pueden traslaparse y el sistema no distingue con certeza el edificio exacto. Como mejora futura queda dibujar el contorno real de cada bloque como polígono (PostGIS).
- **Detección híbrida:** reglas para `sin_salida`, `duplicada` y `fuera_geocerca`; Isolation Forest para los patrones atípicos (`desplazamiento_inusual`, `fuera_horario`). La columna `detector` indica cuál la generó.
- **Registro del rostro guiado:** al registrarse se toman 3 a 5 fotos (frente, giro leve a la izquierda y a la derecha, y opcionalmente arriba y abajo). El servidor calcula un vector por foto, cifra la lista completa y la guarda en `rostros` mediante `registrar_rostro()`. En cada marcación basta una selfie de frente, que se compara con todos los vectores y se toma la mayor similitud.
- **Detección de vida pasiva (antispoofing):** además del reconocimiento, un segundo modelo ONNX de código abierto (por ejemplo, Silent-Face-Anti-Spoofing) clasifica la selfie como cara real o como foto/pantalla. Corre en el servidor, con la misma selfie, sin pedir nada extra al Usuario. Se aplica tanto al registro como a cada marcación (en modo offline, al sincronizar). Si detecta una falsificación, la marcación no se registra y se genera una anomalía `verificacion_fallida` con el motivo en la descripción (sin cambios en el esquema).
- **Limitación a declarar en la tesis:** la detección pasiva reduce el engaño con fotos impresas o pantallas, pero no es infalible (por ejemplo, ante máscaras o videos de alta calidad). Se complementa con la geocerca, el dispositivo vinculado, las reglas de anomalía y la revisión humana. Como mejora futura queda la detección activa (pedir un gesto aleatorio).
- **Costo:** $0 en desarrollo local.

### 3.5 IA generativa — OpenAI (reemplaza a Gemini)
- **Modelo por defecto: `gpt-4.1-mini`**, configurable desde el panel (`configuracion.modelo_ia`) por si hay que cambiarlo sin redesplegar.
  - Soporta *structured outputs* (JSON): la clasificación (aceptable / requiere revisión / sospechosa) sale en formato fijo.
  - **No se usa la Realtime API**: el chat es de texto; la API estándar de Chat/Responses es la correcta y más barata.
- **Qué hace:** redacta la alerta en lenguaje natural, conduce el chat de justificación y clasifica la respuesta en JSON para el panel; también redacta el resumen ejecutivo de Reportes (un llamado por reporte).
- **Costo:** pago por uso. Ver sección 4.
- **La API key** vive solo en variables de entorno del servidor; nunca en la base de datos ni en la interfaz.

### 3.6 Despliegue e infraestructura
- **Microservicio:** Render (plan Starter) para evitar que "duerma" el día de la sustentación. **~$5–7 USD/mes.**
  - **Riesgo de memoria:** Isolation Forest + el modelo de rostro + el modelo antispoofing en un plan de 512 MB puede quedar justo. Hay que medir el consumo real; si no alcanza, hay que subir de plan (más caro) o usar un modelo de embeddings más pequeño.
- **Web (admin + contingencia):** Vercel o Netlify, capa gratuita. **$0.**
- **Control de versiones:** Git + GitHub. **$0.**

### 3.7 Datos biométricos y cumplimiento (LOPDP Ecuador)
El vector facial es un dato biométrico, considerado sensible por la Ley Orgánica de Protección de Datos Personales.
- Se registra solo con **consentimiento explícito** (`fecha_consentimiento_biometrico`); la base de datos impide guardar un rostro sin esa fecha.
- Se guarda el vector, no la imagen. Un vector facial no es anónimo: es una plantilla biométrica que identifica a la persona y, a diferencia de una contraseña, no se puede cambiar. Por eso se protege así:
  1. **Cifrado a nivel de aplicación con AES-256-GCM**, hecho por el microservicio antes de guardar. Cada registro usa un valor aleatorio distinto (*nonce*), y el modo GCM detecta si alguien modificó el dato cifrado. La clave (32 bytes aleatorios) vive solo en las variables de entorno de Render, separada de la base de datos; `version_clave` permite rotarla. (SHA-256 no sirve para esto: es un hash de un solo sentido y no permite comparar rostros por similitud.)
  2. **Acceso restringido:** la tabla `rostros` no tiene políticas de lectura ni escritura para la app ni para el panel (tampoco para el Administrador); solo el microservicio (`service_role`) la usa. Esto se probó con una base de datos real.
  3. **Sin datos en la bitácora:** solo queda constancia de que hubo un registro o un reseteo de rostro.
  4. **Minimización:** al desactivar a un usuario se borran su rostro y su consentimiento automáticamente; el Administrador también puede resetear el rostro (cambio de apariencia, error de registro) y el usuario lo vuelve a registrar con un consentimiento nuevo.
  5. **Cifrado en disco y en tránsito** de Supabase (defensa en capas).
- **Riesgo residual (declararlo en la tesis):** el cifrado protege si se filtra solo la base de datos o un respaldo. No protege si un atacante compromete a la vez la base y el servidor donde está la clave. Técnicas más avanzadas (biometría cancelable, cifrado homomórfico) quedan como trabajo futuro.
- Ante una filtración, la LOPDP obliga a notificar a la autoridad de protección de datos; esto debe estar previsto en el procedimiento de la universidad. Este plan no es asesoría legal: si el sistema pasa a producción, debe revisarlo el delegado de protección de datos de la universidad.
- El texto del consentimiento conviene revisarlo con la directora de tesis.

## 4. Resumen de costos

| Componente | Tecnología | ¿Gratis? | Costo estimado |
|---|---|---|---|
| App móvil | Expo / React Native | Sí | $0 |
| Web (admin + contingencia) | React + Recharts | Sí | $0 |
| Hosting web | Vercel/Netlify (free tier) | Sí | $0 |
| Backend + DB | Supabase (free tier) | Sí | $0 |
| Microservicio (código) | Python/FastAPI/scikit-learn/ONNX | Sí | $0 |
| Hosting microservicio | Render (Starter) | No | ~$5–7 USD/mes (≈$10–14 en 2 meses) |
| IA generativa | OpenAI API (`gpt-4.1-mini`) | No | Ver abajo |
| Control de versiones | GitHub | Sí | $0 |

**Estimación de OpenAI para el piloto (10 personas, 4–6 semanas + sustentación):** con `gpt-4.1-mini` (~$0.40 por millón de tokens de entrada, ~$1.60 de salida), el volumen esperado (alertas + chats de justificación) son decenas de miles de tokens: el costo real queda muy por debajo de $1 USD. Solo se necesita cargar saldo prepago (mínimo ~$5 USD). La verificación facial corre en tu propio servidor y no usa OpenAI.

**Total estimado: ~$15–20 USD.** Si Render necesitara un plan de más memoria por el modelo de rostro, ese rubro subiría.

## 5. Recomendaciones

1. Usa `gpt-4.1-mini` por defecto; si la clasificación falla mucho, sube a `gpt-4.1` solo para esa llamada.
2. Activa el plan pago de Render solo en las últimas 2–3 semanas (pruebas finales + sustentación).
3. Crea la cuenta de OpenAI con anticipación y prueba la facturación (a veces piden verificación).
4. Guarda las credenciales como variables de entorno, nunca hardcodeadas. La `service_role key` y la clave de cifrado de rostros (`ROSTRO_CLAVE_AES`) solo viven en el microservicio. Respalda la clave de cifrado en un lugar seguro y aparte: si se pierde, los rostros guardados no se pueden recuperar y hay que registrarlos de nuevo.
5. Mide la memoria del microservicio con el modelo de rostro cargado **antes** de contratar Render.
6. Prueba el reconocimiento facial con poca luz, lentes y mascarilla; el umbral de similitud se calibra con datos reales del piloto.

## 6. Estructura de carpetas

Un solo repositorio (monorepo): un README, un historial de commits.

```
proyecto-asistencia-unemi/
├── app-movil/                    # React Native + Expo · rol Usuario
│   ├── app/
│   │   ├── (auth)/login.tsx                # la contraseña se crea/recupera en la web
│   │   ├── (auth)/registro-rostro.tsx      # enrolamiento + consentimiento
│   │   ├── (tabs)/home.tsx
│   │   ├── (tabs)/historial.tsx
│   │   └── anomalia/
│   │       ├── notificacion.tsx
│   │       └── chat-justificacion.tsx
│   ├── hooks/
│   │   ├── useGeocerca.ts
│   │   ├── useRostro.ts                    # captura con expo-camera
│   │   └── useSyncOffline.ts
│   ├── lib/
│   │   ├── supabase.ts                     # solo lecturas
│   │   ├── api.ts                          # llamadas al microservicio
│   │   └── db-local.ts                     # expo-sqlite (cola offline)
│   └── package.json
│
├── panel-web/                    # React · una app, dos áreas por rol
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── AceptarInvitacion.tsx       # el usuario crea su contraseña
│   │   │   ├── RecuperarContrasena.tsx     # «Olvidé mi contraseña»
│   │   │   ├── RestablecerContrasena.tsx   # enlace del correo
│   │   │   ├── admin/
│   │   │   │   ├── Dashboard.tsx
│   │   │   │   ├── Anomalias.tsx
│   │   │   │   ├── DetalleAnomalia.tsx
│   │   │   │   ├── Usuarios.tsx
│   │   │   │   ├── Sedes.tsx               # sedes y bloques (mapa + coordenadas + radio)
│   │   │   │   ├── Reportes.tsx
│   │   │   │   └── Auditoria.tsx           # bitácora (solo lectura)
│   │   │   └── usuario/                    # contingencia
│   │   │       ├── MarcarWeb.tsx           # motivo + rostro + ubicación
│   │   │       ├── Historial.tsx
│   │   │       └── ChatJustificacion.tsx
│   │   ├── components/
│   │   │   ├── KpiCard.tsx
│   │   │   ├── GraficoTendencia.tsx
│   │   │   ├── TablaAnomalias.tsx
│   │   │   └── CamaraRostro.tsx
│   │   ├── routes/RutaPorRol.tsx           # guarda de acceso por rol
│   │   └── lib/{supabase.ts, api.ts}
│   └── package.json
│
├── ia-microservicio/             # Python 3.11 + FastAPI
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   │   ├── isolation_forest.py
│   │   │   └── embeddings_rostro.onnx
│   │   ├── services/
│   │   │   ├── verificacion_rostro.py
│   │   │   ├── reglas_anomalias.py
│   │   │   ├── deteccion_anomalias.py
│   │   │   ├── openai_client.py
│   │   │   └── clasificador_justificacion.py
│   │   ├── routers/
│   │   │   ├── marcaciones.py              # recibe y valida cada marcación
│   │   │   ├── usuarios.py                 # alta con invitación, reenvío y baja (Auth admin)
│   │   │   ├── rostro.py                   # enrolamiento
│   │   │   ├── anomalias.py
│   │   │   └── justificaciones.py
│   │   └── schemas.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── supabase/                     # migraciones de base de datos
│   ├── migrations/0001_init.sql
│   └── config.toml
│
├── docs/                         # documentación de la tesis
│   ├── plan-tecnico-arquitectura.md
│   ├── logica-negocio.md
│   ├── flujo-logica-negocio.md
│   ├── pasos-manuales.md
│   ├── convenciones-base-datos.md
│   └── modelo-datos.puml (y .drawio)
│
└── README.md
```

Si prefieren repos separados por componente, la estructura interna de cada uno se mantiene.
