# Levantar y probar el login (web y móvil) en tu computador

Guía paso a paso desde cero. Se puede seguir sola, o pasársela a Claude con este mensaje:

> «Guíame paso a paso con `PRUEBA-LOCAL.md` para levantar y probar el login web y móvil.»

---

## Para Claude (instrucciones al asistente que guía)

Si la persona te pidió guiarla con este archivo:

1. **Pregunta primero:** sistema operativo (Windows, Mac o Linux), si su celular es iPhone o Android, y qué rama del repositorio tiene (`git branch --show-current`).
2. **Un paso a la vez.** No pases al siguiente hasta que la persona confirme el *punto de control* («Deberías ver…»). Si algo falla, busca el error en la sección 9 antes de improvisar.
3. **Secretos:** pide que pegue en el chat solo la *salida de los comandos* o el *mensaje de error*. Nunca pidas ni aceptes en el chat la `service_role key` ni contraseñas: la persona las escribe ella misma en el archivo `.env`.
4. Los comandos están escritos para **PowerShell (Windows)**; para Mac/Linux usa el equivalente que se indica en cada paso.
5. **No cambies código** para «hacer que funcione». Si el error no está en la sección 9, resume el error (mensaje exacto + en qué paso ocurrió) y dile que se lo pase a Susana.
6. Lo marcado como **A mano** lo hace la persona (crear cuentas, instalar apps, escanear el QR, abrir correos, copiar claves). Indícaselo; no intentes hacerlo por ella.

---

## 1. Qué vas a levantar

| Parte | Carpeta | Puerto | Comando | Para qué sirve |
|---|---|---|---|---|
| Base de datos y Auth | (Supabase, en la nube) | — | no se levanta | Guarda los datos y valida el inicio de sesión |
| Microservicio | `backend/ia-microservicio` | 8000 | `uvicorn …` | Invita usuarios, guarda sedes y bloques |
| Panel web | `frontend/panel-web` | 5173 | `npm run dev` | Login web, panel `/admin` |
| App móvil | `frontend/app-movil` | 8081 | `npx expo start` | Login en el celular (con Expo Go) |

Cada parte corre en **su propia terminal** y se deja abierta. Para *solo iniciar sesión* no hace falta el microservicio; sí hace falta para invitar usuarios y para sedes y bloques.

---

## 2. Requisitos (se hacen una sola vez)

**A mano:** instalar lo que falte y comprobarlo.

| Qué | Cómo comprobar | Debe mostrar |
|---|---|---|
| Git | `git --version` | `git version 2.x` |
| Node.js 22 (LTS) | `node -v` | `v22.x.x` |
| Python 3.11 o más | `python --version` (en Windows, si no existe: `py --version`) | `Python 3.11` o superior |
| Expo Go en el celular | App Store o Play Store, buscar «Expo Go» | la app instalada |
| Cuenta de Expo (gratis) | https://expo.dev/signup | cuenta creada |

---

## 3. Datos que debes pedirle a Susana

Pídelos por mensaje directo o gestor de contraseñas. **No** los subas al repositorio ni los pegues en el chat de un asistente.

| Dato | Se usa en | ¿Secreto? |
|---|---|---|
| URL del proyecto (`https://xxxx.supabase.co`) | microservicio, web, móvil | No |
| Clave pública (`sb_publishable_…` o «anon») | web, móvil | No (es pública por diseño) |
| `service_role key` | **solo** el microservicio | **Sí, muy secreta.** Nunca en web, móvil, repositorio ni chat |

(Susana los encuentra en Supabase → Project Settings → API.)

---

## 4. Obtener el código

```powershell
git clone <URL del repositorio>        # solo si todavía no lo tienes
cd sistema-asistencia-unemi
git fetch
git checkout <rama>
git pull
```

`<rama>`: la que indique Susana. Mientras sus cambios no estén unidos, es `dev_salan`; cuando se unan, `desarrollo`.

Después de **cada** `git pull`, repite `npm install` (web y móvil) y `pip install -r requirements.txt` (microservicio): pueden haber librerías nuevas.

---

## 5. Microservicio

```powershell
cd backend\ia-microservicio
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Mac/Linux: `source .venv/bin/activate` y `cp .env.example .env`.

**A mano:** abre `.env` en un editor y completa (deja las otras dos líneas como están):

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<la service_role key>
```

Arranca:

```powershell
uvicorn app.main:app --reload --port 8000
```

**Punto de control:** abre http://localhost:8000/health → debe decir `{"estado":"ok"}`. En http://localhost:8000/docs se ven los endpoints de usuarios, sedes y bloques. Deja esta terminal abierta.

---

## 6. Panel web

En **otra terminal**:

```powershell
cd frontend\panel-web
npm install
Copy-Item .env.example .env.local
```

**A mano:** completa `.env.local`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<la clave pública>
VITE_API_URL=http://localhost:8000
```

Arranca:

```powershell
npm run dev
```

**Punto de control:** http://localhost:5173 muestra la pantalla de inicio de sesión. Si dice «Port 5173 is in use», cierra el otro `npm run dev`: los enlaces de los correos apuntan al puerto 5173.

---

## 7. Aceptar la invitación y probar el login web

**Si te invitaron como administradora** (te llegó un correo de Supabase): el enlace abre `http://localhost:5173/aceptar-invitacion`. **Solo funciona mientras el panel web (paso 6) esté corriendo en el mismo computador donde abres el correo.**

1. **A mano:** abre el correo y el enlace desde ese computador. Crea tu contraseña (mínimo 8 caracteres, con letras y números).
2. Entras a `/admin`.
3. Si el enlace venció o dice «localhost refused to connect»: pídele a Susana que use **Usuarios → ✉ Reenviar invitación**, o ve a «¿Olvidaste tu contraseña?» en el login si tu cuenta ya estaba activa.

**Pruebas del login web** (marca cada una):

| # | Qué haces | Resultado esperado |
|---|---|---|
| 1 | Correo correcto + contraseña incorrecta | «Correo o contraseña incorrectos» (el mismo mensaje si el correo no existe) |
| 2 | Correo y contraseña correctos (administradora) | Entra a `/admin`; menú con Dashboard, Usuarios y Sedes y bloques |
| 3 | Recarga la página (F5) | Sigues dentro |
| 4 | «Cerrar sesión» (abajo a la izquierda del menú) | Vuelves a `/login`. Si luego escribes `/admin` sin sesión, te devuelve a `/login` |
| 5 | «¿Olvidaste tu contraseña?» con tu correo | Mensaje «Si el correo está registrado, recibirás un enlace…». Llega un correo (puede tardar; revisa el spam). El enlace abre `/restablecer-contrasena` y exige 8+ caracteres con letras y números |
| 6 | Mira el login | No ofrece «crear cuenta» (no hay registro público) |
| 7 | Con una cuenta de rol **Usuario** (hace falta una sede creada) | Entra a `/usuario`; si escribe `/admin`, la devuelve a `/usuario` |
| 8 | Con una cuenta sin perfil o desactivada | No entra al panel («Cuenta no habilitada» o error de inicio de sesión) |

---

## 8. App móvil

### 8.1 Cuenta de Expo en el computador y en el celular (una sola vez)

Expo Go exige tener la sesión de Expo iniciada **en los dos lados con la misma cuenta**.

1. **A mano:** si te registraste con Google, no tienes contraseña de Expo. Créala en https://expo.dev/reset-password.
2. En la terminal: `npx expo login`. Usa tu **nombre de usuario** de Expo (no el correo) y esa contraseña.
3. **A mano:** en Expo Go (celular) → pestaña de perfil → iniciar sesión con la misma cuenta. Usa el inicio de sesión normal; **no** el de «SSO» (pide un «Organization name» y es solo para empresas: toca «Go back»).

### 8.2 Configurar

En **otra terminal**:

```powershell
cd frontend\app-movil
npm install
Copy-Item .env.example .env.local
```

**A mano:** completa `.env.local` (la clave es la **pública**, nunca la `service_role`):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<la clave pública>
EXPO_PUBLIC_WEB_URL=http://localhost:5173
```

### 8.3 Arrancar y abrir en el celular

```powershell
npx expo start -c
```

1. El celular y el computador deben estar en la **misma red Wi-Fi**.
2. **A mano:** iPhone → abre la cámara y escanea el QR. Android → Expo Go → «Scan QR code».
3. La primera carga puede tardar hasta un minuto.

Si no conecta (la Wi-Fi de la universidad suele bloquear la comunicación entre dispositivos): `npx expo start --tunnel` (si pide instalar `@expo/ngrok`, responde que sí), o conecta el computador al punto de acceso («hotspot») del celular. Si Windows pregunta por el Firewall, permite Node.js en redes privadas.

El proyecto usa **Expo SDK 57**: tu Expo Go debe ser de esa versión (hoy, la 57.x de las tiendas).

**Pruebas del login móvil:**

| # | Qué haces | Resultado esperado |
|---|---|---|
| 1 | Abre la app | Pantalla «Asistencia Universitaria» con correo y contraseña |
| 2 | Contraseña incorrecta | «Correo o contraseña incorrectos» |
| 3 | Cuenta de **administrador** | «Hola, <nombre>», etiqueta «Administrador» y un aviso amarillo: el panel de gestión está en la web. **Es lo esperado, no un error** |
| 4 | Cuenta de rol **Usuario** | «Hola, <nombre>» y el aviso «Próximamente: aquí podrás vincular tu dispositivo…» |
| 5 | Cierra la app del todo y ábrela de nuevo | Sigues dentro |
| 6 | «Cerrar sesión» | Vuelves al login |
| 7 | «Olvidé mi contraseña» con tu correo | Mensaje «Si el correo está registrado…» |

El botón azul de engranaje de arriba a la derecha **no es de la app**: es el menú de desarrollo de Expo Go.

### 8.4 (Opcional) Restablecer la contraseña abriendo el correo en el celular

El enlace del correo apunta a un sitio web, y el celular no entiende `localhost`. Para probarlo desde el celular:

1. Averigua la IP de tu computador (`ipconfig` → «Dirección IPv4», por ejemplo `192.168.1.20`).
2. Pon `EXPO_PUBLIC_WEB_URL=http://192.168.1.20:5173` en `.env.local` y reinicia con `npx expo start -c`.
3. Arranca el panel web con `npm run dev -- --host`.
4. Susana agrega `http://192.168.1.20:5173/**` en Supabase → Authentication → URL Configuration → Redirect URLs.

Más simple: prueba el restablecimiento desde la web (prueba 5 de la sección 7).

---

## 9. Problemas frecuentes

| Lo que ves | Causa | Solución |
|---|---|---|
| `Failed to fetch` al crear usuario o sede | El microservicio está apagado o `VITE_API_URL` está mal | Levanta el paso 5; revisa `VITE_API_URL`; reinicia `npm run dev` |
| «No se pudo cargar la lista de…» | Claves mal en `.env.local`, sesión vencida, o tu cuenta no es administradora activa | Revisa URL y clave; reinicia `npm run dev`; vuelve a iniciar sesión |
| Pantalla roja de Vite «Failed to resolve import "…"» | Faltan librerías tras un `git pull` | `npm install` y reinicia `npm run dev` |
| «localhost refused to connect» al abrir un enlace del correo | El panel web no está corriendo en el equipo donde abriste el enlace (o lo abriste en el celular) | Abre el correo en el computador con `npm run dev` activo |
| Los correos no llegan o dice «límite de correos» | El correo por defecto de Supabase permite muy pocos envíos por hora | Espera unos 60 minutos, revisa el spam y no insistas. El SMTP propio está pendiente |
| El enlace de invitación venció | Los enlaces caducan | Susana: Usuarios → ✉ Reenviar invitación |
| Expo Go: «Project is incompatible with this version of Expo Go» | Expo Go no es de la misma versión que el proyecto (SDK 57) | Actualiza Expo Go. Si ya es la última, avisa a Susana: se debe alinear la versión del proyecto |
| Expo Go: «You need to be signed in to Expo Go and Expo CLI» | Falta iniciar sesión en uno de los dos lados | Sección 8.1 (misma cuenta en terminal y celular) |
| Expo Go: «Log in to Expo with SSO / Organization name» | Entraste por el inicio de sesión de empresas | Toca «Go back» y usa el normal |
| `npx expo login`: «Your username, email, or password was incorrect» | Cuenta creada con Google, sin contraseña | https://expo.dev/reset-password y usa el nombre de usuario |
| Expo Go no conecta o se queda cargando | Redes distintas, Wi-Fi que bloquea, o Firewall | Misma Wi-Fi; `npx expo start --tunnel`; o hotspot del celular; permite Node.js en el Firewall |
| `Remove-Item … No se puede encontrar una parte de la ruta` al borrar `node_modules` | Rutas largas de Windows | No hace falta borrarlo: `npm install` basta. Si lo necesitas: `npx rimraf node_modules` |
| PowerShell: «la ejecución de scripts está deshabilitada» al activar el entorno de Python | Política de PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, abre una terminal nueva |
| «Cuenta no habilitada» | La cuenta no tiene fila en `usuarios` o está inactiva | Avisa a Susana |
| Cambiaste un `.env` y no pasa nada | Los `.env` se leen al arrancar | Reinicia: web `Ctrl+C` y `npm run dev`; móvil `npx expo start -c`; microservicio `Ctrl+C` y `uvicorn …` |
| El mapa sale gris o el buscador de lugares no responde | Los mosaicos y el buscador necesitan internet; el buscador público tiene uso razonable | Revisa la conexión; mientras, elige el punto con el mapa o escribe las coordenadas |

---

## 10. Pruebas automáticas (opcional, recomendado antes de un Pull Request)

```powershell
cd backend\ia-microservicio ; python -m pytest -q
cd ..\..\frontend\panel-web ; npm test
cd ..\app-movil            ; npm test ; npm run typecheck
```

Todas deben pasar (sin «failed»). Las del microservicio se corren desde el repositorio completo: una de ellas compara el código con `supabase/migrations/0001_init.sql`.

---

## 11. Configuración de Supabase (la hace Susana una sola vez, es del proyecto y no de cada computador)

- [ ] Authentication → URL Configuration: *Site URL* `http://localhost:5173` y, en *Redirect URLs*, `http://localhost:5173/**` (y la URL de Vercel cuando exista).
- [ ] Authentication → Sign In / Providers: desactivar «Allow new users to sign up» (solo entra quien fue invitado).
- [ ] Authentication → Sign In / Providers → Email: contraseña mínima de 8 caracteres (y «letras y números», si aparece la opción).
- [ ] Pendiente: SMTP propio y plantillas de correo en español (`docs/pasos-manuales.md`, sección 1).

---

## 12. Reglas que no se rompen

- Los archivos `.env` y `.env.local` **no se suben a Git** (ya están en `.gitignore`). Antes de un `git add`, comprueba con `git status` que no aparezcan.
- La `service_role key` vive **solo** en `backend/ia-microservicio/.env`. Nunca en el panel web, en la app móvil ni en un mensaje.
- Si una clave se expuso por error (se subió, se pegó en un chat), avisa a Susana para rotarla en Supabase.
