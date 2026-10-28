# Tecnologías del sistema

Resumen puntual de qué se usa y para qué. Para el detalle de las reglas, ver `docs/logica-negocio.md`; para los valores ajustables, `PARAMETROS-Y-DATOS.md`.

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
| Qué no hace | No detecta anomalías (eso lo hacen reglas escritas en código) ni decide solo: aprueba automáticamente solo faltas menores con confianza ≥ 0.9; el resto lo decide el administrador |
| Si no hay llave o falla | El chat sigue y el caso pasa a revisión humana |

## 6. Ubicación y mapas

| Qué | Con qué |
|---|---|
| GPS en el celular | `expo-location` (alta precisión; en Android informa si la posición es simulada) |
| Ubicación en la web (marcación de contingencia) | API del navegador `navigator.geolocation` (alta precisión; exige https o localhost; no puede detectar GPS falso) |
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

| Qué | Con qué |
|---|---|
| Microservicio | **Docker** (`Dockerfile`) en **Render** (los modelos faciales se descargan al construir la imagen). En desarrollo se corre con `uvicorn`, sin Docker |
| Panel web | Vercel o Netlify (capa gratuita) |
| Base de datos y login | Supabase |
| Proceso periódico de ausencias | **GitHub Actions** (`ausencias.yml`, cada 30 min) llama a `POST /procesos/ausencias` con un secreto |
| Pruebas automáticas | GitHub Actions (`ci.yml`) |
| Código | Git y GitHub |

## 12. Normativa

Los vectores faciales son datos biométricos sensibles (LOPDP de Ecuador): solo se registran con consentimiento explícito, se guardan cifrados, no se escribe nada de ellos en la bitácora y se borran al desactivar a la persona.
