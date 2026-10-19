# App móvil — Asistencia Universitaria

React Native + **Expo** (Expo Router) con TypeScript. Es el canal principal del rol **Usuario**.
En esta fase incluye: **iniciar sesión**, sesión persistente, **olvidé mi contraseña**, pantalla de inicio y **cerrar sesión**.
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
| `EXPO_PUBLIC_WEB_URL` | URL del panel web, para el enlace del correo de «Olvidé mi contraseña». En desarrollo, la IP de tu computador (p. ej. `http://192.168.1.20:5173`); en producción, la URL de Vercel |

Después de cambiar el `.env.local`, reinicia con `npx expo start -c`.

## Scripts
- `npm test` — pruebas (Jest + Testing Library).
- `npm run typecheck` — revisa los tipos.
- `npx expo start` — servidor de desarrollo.

## Estructura
- `src/app/` — pantallas (Expo Router). **Aquí no van archivos de prueba**: cada archivo sería una ruta.
- `src/auth/` — sesión y perfil. `src/lib/` — Supabase y utilidades. `src/components/` y `src/theme/` — UI y tokens del mockup.
- Reglas: la app **solo lee** de Supabase; lo que se escribe pasa por el microservicio. Una cuenta de **Administrador** puede entrar, pero ve un aviso: el panel de gestión está en la web.
