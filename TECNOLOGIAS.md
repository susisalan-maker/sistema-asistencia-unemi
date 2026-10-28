# Tecnologías del sistema

Resumen puntual de qué se usa y para qué. Para el detalle de las reglas, ver `docs/logica-negocio.md`; para los valores ajustables, `PARAMETROS-Y-DATOS.md`.

Las secciones 1 a 11 dicen **qué tecnología se usa**. Las secciones 12 a 18 dicen **qué hicimos con ella, por qué y qué beneficio da** (claves y secretos, marcación, ubicación, cifrado, límites y preguntas probables), para poder responder en la sustentación.

## 1. Arquitectura

**Híbrida: Supabase (servicio de base de datos y login) + un microservicio propio (FastAPI) + dos clientes.**

```
App móvil (Expo)  ──┐
                    ├──►  Microservicio FastAPI  ──►  Supabase (PostgreSQL + Auth)
Panel web (React) ──┤        (reglas, rostro, IA)          ▲
                    └──────────────────────────────────────┘
                       (el panel también lee tablas directo, protegido por RLS)
```

| Parte | Qué es | Qué hace |
|---|---|---|
| App móvil | Expo / React Native | El usuario marca asistencia, ve su historial y justifica anomalías. Solo usa Supabase para iniciar sesión; todo lo demás pasa por el microservicio |
| Panel web | React + Vite | Administración: anomalías, usuarios, sedes y bloques, configuración y feriados. Lee tablas directo de Supabase (solo el administrador puede, por RLS) y usa el microservicio para las acciones con reglas |
| Microservicio | **FastAPI** (Python), no Django | Registra marcaciones, verifica el rostro, detecta anomalías, conduce el chat de justificación con IA y administra usuarios. Es el único que usa la `service_role` |
| Supabase | PostgreSQL + Auth | Guarda los datos, maneja el inicio de sesión y aplica la seguridad por filas (RLS) |

## 2. Sesión y seguridad de acceso

| Qué | Con qué |
|---|---|
| Inicio de sesión | Supabase Auth (correo y contraseña; las cuentas se crean por invitación) |
| Sesión | **JWT** (token de acceso, ~1 h) + token de renovación; se renueva solo mientras la pestaña o la app están abiertas |
| Dónde se guarda | Panel: almacenamiento del navegador. App: `expo-sqlite` (localStorage) |
| Cómo se valida en el microservicio | Cabecera `Authorization: Bearer <JWT>`; el microservicio pregunta a Supabase de quién es y revisa en `usuarios` el rol y que esté activo |
| Permisos en la base | RLS (políticas por fila) de PostgreSQL |
| Roles | `usuario` y `administrador` |
| Si la sesión termina | Ante un 401 el panel y la app renuevan el token y repiten la petición una vez; si no se puede, cierran la sesión y llevan al login con un aviso. El servidor responde con un `codigo` (`sesion_vencida`, `cuenta_inhabilitada`) |
| Cierre de la sesión web de la persona usuaria | Botón visible «Cerrar sesión» y cierre automático tras **10 minutos sin actividad**; marcar no cierra la sesión |
| Varias sesiones a la vez | Se puede abrir el panel en varios navegadores al mismo tiempo: cada uno tiene su propia sesión, como en Gmail o en una app bancaria (así funciona Supabase Auth). Lo acotan el cierre a los 10 minutos sin actividad y que marcar no depende de la sesión, sino del rostro, la ubicación y el celular vinculado |
| Cuenta desactivada | Se detecta al volver a la pestaña o a la app, o en la siguiente petición; cierra la sesión de ese navegador o celular y avisa en el login |

## 3. Base de datos

| Qué | Con qué |
|---|---|
| Motor | **PostgreSQL** (en Supabase) |
| Migraciones | SQL en `supabase/migrations/` (0001 a 0005) |
| Acceso desde el microservicio | PostgREST de Supabase, por HTTP con `httpx` (sin ORM) |
| Lógica en la base | Triggers (vencimiento de anomalías, auditoría, bitácora), funciones SQL y restricciones `CHECK` |
| Extensiones especiales | Ninguna. **No se usa `pgvector`** (ver sección 4) |

## 4. Rostro y cifrado del vector

| Qué | Con qué |
|---|---|
| Detector de rostros | **SCRFD** (`det_500m.onnx`, paquete `buffalo_sc` de InsightFace) |
| Reconocedor | **MobileFaceNet / ArcFace** (`w600k_mbf.onnx`): saca un vector de 512 números por foto |
| Detección de vida (anti foto/pantalla) | **MiniFASNet** (dos modelos ONNX, Silent-Face-Anti-Spoofing de Minivision, Apache-2.0) |
| Ejecución de modelos | `onnxruntime` en CPU, más `numpy` y `Pillow` para procesar la imagen |
| Registro | 3 a 5 fotos guiadas; solo se guardan los vectores, **nunca la foto** |
| Comparación | Similitud coseno entre el vector de la foto y los vectores guardados de esa misma persona (parecido mínimo editable en el panel, 0.40 de fábrica) |
| Cifrado | **AES-256-GCM** (`cryptography`), hecho en el microservicio antes de guardar. Nonce aleatorio por registro; la clave (`ROSTRO_CLAVE_AES`) vive solo en las variables de entorno del servidor |
| Dónde se guarda | Columna `bytea` de la tabla `rostros`, sin política de lectura para la app ni el panel |

**Por qué no `pgvector`:** sirve para buscar vectores parecidos dentro de la base, y eso exige guardarlos sin cifrar. Aquí la comparación es 1 a 1 (la persona que inicia sesión contra su propio rostro), así que no hace falta buscar entre todos, y se prefiere guardar los vectores cifrados. El microservicio los descifra solo en memoria para comparar.

Los modelos de InsightFace son de uso académico/investigación; hay que declararlo en la tesis.

## 5. Inteligencia artificial (chat de justificación)

| Qué | Con qué |
|---|---|
| Proveedores | **Google Gemini** (`gemini-flash-latest`), **Anthropic Claude** (`claude-haiku-5-5`) u **OpenAI** (`gpt-4.1-mini`); en el panel (Configuración → Inteligencia artificial) se guardan claves con nombre (proveedor + modelo + llave cifrada) y una sola está activa; `IA_PROVEEDOR` del `.env` solo es respaldo |
| Conexión | API HTTP directa con `httpx` (sin SDK) |
| Para qué | Redactar el aviso, conducir la justificación y clasificar la respuesta (`aceptable`, `requiere_revision`, `sospechosa`) |
| Qué no hace | No detecta anomalías (eso lo hacen reglas escritas en código) ni decide solo: la decisión final siempre la toma una persona (la aprobación automática de faltas menores con confianza ≥ 0.9 existe, pero viene **apagada** por defecto: `IA_AUTOAPROBAR=false`) |
| Si no hay llave o falla | El chat sigue y el caso pasa a revisión humana |

## 6. Ubicación y mapas

| Qué | Con qué |
|---|---|
| GPS en el celular | `expo-location` (alta precisión; en Android informa si la posición es simulada) |
| Ubicación en la web (marcación de contingencia) | API del navegador `navigator.geolocation` (alta precisión; exige https o localhost; no puede detectar GPS falso) |
| Precisión mínima de la ubicación | La precisión (±m) que informa el equipo se compara con un límite que el administrador configura por canal (`precision_max_app_m`, 50 m inicial; `precision_max_web_m`, 200 m inicial); el servidor rechaza con `precision_insuficiente` las marcaciones en línea que lo superan. Guía de calibración: `docs/calibracion-precision-gps.md` |
| Zona de la sede | Círculos (centro y radio) por sede y bloque; distancia con la fórmula de Haversine, calculada en el microservicio |
| Mapa en el panel | **Leaflet** + `react-leaflet`, con teselas de **OpenStreetMap** (sin llave ni cuenta) |
| Mapa en la app | La misma página de Leaflet dentro de `react-native-webview` |
| Desplazamiento inusual | Velocidad entre dos marcaciones (distancia ÷ tiempo) contra el límite configurado |

## 7. Cámara y datos del celular

| Qué | Con qué |
|---|---|
| Cámara | `expo-camera` (cámara frontal; calidad 0.4, imagen en base64) |
| Cámara en la web | API del navegador `getUserMedia` (cámara frontal; se toma un cuadro JPEG de hasta 720 px en un `canvas`; exige https o localhost) |
| Identificador del celular | `expo-application` (Android ID / identificador de proveedor en iPhone) |
| Id de cada marcación | `expo-crypto` (UUID, evita duplicados al reintentar) |
| Almacenamiento local | `expo-sqlite` (sesión, cola de marcaciones sin conexión y copia del estado de hoy; la selfie pendiente se guarda **cifrada con AES-256-GCM** en la carpeta privada de la app y se borra al enviarse) |
| Cifrado de la foto local | `expo-secure-store` (clave aleatoria de 256 bits en el Keystore de Android / Keychain de iOS) + `@noble/ciphers` (AES-256-GCM, JavaScript puro: funciona también en Expo Go). Nonce de 96 bits por foto y el id de la marcación como dato autenticado |
| Firma con clave del chip de seguridad | Módulo Expo local propio `modules/firma-dispositivo` (Kotlin: Android Keystore, StrongBox/TEE, key attestation; Swift: Secure Enclave). Verificación en el servidor con `cryptography` (ECDSA P-256 / SHA-256). Necesita una compilación propia (APK / iOS); no funciona en Expo Go |
| Reloj del celular | `expo-device` (`getUptimeAsync`: tiempo encendido, que no se cambia desde Ajustes; junto con la hora del servidor firmada prueba que el reloj no estaba atrasado en una marcación sin conexión) |
| Estado de la red | `@react-native-community/netinfo` (solo una pista: la app siempre intenta enviar y reintenta cada minuto mientras está abierta) |
| Navegación | `expo-router` |
| Íconos y gráficos | `react-native-svg` |
| Tipografía | Plus Jakarta Sans (`@expo-google-fonts`) |

## 8. Microservicio (FastAPI)

| Qué | Con qué |
|---|---|
| Lenguaje | Python 3.11 |
| Framework | **FastAPI** + `uvicorn` |
| Validación de datos | `pydantic` y `pydantic-settings` (variables de entorno) |
| Peticiones a Supabase y a la IA | `httpx` |
| Correos | Invitación y recuperación mediante Supabase Auth |
| Pruebas | `pytest` |
| Hora de las marcaciones | Siempre la del servidor, guardada en UTC y calculada en hora de Ecuador (UTC-5) |

## 9. Panel web

| Qué | Con qué |
|---|---|
| Framework | **React 19** + **TypeScript** |
| Empaquetador | Vite |
| Rutas | React Router |
| Estilos | Tailwind CSS |
| Conexión | `@supabase/supabase-js` y `fetch` al microservicio |
| Pruebas | Vitest + Testing Library |

## 10. App móvil

| Qué | Con qué |
|---|---|
| Framework | **Expo** + **React Native** + **TypeScript** |
| Sesión | `@supabase/supabase-js` |
| Pruebas | Jest (`jest-expo`) + Testing Library |

## 11. Despliegue y procesos automáticos

| Qué | Con qué | Para qué sirve |
|---|---|---|
| Microservicio | **Docker** (`Dockerfile`) en **Render**, publicado con el Blueprint `render.yaml` desde la rama `despliegue` (se redespliega solo en cada push). Los modelos faciales se descargan al construir la imagen. En desarrollo se corre con `uvicorn`, sin Docker | Aloja en internet el reconocimiento facial y las reglas de marcación, para que la app y el panel funcionen sin tener el computador encendido. En el plan gratuito se duerme tras un rato sin uso y tarda unos 50 s en despertar |
| Panel web | **Vercel** (capa gratuita), rama `despliegue`, con `vercel.json` para que las rutas de la SPA funcionen | Publica el panel administrativo y el canal web de contingencia en una dirección pública (HTTPS), sin servidor propio |
| App móvil (APK) | **EAS Build** de Expo (perfil `preview`, `eas.json`): compila la APK en la nube. Las variables `EXPO_PUBLIC_*` se guardan en el entorno `preview` de EAS, no en el repositorio | Genera el instalador Android que se puede descargar por enlace y probar en cualquier celular (por ejemplo, el del tutor) sin Android Studio ni Expo Go |
| Base de datos y login | Supabase | Guarda los datos y autentica a los usuarios; la dirección del panel se registra en *URL Configuration* para los enlaces de recuperación de contraseña |
| Proceso periódico de ausencias | **GitHub Actions** (`ausencias.yml`, cada 30 min) llama a `POST /procesos/ausencias` con un secreto | Registra las ausencias de quienes no marcaron, sin que nadie tenga que ejecutarlo a mano |
| Pruebas automáticas | GitHub Actions (`ci.yml`) | Corre las pruebas en cada cambio para detectar errores antes de publicar |
| Código | Git y GitHub (ramas de trabajo y rama `despliegue`, que es la que se publica) | Control de versiones y origen de lo que Render y Vercel despliegan |

## 12. Claves, secretos y contraseñas: dónde vive cada uno y por qué

**Regla de oro:** lo secreto vive solo en el servidor (Render) o dentro del chip del celular. En Vercel y en la APK solo van valores públicos. Nada secreto se sube a Git: los `.env` están ignorados y `render.yaml` marca los secretos con `sync: false`, es decir, se escriben a mano en el panel de Render.

### 12.1 Variables del microservicio (se configuran en Render)

| Variable | Qué es | Para qué sirve | Si se pierde o se filtra |
|---|---|---|---|
| `SUPABASE_URL` | Dirección del proyecto en Supabase (no es secreta) | Que el microservicio sepa a qué base hablar | No es un riesgo |
| `SUPABASE_SERVICE_ROLE_KEY` | Llave maestra de Supabase: salta la seguridad por filas (RLS) | El microservicio lee y escribe lo que las personas no pueden. De ella también se deriva la clave que firma la hora del servidor | Filtrada, da acceso total a la base: se regenera en Supabase y se actualiza en Render. Por eso **nunca** va en el panel, la app ni Git |
| `ROSTRO_CLAVE_AES` | Clave AES-256 (64 caracteres hexadecimales) | Cifra los vectores faciales y las llaves de IA antes de guardarlos | Perdida: nadie puede ser verificado y todos registran su rostro de nuevo, por eso se respalda aparte. Filtrada junto con la base: se podrían descifrar los vectores. Por eso la clave (Render) y los datos (Supabase) están en sitios distintos |
| `PROCESOS_SECRETO` | «Contraseña» del proceso automático de ausencias | Solo quien la conoce (GitHub Actions) puede llamar a `POST /procesos/ausencias`; vacía, el endpoint queda apagado | Filtrada: alguien podría disparar el cálculo de ausencias (es idempotente, no duplica nada). Se cambia en Render y en GitHub |
| `URL_PANEL_WEB` | Dirección del panel en Vercel | Enlaces de los correos de invitación y de recuperar contraseña | No es un riesgo |
| `CORS_ORIGINS` | Orígenes que pueden llamar al microservicio | Que solo el panel (Vercel) pueda llamarlo desde un navegador | No es un riesgo |
| `VERIFICACION_FACIAL=real` | Fijo en `render.yaml` | `simulada` daría por buena toda marcación; existe solo para desarrollo | En producción siempre `real` |
| `IA_AUTOAPROBAR=false` | Fijo en `render.yaml` | La IA nunca aprueba sola: la decisión la toma una persona | — |
| `FIRMA_OBLIGATORIA=false` | Fijo en `render.yaml` | En `true` se exigiría firma también a quien aún no registró clave (por ejemplo, con Expo Go). Se activa cuando todos usen la APK | — |

No se usan en producción (solo son respaldo en desarrollo): `ROSTRO_UMBRAL`, `VIDA_UMBRAL` y similares, porque los umbrales se editan en el panel; `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` y `OPENAI_API_KEY`, porque la llave de IA se escribe en el panel; `FIRMA_EXIGE_HARDWARE` y `ATESTACION_RAICES_SHA256`, que endurecen la firma y quedan para cuando todos usen la APK.

### 12.2 Los demás sitios donde hay claves

| Dónde | Qué hay | Por qué ahí |
|---|---|---|
| **Vercel** (panel) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL` | Son **públicos**: se incrustan en el JavaScript que baja cualquier navegador, así que no pueden ser secretos. La `anon key` es pública por diseño: lo que protege los datos es RLS |
| **EAS** (entorno `preview`, la APK) | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | Igual: quedan dentro de la APK. El prefijo `EXPO_PUBLIC_` significa «público» |
| **GitHub** (Settings → Secrets) | `MICROSERVICIO_URL`, `PROCESOS_SECRETO` | Para que el proceso programado llame al servidor sin escribir el secreto en el código |
| **Supabase** | Contraseñas de las personas | Supabase Auth guarda solo un *hash*, nunca el texto. La app y el panel las envían directo a Supabase por HTTPS: **nuestro microservicio no las ve nunca** |
| **Panel** → Configuración → Inteligencia artificial | Llave de IA (Gemini, Claude u OpenAI) | Se escribe en el panel, viaja al servidor y se guarda **cifrada** con `ROSTRO_CLAVE_AES` (tabla `ia_claves`, sin lectura para la app ni el panel). Solo se muestra «termina en …1234». Así se cambia sin tocar Render |
| **Celular** (`expo-secure-store`) | Clave AES de la foto de una marcación sin conexión | Se crea en el celular y no existe en ningún servidor |
| **Chip del celular** (Keystore / Secure Enclave) | Clave privada de firma | No se puede extraer ni con root; el servidor solo guarda la clave **pública** |

**¿Por qué `ROSTRO_CLAVE_AES` está en Render y no en Vercel?** Vercel solo publica archivos que cada navegador descarga: cualquier cosa que esté ahí se puede leer. Los rostros se descifran en el microservicio, así que la clave vive donde corre ese código.

## 13. Qué pasa al marcar, paso a paso

**Todo lo decide el servidor, no el celular ni el navegador.** El cliente solo envía datos (coordenadas, precisión, selfie, tipo de marcación); el microservicio los comprueba en este orden:

| Paso | Qué se comprueba | Por qué | Qué evita |
|---|---|---|---|
| 0. Sesión | Token válido, cuenta activa y rol `usuario` | Solo el personal activo marca | Cuentas dadas de baja; administradores marcando |
| 1. Reintento | Si el `id` (UUID) ya existe, se devuelve la misma marcación | Una caída de red hace que la app reenvíe | Marcaciones dobles |
| 2. GPS falso (Android) | Si el celular informa ubicación simulada, **no se registra** y queda la anomalía `ubicacion_simulada` | Una app de GPS falso permitiría «estar» en la sede | Suplantación de ubicación simple |
| 3. Celular vinculado (solo app) | Si la cuenta tiene un celular vinculado, solo ese puede marcar; para cambiarlo, el Administrador lo reinicia | Una cuenta, un celular | Prestar la cuenta o marcar por otra persona desde otro celular |
| 4. Sede activa | La sede de la persona existe y está activa | Sin sede no hay zona contra la que medir | Marcar sin zona definida |
| 4a. Precisión de la ubicación (solo con conexión) | El ±m que informa el equipo no supera el límite del canal (app 50 m, web 200 m, editables). Si lo supera: error `precision_insuficiente`, **antes** de analizar el rostro, sin anomalía | «Estar en la zona» con ±3 km de incertidumbre no prueba nada | Marcar con una ubicación vaga |
| 4b. Hora | Con conexión: **la hora del servidor** (la del celular se ignora). Sin conexión: la del celular, pero solo si no es futura (5 min), no tiene más de 48 h, no es anterior a otra marcación ya registrada, no está atrasada según la hora firmada y, si la cuenta tiene clave registrada, viene firmada por el chip (ver sección 15) | Si no, bastaría atrasar el reloj para parecer puntual | Cambiar la hora para «llegar a tiempo» |
| 5. Secuencia | Orden de la jornada: ingreso → salida a almorzar → regreso → salida. Fuera de orden o repetida: anomalía `duplicada` | Una jornada coherente | Saltarse o repetir marcaciones |
| 6. Rostro | **Detección de vida pasiva** (¿foto o pantalla?, mínimo 0.50) y **comparación** con los vectores guardados (similitud coseno, mínimo 0.40). Una foto mala (borrosa, oscura) se repite sin anomalía; un rostro que no coincide da `verificacion_fallida` y la marcación no se guarda | Confirmar que es la persona y que está presente | Que otra persona marque por ti; foto impresa o pantalla |
| 7. Zona | Distancia (Haversine) al centro de los bloques activos de la sede, o de la sede si no hay bloques | Comprobar que está en su lugar de trabajo | Marcar desde casa sin que quede constancia |
| 8. Guardar | La marcación queda **inmutable**: un trigger de la base impide borrarla y cambiar su hora, ubicación, tipo o motivo (solo se puede actualizar el resultado de la verificación facial diferida) | Es evidencia de auditoría | Alterar el registro después |
| 9. Anomalías | Se aplican las reglas de la tabla siguiente; cada una guarda **qué se midió y cuál era el límite** | Que cada aviso se pueda explicar y justificar | Decisiones sin evidencia |

**Beneficio general:** cada marcación queda con cuándo, dónde (con su precisión), con qué rostro, desde qué canal y qué reglas se activaron. Las reglas están escritas en código (no hay un modelo opaco), así que cada anomalía se explica con «pasó esto, el límite era aquello».

### 13.1 Las 12 anomalías (reglas escritas en código)

| Anomalía | Cuándo se revisa | Condición |
|---|---|---|
| `fuera_geocerca` | Al marcar | La ubicación está fuera del radio de su bloque o sede (no se genera si la sede permite marcar fuera) |
| `ubicacion_simulada` | Al marcar | Android informa GPS falso: no se registra la marcación |
| `duplicada` | Al marcar | Marcación repetida o fuera de la secuencia del día |
| `verificacion_fallida` | Al marcar | El rostro no coincide o no es una cara real |
| `fuera_horario` | Al marcar | Ingreso después de la hora de inicio más la tolerancia, o salida antes de la hora de fin menos la tolerancia |
| `dia_no_laborable` | Al marcar | Marcó en un feriado o en un día que no trabaja |
| `almuerzo_excedido` | Al marcar el regreso | El almuerzo dura más que el máximo más la tolerancia |
| `desplazamiento_inusual` | Al marcar | La velocidad entre dos marcaciones consecutivas supera el límite |
| `uso_recurrente_web` | Al marcar por web | Más de 3 marcaciones web en 30 días |
| `sin_ingreso` | Proceso periódico | Día laborable sin ninguna marcación |
| `sin_salida` | Proceso periódico | Terminó la jornada y no hay salida |
| `sin_regreso_almuerzo` | Proceso periódico | Hay salida a almorzar y no regreso |

### 13.2 Valores que el administrador puede ajustar desde el panel

| Valor | Por omisión | Qué controla |
|---|---|---|
| `tolerancia_min` | 10 min | Tolerancia de puntualidad |
| `almuerzo_max_min` | 60 min | Duración máxima del almuerzo |
| `velocidad_max_kmh` | 120 km/h | Límite del desplazamiento inusual |
| `max_marcaciones_web_30d` | 3 | Cuántas marcaciones web se toleran en 30 días |
| `max_horas_sin_conexion` | 48 h | Antigüedad máxima de una marcación sin conexión |
| `precision_max_app_m` / `precision_max_web_m` | 50 m / 200 m | Incertidumbre máxima de la ubicación en cada canal |
| `rostro_umbral` | 0.40 | Parecido mínimo entre la selfie y el rostro registrado |
| `rostro_umbral_registro` | 0.35 | Parecido mínimo entre las fotos del registro |
| `vida_umbral` | 0.50 | Probabilidad mínima de «rostro real» |
| `plazo_justificacion_h` / `plazo_revision_h` | 48 h / 48 h | Tiempo para justificar y para que el Administrador resuelva |

**Por qué se editan en el panel y no en el código:** cada sede puede necesitar valores distintos y se ajustan sin volver a desplegar. Cada cambio queda en la bitácora.

## 14. Ubicación y GPS: qué hicimos y por qué

| Qué hicimos | Cómo | Por qué | Beneficio |
|---|---|---|---|
| **El servidor decide si está dentro** | El cliente solo envía latitud, longitud y precisión; el microservicio calcula la distancia (Haversine) contra círculos de centro y radio | Si el celular dijera «estoy dentro», se podría falsear | El resultado no depende de lo que diga el cliente |
| **Zonas por bloque** | Cada sede puede tener bloques con su centro y radio; si hay bloques activos se mide contra ellos (si se traslapan, el de centro más cercano) | En un campus grande, solo los edificios de trabajo cuentan | Zona más exacta que un único círculo |
| **Ubicación fresca** | App: `expo-location` en alta precisión. Web: `enableHighAccuracy`, sin usar una posición guardada (`maximumAge: 0`) y espera de hasta 20 s. Si pasaron más de 90 s antes de enviar, se vuelve a medir | Evitar marcar con una posición vieja | La ubicación corresponde al momento de marcar |
| **Precisión mínima** | El equipo informa su incertidumbre (`±m`); si supera el límite del canal, el servidor rechaza antes de mirar el rostro | Un `±3811 m` no permite saber si la persona está en la sede | Se protege la **calidad** del dato de ubicación |
| **Dos límites distintos** | App 50 m y web 200 m, editables en el panel | El celular usa GPS (en las pruebas, ±8 m); el computador ubica por Wi-Fi o red (de ±150 m a más de ±3 km) | Cada canal tiene un límite realista |
| **Fuera del perímetro no bloquea** | Se puede marcar, pero queda la anomalía `fuera_geocerca` para revisión; la sede puede activar `permite_fuera_geocerca` para no generarla | Un GPS puede fallar con una persona honesta; bloquearla sería injusto | Menos falsos rechazos; una persona decide con evidencia |
| **Detección de GPS falso (Android)** | Si el celular informa ubicación simulada, no se registra y queda `ubicacion_simulada` | Las apps de GPS falso son el engaño más fácil | Bloquea el caso común |
| **Desplazamiento inusual** | Velocidad entre dos marcaciones consecutivas (distancia ÷ tiempo) contra 120 km/h | Detecta saltos imposibles que el aviso de GPS falso no ve | Segunda línea de defensa |
| **Web: contingencia con motivo** | El navegador no informa si el GPS es falso. Por eso la marcación web exige un motivo, queda con origen `web` y más de 3 en 30 días genera `uso_recurrente_web` | La web existe para cuando se pierde o daña el celular, no como atajo | Se puede usar, pero queda a la vista |
| **Evidencia guardada** | Cada marcación guarda latitud, longitud, `precision_m`, origen y celular, y no se puede modificar | Revisión posterior | Auditoría |

**Tres números que no hay que confundir:** (1) el **±8 m** es la incertidumbre que informa el propio equipo (no la calculamos nosotros); (2) la **distancia al centro** (por ejemplo 51 m) se compara con el **radio de la zona** (por ejemplo 80 m) para saber si está dentro; (3) el **límite de precisión** (50 o 200 m) es lo máximo de incertidumbre que se acepta para dejar marcar.

**Qué no podemos garantizar (dicho con claridad):** que las coordenadas vengan del GPS real si alguien con root manipula la app mientras corre (por ejemplo con Frida). En iPhone y en la web no existe el aviso de GPS falso. Lo limitan el desplazamiento inusual, el cifrado y la firma de lo guardado, y la revisión humana; la verificación de integridad del dispositivo (Play Integrity / App Attest) queda como trabajo futuro.

## 15. Marcar sin internet (app Android)

| Protección | Cómo funciona | Por qué | Beneficio |
|---|---|---|---|
| **Guardado local con id único** | La marcación se guarda en el celular con su UUID y se envía al volver la señal, en orden cronológico | Sin internet no se puede perder la marcación | No se duplica al reintentar |
| **Foto cifrada** | AES-256-GCM con una clave aleatoria de 256 bits guardada en `expo-secure-store` (Keystore / Keychain). Nonce aleatorio por foto y el id de la marcación atado al cifrado. Se descifra solo en memoria al enviar y se borra al enviarse | La selfie es un dato biométrico que pasa horas o días en el celular | Quien copie la base del celular no ve la foto; una foto no se puede pegar en otra marcación. Si no se puede cifrar, la marcación **no se guarda** |
| **Firma con el chip** | Al guardarla, se firma (ECDSA P-256) con una clave que vive en el chip de seguridad y no se puede sacar. El servidor la comprueba con la clave pública | Un celular con root podría editar la base local antes de enviar | Si se cambia la hora, la ubicación o la foto, la firma deja de valer y se rechaza (`firma_invalida`) |
| **Hora del servidor firmada** | Cada vez que la app consulta al servidor recibe su hora firmada y anota cuánto lleva encendido el celular. Al marcar sin conexión envía esas lecturas | Atrasar el reloj del celular para parecer puntual | La hora real no puede ser anterior a «hora firmada + tiempo encendido»; si lo es, se rechaza (`hora_invalida`) |
| **Topes de hora** | No futura (5 min de tolerancia), no más antigua que 48 h, no anterior a otra marcación ya registrada | Limitar el margen de engaño | Hora creíble |
| **Rostro al llegar** | El servidor verifica el rostro al sincronizar. Si falla, la marcación queda registrada como fallida con su anomalía; si la selfie no se puede analizar, queda pendiente para revisión humana | La persona ya no está para repetir la foto | Nada se pierde y nada pasa sin revisión |
| **Marca visible** | Todas se ven como «Sin conexión» en el historial y en el panel; `fecha_hora` (la del celular) y `created_at` (cuando llegó) quedan juntas | Transparencia | Evidencia de cuánto tardó en llegar |

**Qué protege y qué no:** el cifrado protege la confidencialidad de lo que hay en disco y la firma protege la integridad de lo guardado. Ninguno impide que alguien con root enganche la app mientras corre y le pida firmar datos falsos; eso corresponde a Play Integrity / App Attest (trabajo futuro). La hora firmada es una **cota inferior** (el contador de arranque no cuenta el reposo profundo y se reinicia al apagar), no la hora exacta.

## 16. Todo lo que se cifra o se firma

| Qué | Con qué | Dónde está la clave | Por qué |
|---|---|---|---|
| Vectores faciales | AES-256-GCM, nonce aleatorio de 12 bytes, id de la persona como dato asociado | `ROSTRO_CLAVE_AES` en Render | Son datos biométricos sensibles (LOPDP). Con el dato asociado, un cifrado copiado a otra fila no se abre |
| Llaves de IA | AES-256-GCM, igual que arriba | `ROSTRO_CLAVE_AES` en Render | Que ni un administrador ni quien lea la base vea la llave |
| Foto sin conexión en el celular | AES-256-GCM, id de la marcación como dato asociado | `expo-secure-store` del celular | Confidencialidad en disco |
| Marcación sin conexión | Firma ECDSA P-256 / SHA-256 | Chip del celular (la pública está en el servidor) | Integridad de lo guardado |
| Hora del servidor | HMAC-SHA256 | Derivada de `SUPABASE_SERVICE_ROLE_KEY` con un contexto propio | Que la app no pueda inventar la hora de referencia |
| Contraseñas | *Hash* en Supabase Auth | Supabase | Nadie, ni nosotros, puede leerlas |
| Tráfico | HTTPS (Render, Vercel y Supabase) | — | Nada viaja en claro |
| Sesión | JWT de ~1 h con renovación | Supabase | Sesión sin guardar la contraseña |

**El dato asociado (AAD) de AES-GCM** liga el cifrado a su dueño (la persona, la marcación): si alguien copia el texto cifrado a otra fila, el descifrado falla. Además, GCM detecta cualquier alteración.

## 17. Límites declarados (qué no cubre el sistema)

- **Root más Frida:** con el celular modificado se puede falsear lo que la app lee (GPS, hora) antes de cifrar o firmar. Respuesta: Play Integrity / App Attest, como trabajo futuro (exige Google Play, una cuenta de desarrollador y código nativo).
- **GPS falso en iPhone y en la web:** no existe el aviso. Se limita con el desplazamiento inusual, el motivo obligatorio y el tope de marcaciones web.
- **Vida pasiva:** ayuda contra fotos y pantallas, pero no es infalible. La detección activa (parpadeo o giro) queda como trabajo futuro.
- **Reloj sin conexión:** la hora firmada es una cota inferior; tras reiniciar el celular sin internet vale la hora del celular con las demás validaciones.
- **Varias sesiones web a la vez:** es el comportamiento normal de Supabase; lo acotan los 10 minutos de inactividad.
- **Plan gratuito de Render:** el servidor se duerme tras un rato sin uso y tarda unos 50 s en despertar; para una demostración conviene abrir `/health` antes.
- **Modelos de InsightFace:** son de uso académico y de investigación; hay que declararlo en la tesis.
- **Isolation Forest:** no está implementado; las anomalías se detectan con reglas. Queda como trabajo futuro cuando haya historial.
- **Sin envío en segundo plano:** las marcaciones pendientes se envían al abrir la app, al volver la señal y cada minuto mientras está abierta.

## 18. Preguntas probables y respuesta corta

- **¿Dónde está la clave que cifra los rostros y por qué ahí?** En la variable `ROSTRO_CLAVE_AES` de Render. Los rostros se descifran en el microservicio, y la clave está separada de la base de datos: robar la base no basta.
- **¿Qué pasa si roban la base de datos?** Los vectores faciales y las llaves de IA están cifrados con una clave que no está en la base; las contraseñas son *hashes*; las selfies no se guardan. Sí están en claro los datos de las marcaciones (hora, coordenadas) y los datos básicos de las personas.
- **¿Se guarda la foto de mi cara?** No. Con conexión se compara y se descarta. Sin conexión se guarda cifrada en el celular solo hasta enviarse y luego se borra. Del registro solo quedan los vectores, cifrados.
- **¿Qué pasa si se filtra la `service_role`?** Daría acceso total a la base. Solo vive en Render; si se filtra se regenera en Supabase y se actualiza allí.
- **¿Pueden marcar desde su casa?** Pueden marcar, pero queda la anomalía `fuera_geocerca` para revisión; la sede puede permitirlo. Lo que sí se bloquea es una ubicación demasiado imprecisa.
- **¿Y con una app de GPS falso?** En Android se detecta y no se registra. En iPhone y en la web no existe ese aviso; se limita con el desplazamiento inusual y la revisión humana.
- **¿Pueden marcar por otra persona?** Se necesita su rostro real (con detección de vida) y su celular vinculado; una foto o una pantalla se rechazan.
- **¿Y si cambian la hora del celular?** Con conexión se ignora: manda la hora del servidor. Sin conexión se valida con la hora firmada y el tiempo encendido.
- **¿Qué pasa sin internet?** Se guarda cifrada y firmada, y se envía al volver la señal; el servidor verifica rostro, hora y firma en ese momento.
- **¿Por qué existe la web?** Es el canal de contingencia (celular perdido, dañado o sin batería): exige un motivo, queda marcada y se limita a 3 por 30 días.
- **¿De dónde salen los límites de 50 m y 200 m?** Son valores provisionales editables en el panel; se calibran midiendo en cada sede (`docs/calibracion-precision-gps.md`).
- **¿Por qué la IA no decide?** Redacta, resume y sugiere una etiqueta; la decisión es de una persona. La aprobación automática existe pero está apagada (`IA_AUTOAPROBAR=false`).
- **¿Por qué no se usa Play Integrity?** Exige publicar en Google Play, una cuenta de Play Console, código nativo y un celular real. Queda como trabajo futuro y se declara como límite.
- **¿Es buena práctica que el panel esté abierto en varios navegadores?** Sí: es lo habitual (Gmail, banca). Se acota con el cierre por inactividad de 10 minutos; además marcar no depende de la sesión del navegador.

## 19. Normativa

Los vectores faciales son datos biométricos sensibles (LOPDP de Ecuador): solo se registran con consentimiento explícito, se guardan cifrados, no se escribe nada de ellos en la bitácora y se borran al desactivar a la persona.
