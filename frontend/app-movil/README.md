# App móvil — Asistencia Universitaria

React Native + **Expo** (Expo Router) con TypeScript. Es el canal principal del rol **Usuario**.
En esta fase incluye: **iniciar sesión**, sesión persistente, **olvidé mi contraseña**, **vincular el celular**, **registrar el rostro** (consentimiento + 3 fotos guiadas, una sola vez), **marcar asistencia** (ubicación GPS + selfie) y **cerrar sesión**.
Sin rostro registrado la app no deja marcar. El servidor verifica la selfie contra el rostro registrado con detección de vida pasiva (rechaza fotos de pantalla o impresas).
La contraseña se crea (invitación) o se restablece en el **panel web**; la app solo inicia sesión.

## Cómo verla en tu celular (sin cables)
1. Instala **Expo Go** en el celular (Play Store / App Store).
2. El computador y el celular deben estar en la **misma red Wi-Fi**.
3. Configura las variables (abajo) y ejecuta:
   ```bash
   npm install
   npx expo start
   ```
4. Escanea el código QR con Expo Go (en iPhone, con la cámara). Cada cambio que guardes se recarga solo.
5. Si la red no los deja verse (por ejemplo, la de la universidad): `npx expo start --tunnel`.

## Variables de entorno
Copia `.env.example` como **`.env.local`** (no se sube a Git) y completa:

| Variable | Qué es |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | URL del proyecto de Supabase |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clave pública (publishable/anon) — nunca la `service_role` |
| `EXPO_PUBLIC_API_URL` | URL del microservicio **vista desde el celular**: en desarrollo, la IP de tu computador (p. ej. `http://192.168.1.20:8000`, con el microservicio arrancado con `--host 0.0.0.0`); en producción, la URL de Render |
| `EXPO_PUBLIC_WEB_URL` | URL del panel web, para el enlace del correo de «Olvidé mi contraseña». En desarrollo, la IP de tu computador (p. ej. `http://192.168.1.20:5173`); en producción, la URL de Vercel |

Después de cambiar el `.env.local`, reinicia con `npx expo start -c`.

## Scripts
- `npm test` — pruebas (Jest + Testing Library).
- `npm run typecheck` — revisa los tipos.
- `npx expo start` — servidor de desarrollo.

## Estructura
- `src/app/` — pantallas (Expo Router). **Aquí no van archivos de prueba**: cada archivo sería una ruta.
- Pantallas del mockup (`Asistencia Universitaria 4.0 Completo.html`): `src/app/login.tsx` (M1, «Ingresar y vincular»: al entrar deja este celular como el de marcación), cuatro **pestañas** con la barra inferior de `src/components/BarraInferior.tsx` (`src/app/(app)/_layout.tsx`): `index.tsx` Inicio (M2: perímetro, diagrama de la geocerca, botón de la marcación que toca, jornada, última marcación), `historial.tsx` (M4: últimos 7 días por día), `avisos.tsx` (M5: anomalías por explicar y anteriores; punto ámbar en la pestaña si hay alguna) y `perfil.tsx` (no está en el mockup: perfil y cerrar sesión).
- Pantallas a pantalla completa, sin barra: `marcar.tsx` (M3: aviso previo → cámara con óvalo → «Analizando rostro…» → registrada, o «No pudimos verificar tu identidad» con el número de intento), `justificar.tsx` (M6: chat con el asistente, que con IA repregunta una vez y muestra «Escribiendo…»; termina en «Enviado a revisión», o «Justificación aceptada» si fue aprobación automática) y `registro-rostro.tsx` (consentimiento → 3 fotos; no está en el mockup). Lo que se puede justificar lo decide el servidor (`puede_justificar`); la app solo lo respeta. Marcar fuera de la zona está permitido (queda la observación), por eso el inicio avisa pero no bloquea el botón.
- `src/lib/offline/` — **marcación sin conexión**: `almacen.ts` (SQLite: cola `marcaciones_pendientes` y copia del estado de hoy), `reglasLocales.ts` (qué marcación toca según lo ya hecho y lo pendiente), `sincronizador.ts` (envío en orden, un solo envío a la vez, clasifica los errores en reintentar / descartar), `SincronizacionContext.tsx` (NetInfo, app abierta, reintento cada minuto, «Sincronizar ahora»). Sin red, `marcar.tsx` guarda la marcación y `useEstadoHoy` muestra la última copia. Solo con la app abierta; el envío en segundo plano necesita una build de desarrollo / APK.
- `src/auth/` — sesión y perfil. `src/lib/` — Supabase, llamadas al microservicio (`api.ts`), identificador del celular, ubicación y utilidades de marcación. `src/components/` y `src/theme/` — UI y tokens del mockup.
- Reglas: lo que se escribe (marcaciones, vincular el celular) pasa por el microservicio; la secuencia del día y la zona las decide el servidor, la app solo muestra el resultado. La marcación lleva un `id` fijo por intento: si falla la red y se reintenta, no se duplica. Una cuenta de **Administrador** puede entrar, pero ve un aviso: el panel de gestión está en la web.
