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
| App móvil | `frontend/app-movil` | 8081 | `npx expo start` | Login y marcación de asistencia en el celular (con Expo Go) |

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
ROSTRO_CLAVE_AES=<64 caracteres hexadecimales>
```

La clave del rostro la genera `levantar.ps1` si falta; a mano: `python -c "import secrets; print(secrets.token_hex(32))"` y pega el resultado. **Solo vive en el servidor**: si la pierdes, todos deben registrar su rostro de nuevo. Sin ella el microservicio no arranca (o pon `VERIFICACION_FACIAL=simulada` para saltarte el rostro mientras pruebas otra cosa).

Baja los modelos faciales (una vez, ~15 MB):

```powershell
python scripts\descargar_modelos.py
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
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
```

`EXPO_PUBLIC_API_URL` es la dirección del microservicio **vista desde el celular**: no puede ser `localhost` (para el celular, «localhost» es el propio celular). Averigua la IP de tu computador (`ipconfig` → «Dirección IPv4») y úsala aquí. Para que el celular llegue, el microservicio se arranca así (el `--host 0.0.0.0` es lo que lo deja visible en la red):

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Si Windows pregunta por el Firewall, permite Python en redes privadas. **Punto de control:** abre `http://<tu IP>:8000/health` en el navegador del celular → debe decir `{"estado":"ok"}`.

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
| 4 | Cuenta de rol **Usuario** | «Hola, <nombre>», el cuadro «Hoy · <día>» con las cuatro marcaciones en «Pendiente» y el aviso para vincular el celular (se prueba en 8.3.1) |
| 5 | Cierra la app del todo y ábrela de nuevo | Sigues dentro |
| 6 | «Cerrar sesión» | Vuelves al login |
| 7 | «Olvidé mi contraseña» con tu correo | Mensaje «Si el correo está registrado…» |

El botón azul de engranaje de arriba a la derecha **no es de la app**: es el menú de desarrollo de Expo Go.

#### 8.3.1 Pruebas de la marcación

Con una cuenta de rol **Usuario** que tenga sede asignada (y, para ver el caso «dentro de la zona», que la sede o su bloque cubra donde estás):

| # | Qué haces | Resultado esperado |
|---|---|---|
| 1 | Inicia sesión con «Ingresar y vincular» | Entras al Inicio con la barra de abajo (Inicio, Historial, Avisos, Perfil). Con el celular ya vinculado a la cuenta, solo falta el rostro: «Registrar mi rostro» y no hay botón de marcar |
| 2 | (Si no se vinculó al entrar) «Vincular este celular» | Sigue sin botón de marcar: falta el rostro |
| 2b | «Registrar mi rostro» → marca la casilla del consentimiento → «Continuar» → permite la cámara → toma 3 fotos («Usar esta foto») | «Tu rostro quedó registrado» y, al volver, aparece «Marcar ingreso». Si una foto sale borrosa u oscura, el mensaje dice cuál y la repites |
| 3 | Inicio: permite la ubicación | El chip dice «Dentro del perímetro» (o «Fuera…»), con el lugar, la distancia y el radio. «Marcar ingreso» → «Verifica tu identidad» |
| 4 | «Iniciar verificación facial» → permite la cámara → «Tomar foto» | «Analizando rostro…» y luego «Ingreso registrado · HH:MM» (hora de Ecuador) con sede, coordenadas y dispositivo; «Volver al inicio» / «Ver historial» |
| 4b | Que **otra persona** se tome la selfie de la marcación | «No pudimos verificar tu identidad», «Tu marcación de las HH:MM no se ha guardado», «Intento N» y «Reintentar verificación». No se guarda y queda la anomalía `verificacion_fallida` |
| 4c | Toma la «selfie» apuntando a una foto de tu cara en otra pantalla | Misma pantalla de «No pudimos verificar tu identidad»: no se guarda y queda la anomalía |
| 5 | Si estás lejos de la sede | El Inicio y el aviso previo dicen «Fuera del perímetro» pero dejan marcar; el resultado muestra el aviso amarillo «Estás fuera de la zona de tu sede» (la marcación sí se guarda) |
| 6 | Vuelve al inicio y abre Historial | El ingreso aparece con ✓ y la hora en «Tu jornada de hoy» y como «Última marcación»; el botón ahora dice «Marcar salida a almorzar». En Historial está agrupado por día con el lugar y «Sincronizado» |
| 7 | Repite hasta completar las cuatro | «Completaste tus cuatro marcaciones de hoy» |
| 8 | Cierra sesión y entra con **otra** cuenta en el mismo celular → «Vincular este celular» | Rechaza: «Este celular ya está vinculado a otra cuenta» |
| 9 | Apaga el Wi-Fi del celular y toma la foto | «No hay conexión con el servidor…»; al volver la red, «Reintentar» registra **una sola** marcación |
| 10 | Con una anomalía pendiente (ver abajo), mira la barra de abajo y abre Avisos | Punto ámbar en «Avisos»; la tarjeta «Anomalía detectada» con el caso, lo que detectó el sistema y «Te quedan … para explicarlo» |
| 11 | «Explicar» | Chat con el asistente («Detectamos lo siguiente… ¿Qué ocurrió?») y la caja «Tu respuesta» |
| 12 | Escribe menos de 10 caracteres y toca ↑ | «Escribe al menos 10 caracteres…», no se envía |
| 13 | Escribe una explicación real y toca ↑ | Tu mensaje aparece en el chat y la tarjeta «Enviado a revisión» (plazo en horas); el estado pasa a «En revisión» y desaparece la caja; en Avisos el caso ya está en «Anteriores» y se apaga el punto |

Para repetir la prueba 1 con la misma cuenta, desvincula el celular desde el panel: Usuarios → «✎ Editar» de esa persona → «Reiniciar celular vinculado» → «Sí, reiniciar». Ahí mismo puedes cambiarle la sede, el rol y el horario.

La verificación del rostro es real (compara con las fotos del registro), y una detección de vida **pasiva** que rechaza fotos tomadas a una pantalla o impresas (no es infalible: se declara como limitación de la tesis). Para repetir el registro: panel → Usuarios → «✎ Editar» → «Rostro» → «Resetear rostro». Las marcaciones hechas antes de existir la verificación real son de prueba; bórralas desde el SQL Editor antes de usar datos reales.

### 8.4b Crear una anomalía de prueba para justificar

La forma más simple (en el SQL Editor de Supabase; cambia el correo por el de tu cuenta de prueba):

```sql
insert into anomalias (usuario_id, tipo, detector, detalle)
select id, 'sin_salida', 'regla', 'Anomalía de prueba' from usuarios where email = 'correo@de.prueba';
```

El plazo (48 h por defecto) lo pone la base. Para probar el plazo vencido, agrega `fecha_vencimiento` con una hora pasada en el `insert`; el servidor la mostrará sin botón de justificar. Para limpiar, en este orden:

```sql
delete from mensajes_chat where justificacion_id in (select j.id from justificaciones j join anomalias a on a.id = j.anomalia_id where a.detalle = 'Anomalía de prueba');
delete from justificaciones where anomalia_id in (select id from anomalias where detalle = 'Anomalía de prueba');
delete from anomalias where detalle = 'Anomalía de prueba';
```
Antes de probar, aplica `supabase/migrations/0003_justificar.sql` y `0004_chat_ia.sql` si no lo has hecho.

**Chat con IA (opcional).** Sin llave en el `.env` del microservicio, justificar es un solo mensaje y el caso pasa a revisión. Con Gemini: crea la llave en https://aistudio.google.com/apikey y escribe en `.env` `IA_PROVEEDOR=gemini` y `GEMINI_API_KEY=<tu llave>` (con Claude: `IA_PROVEEDOR=anthropic` y `ANTHROPIC_API_KEY`). La llave la copias tú; no la pegues en el chat ni en git. Reinicia el microservicio y, en su consola, debe decir «Chat de justificación con IA activo (gemini)». Entonces prueba: (1) una explicación vaga («tuve un problema») → el asistente repregunta una vez; (2) pregúntale «¿cuánto es 1 + 1?» → responde el aviso fijo y no contesta; dos seguidos cierran el chat; (3) una explicación concreta de una falta menor (`sin_salida`, `fuera_horario`…) puede quedar «Justificada» sola; una de `fuera_geocerca` siempre llega a Talento Humano. En el panel (Anomalías) el caso muestra la etiqueta «IA: …» y el resumen.

### 8.5 Probar el proceso de ausencias (`sin_ingreso`, `sin_salida`, `sin_regreso_almuerzo`)

El proceso es un endpoint que se llama cada 30 minutos (en producción, con GitHub Actions). En local lo llamas tú. `levantar.ps1` genera `PROCESOS_SECRETO` en `backend\ia-microservicio\.env` si falta; añade tú las otras dos líneas para la prueba:

```
PROCESOS_SECRETO=<lo genera levantar.ps1>
AUSENCIAS_GRACIA_MIN=0
AUSENCIAS_DIAS_ATRAS=0
```

`GRACIA_MIN=0` y `DIAS_ATRAS=0` hacen que solo revise **hoy** y apenas termina la jornada (así no se llena de anomalías de días pasados de tus usuarios de prueba). Reinicia el microservicio tras cambiar el `.env`. Para que «hoy» ya haya terminado, edita la jornada de la cuenta de prueba en el panel (Usuarios → «✎ Editar») con una hora de salida que ya pasó, por ejemplo una hora atrás. Luego, en otra terminal, desde `backend\ia-microservicio`:

```powershell
$s = (Select-String -Path .env -Pattern '^PROCESOS_SECRETO=(.+)$').Matches[0].Groups[1].Value
Invoke-RestMethod -Method Post -Uri http://localhost:8000/procesos/ausencias -Headers @{ 'X-Proceso-Secreto' = $s }
```

| # | Situación de la cuenta de prueba hoy | Resultado esperado (`creadas`) |
|---|---|---|
| a | No marcó nada | `sin_ingreso: 1` |
| b | Solo marcó ingreso | `sin_salida: 1` |
| c | Ingreso y «salida a almorzar», sin regreso | `sin_regreso_almuerzo: 1` (y **no** `sin_salida`) |
| d | Las cuatro marcaciones | nada |
| e | Repites la llamada | `creadas` en 0 y `ya_registradas` sube: no duplica |

Las anomalías aparecen en la tabla `anomalias` con `detector = 'regla'` y `fecha_jornada`. Para repetir una prueba, bórralas en el SQL Editor: `delete from anomalias where fecha_jornada = current_date;`. Los feriados activos, los días que la persona no trabaja y el día en que se creó la cuenta no generan nada. Sin `PROCESOS_SECRETO` el endpoint responde 503; con un secreto distinto, 401.

**Producción:** define `PROCESOS_SECRETO` en Render y, en GitHub → Settings → Secrets and variables → Actions, `MICROSERVICIO_URL` y `PROCESOS_SECRETO`. El workflow `.github/workflows/ausencias.yml` corre cada 30 minutos (y a mano desde la pestaña Actions). Deja `AUSENCIAS_GRACIA_MIN=120` y `AUSENCIAS_DIAS_ATRAS=3`.

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
| El microservicio no arranca: «Falta ROSTRO_CLAVE_AES» o «No se pudieron cargar los modelos faciales» | Falta la clave en `.env` o no se bajaron los modelos | Pon `ROSTRO_CLAVE_AES` (ver sección 5) y ejecuta `python scripts\descargar_modelos.py` (`levantar.ps1` hace ambas cosas) |
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
