# Publicar para la demostración (Render + APK)

Objetivo: que cualquier persona (el tutor, por ejemplo) pueda instalar la APK y marcar desde su celular, sin estar en tu red.
Sirve para mostrar el flujo de marcación; el panel web (Vercel) se publica aparte (`docs/pasos-manuales.md`, sección 4).

## 0. Qué se publica y qué se actualiza después
- **Microservicio (Render):** cada vez que subes cambios a la rama conectada, Render vuelve a desplegar solo. La APK no cambia.
- **App (APK):** cualquier cambio en la app exige compilar una APK nueva y pasarla otra vez.
- **Base de datos:** es tu mismo Supabase. Lo que marque otra persona queda en tus datos reales: crea un usuario de prueba para el tutor.

## 1. Microservicio en Render (≈15 min)
1. Sube el código a GitHub y crea la rama `despliegue` a partir de la que uses (Render despliega esa rama).
2. render.com → **New → Blueprint** → elige el repositorio. Lee `render.yaml` (Docker, `backend/ia-microservicio`). Si prefieres a mano: **New → Web Service**, *Root Directory* `backend/ia-microservicio`, *Runtime* Docker, rama `despliegue`, *Health Check Path* `/health`.
3. En **Environment** escribe los valores (los de tu `.env` local):
   | Variable | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://trdbzphvoloqlnbgimbf.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | la *service_role* de Supabase (Settings → API). Solo en Render |
   | `ROSTRO_CLAVE_AES` | **la MISMA que usas en tu `.env` local** (64 caracteres hexadecimales). Si pones otra, los rostros ya registrados no se podrán leer |
   | `PROCESOS_SECRETO` | un secreto cualquiera de 64 caracteres (`python -c "import secrets; print(secrets.token_hex(32))"`) |
   | `URL_PANEL_WEB` y `CORS_ORIGINS` | la URL del panel en Vercel (o `http://localhost:5173` mientras tanto) |
   | `GEMINI_API_KEY` | tu llave, si quieres el chat con IA |
4. Espera a que termine el despliegue y abre `https://TU-SERVICIO.onrender.com/health`: debe responder que está bien. **Copia esa URL**, la necesitas en el paso 2.
5. Plan gratuito: se duerme tras unos minutos sin uso y la primera petición tarda cerca de un minuto. Antes de una demostración abre `/health` para despertarlo. Si la memoria (512 MB) se queda corta con los modelos de rostro, sube a Starter.

## 2. APK instalable (EAS Build, ≈20 min la primera vez)
1. En `frontend/app-movil`: `npm install -g eas-cli`, luego `eas login` (cuenta de expo.dev) y `eas init` (crea el proyecto en Expo y escribe su id en `app.json`).
2. Crea las variables del entorno **preview** (valores públicos; NO se guardan en el repositorio). En expo.dev → tu proyecto → *Environment variables* → *Create*, entorno `preview`, visibilidad *Plain text*:
   | Variable | Valor |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | `https://trdbzphvoloqlnbgimbf.supabase.co` |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | la clave `sb_publishable_…` de tu `.env.local` |
   | `EXPO_PUBLIC_API_URL` | la URL de Render del paso 1.4, **sin** barra final |
   | `EXPO_PUBLIC_WEB_URL` | la URL del panel en Vercel (para el enlace de «Olvidé mi contraseña») |
   El valor queda dentro de la APK al compilar: si cambia la URL de Render, hay que compilar otra APK.
3. Compila: `eas build --profile preview --platform android`. Al terminar te da un enlace y un código QR para descargar la **APK**.
4. Pásala por WhatsApp, Drive o USB. Quien la instale debe permitir «instalar apps de fuentes desconocidas» y, si Play Protect avisa, tocar «Instalar de todos modos».

## 3. Preparar la demostración con el tutor
1. En el panel crea un **usuario de prueba** (correo del tutor o uno tuyo), asígnale sede y horario.
2. Esa persona abre la APK, entra, registra su rostro y **vincula** el celular. Con internet, deja abierto el Inicio unos segundos: ahí la app registra la clave del chip y descarga la hora firmada.
3. Para mostrar la marcación sin conexión: modo avión → marcar → quitar el modo avión → ver cómo se registra con su hora original en el panel.
4. Despierta el servidor (`/health`) un par de minutos antes.

## Lo que NO funciona en esta modalidad
- La revisión de la base local con `adb run-as` (prueba 20c de `PRUEBA-LOCAL.md`): solo sirve con una compilación de depuración (`npx expo run:android`). Para mostrar el cifrado a un tribunal, usa esa.
- Marcar sin conexión desde Expo Go: sin el módulo nativo no hay firma.
