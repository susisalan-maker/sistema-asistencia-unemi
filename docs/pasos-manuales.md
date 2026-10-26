# Pasos manuales (fuera del código)

Esto no lo resuelve el código — son cuentas y configuraciones que se hacen una sola vez, a mano, antes o durante el desarrollo. Pásale este archivo a Claude Code junto con `plan-tecnico-arquitectura.md` y `logica-negocio.md` para que sepa qué asumir como ya resuelto y qué debe pedirte que hagas tú.

## 1. Supabase
- Crear cuenta en supabase.com y un proyecto nuevo (región cercana, ej. South America).
- Guardar: `Project URL`, `anon public key`, `service_role key` (esta última nunca va en el frontend ni en el repo).
- Ejecutar `supabase/migrations/0001_init.sql` en el SQL Editor (o con la CLI de Supabase). Si ya habías ejecutado una versión anterior en un proyecto de pruebas, ejecuta antes `0000_reset.sql` (borra las tablas del proyecto; no lo uses con datos reales).
- Después de ejecutarlo, en Table Editor comprobar que `rostros` tenga **RLS activado y ninguna política**: así ni la app ni el panel pueden leerla (solo el microservicio, con la `service_role key`).
- Aplicar `supabase/migrations/0002_ausencias.sql` (SQL Editor). La extensión **pg_cron** ya no es necesaria: `marcar_sin_justificar()` la llama el proceso de ausencias.
- Aplicar `supabase/migrations/0003_justificar.sql` (SQL Editor): crea `justificar_anomalia()`, que solo puede llamar el microservicio.
- Aplicar las migraciones siguientes en orden (`0004` a `0011`). La **0011** (`0011_cerrar_sesiones.sql`) crea la función `cerrar_sesiones_usuario`, que usa «Reiniciar celular vinculado» para cerrar las sesiones abiertas de la cuenta; sin ella, reiniciar un celular falla. La **0010** (`0010_marcacion_sin_conexion.sql`) añade `marcaciones.sin_conexion` y `configuracion.max_horas_sin_conexion` para la marcación sin conexión; es segura si se corre dos veces.
- Definir `PROCESOS_SECRETO` en el servidor (Render) y, en GitHub → Settings → Secrets → Actions, `MICROSERVICIO_URL` y `PROCESOS_SECRETO` (el mismo valor) para que `.github/workflows/ausencias.yml` corra cada 30 minutos.
- En Authentication → Providers → Email, **desactivar el registro público** (los usuarios los crea el Administrador, que los invita por correo) y dejar activa la confirmación por correo.
- En Authentication → Sign In / Providers, fijar la **contraseña mínima en 8 caracteres** con letras y números.
- En Authentication → URL Configuration, agregar las **URL de redirección permitidas**: `http://localhost:5173/aceptar-invitacion`, `http://localhost:5173/restablecer-contrasena` y las mismas rutas del dominio de producción cuando exista (5173 es el puerto de Vite; ajustar si cambia).
- **Configurar un SMTP propio** (Authentication → SMTP Settings; por ejemplo Resend, capa gratuita). El correo por defecto de Supabase permite muy pocos envíos por hora y no alcanza ni para el piloto.
- En Authentication → Email Templates, **traducir al español** las plantillas «Invite user» y «Reset password».
- **Crear el primer Administrador a mano**, porque nadie puede darlo de alta todavía: crear el usuario en Authentication → Users, copiar su `id` y ejecutar un `insert into usuarios (id, nombres, apellidos, email, rol) values ('<id>', '<nombres>', '<apellidos>', '<correo>', 'administrador');`.
- Crear una sede de prueba, uno o dos bloques dentro de ella (desde el panel, con el mapa) y un usuario de prueba para la demo.

## 2. OpenAI
- Crear cuenta en platform.openai.com.
- Cargar saldo prepago (mínimo ~$5 USD) para activar la facturación por uso.
- Generar una API key y guardarla fuera del repo.

## 3. Render (hosting del microservicio de IA)
- Crear cuenta y conectar el repositorio de GitHub; como *Root Directory* indicar `backend/ia-microservicio` (usa su `Dockerfile`) y desplegar desde la rama `despliegue`.
- Activar el plan Starter (~$5-7 USD/mes) recién en las últimas semanas de pruebas, no desde el día 1.
- Configurar ahí las variables de entorno (URL y `service_role key` de Supabase, key de OpenAI y **`ROSTRO_CLAVE_AES`**, la clave de cifrado de los rostros).
- **Generar la clave de cifrado** (una sola vez, en tu computadora): `openssl rand -base64 32` (o, con Python: `python3 -c "import secrets,base64;print(base64.b64encode(secrets.token_bytes(32)).decode())"`). Pegarla en Render como `ROSTRO_CLAVE_AES`; **nunca** en el repositorio, en el frontend ni en la base de datos.
- **Respaldar esa clave en un lugar seguro y aparte** (por ejemplo, un gestor de contraseñas). Si se pierde, los rostros guardados no se pueden recuperar y hay que volver a registrarlos. Para rotarla en el futuro, la columna `rostros.version_clave` indica con qué versión de la clave se cifró cada registro.
- Descargar los modelos de rostro (embeddings y detección de vida, formato ONNX): `python scripts/descargar_modelos.py` los baja a `backend/ia-microservicio/modelos/` (el Dockerfile lo hace al construir). Aviso de licencia: los modelos preentrenados de InsightFace son gratuitos para investigación y uso académico, pero no para uso comercial.
- Antes de contratar el plan, medir la memoria que usa el microservicio con el modelo de rostro cargado (modelo de rostro + antispoofing en ONNX); si se queda corto, hay que subir de plan.

## 4. Vercel o Netlify (hosting del panel web)
- Crear cuenta y conectar el repositorio; como *Root Directory* indicar `frontend/panel-web` y desplegar desde la rama `despliegue`.
- Configurar variables de entorno (URL y anon key de Supabase, y la URL del microservicio).
- La misma publicación sirve las rutas `/admin` y `/usuario` (contingencia); no se despliegan dos sitios.

## 5. Expo / EAS (app móvil)
- Crear cuenta en expo.dev.
- Instalar Expo Go en el celular de prueba (para correr la app sin compilar mientras desarrollan).
- Configurar EAS Build más adelante, cuando quieran generar el APK/IPA instalable para la sustentación.

## 6. Consentimiento biométrico (LOPDP)
- Redactar el texto del consentimiento para el registro del rostro (qué se guarda —solo una representación matemática cifrada, nunca la foto—, para qué, por cuánto tiempo —se borra al desactivar al usuario—, cómo pedir que se elimine) y revisarlo con la directora de tesis. Claude Code lo pondrá en la pantalla, pero el contenido legal lo definen ustedes.
- Reunir a los 10 voluntarios del piloto y registrar su rostro con consentimiento antes de las pruebas.

## 7. GitHub
- Crear el repositorio con la estructura ya definida y agregar a las 2 desarrolladoras como colaboradoras.

## Nota para Claude Code
Todas las keys y URLs van en variables de entorno (`.env`), nunca escritas directo en el código ni subidas al repo. La `service_role key` solo la usa el microservicio; jamás va en la app móvil ni en la web. Los clientes solo leen de Supabase y escriben a través del microservicio. Si necesita alguna que todavía no está creada, que la pida explícitamente en vez de inventar un valor de ejemplo y seguir de largo.
