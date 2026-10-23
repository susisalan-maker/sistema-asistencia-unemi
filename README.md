# Sistema de asistencia universitaria con IA

Proyecto de titulación · UNEMI · Ingeniería de Software.

Registro de asistencia con geolocalización (sedes y bloques), verificación facial con detección de vida, detección de anomalías con IA y justificación conversacional.

## Estructura

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `frontend/app-movil/` | App del Usuario (marcar asistencia, offline) | React Native + Expo |
| `frontend/panel-web/` | Panel del Administrador (`/admin`) y contingencia del Usuario (`/usuario`) | React + Vite + Tailwind |
| `backend/ia-microservicio/` | Alta de usuarios, verificación de rostro, anomalías, IA | Python + FastAPI |
| `supabase/` | Migraciones de la base de datos | PostgreSQL (Supabase) |
| `docs/` | Documentación de la tesis (arquitectura, lógica de negocio, modelo de datos) | Markdown |

Lee primero `docs/plan-tecnico-arquitectura.md` y `docs/logica-negocio.md`.

## Ramas

| Rama | Para qué |
|---|---|
| `dev_salan` | Desarrollo de Susana |
| `dev_guerrero` | Desarrollo de Dayanara |
| `desarrollo` | Integración: aquí se unen (Pull Request) las ramas personales y se prueba |
| `despliegue` | Lo que se publica (Render y Vercel); solo recibe cambios desde `desarrollo` |

## Reglas del equipo

- **Nunca** subas claves: `.env` está en `.gitignore`. Cada componente trae un `.env.example`.
- La `service_role key` de Supabase solo la usa `backend/ia-microservicio`. Jamás va en `frontend/panel-web` ni en `frontend/app-movil`.
- Los clientes (web y app) solo **leen** de Supabase; todo lo que se escribe pasa por el microservicio.
- Se trabaja en la rama personal y se une a `desarrollo` con Pull Request revisado por la otra persona. Las pruebas automáticas (`.github/workflows/ci.yml`) deben pasar.
- Nombres de base de datos: ver `docs/convenciones-base-datos.md`.

## Puesta en marcha

Para levantar y probar el login web y móvil paso a paso (también guiado por Claude), ver **`PRUEBA-LOCAL.md`**. Resumen:

1. Supabase: seguir `docs/pasos-manuales.md` (sección 1) y ejecutar `supabase/migrations/0001_init.sql`.
2. Microservicio: ver `backend/ia-microservicio/README.md`.
3. Panel web: ver `frontend/panel-web/README.md`.
4. App móvil: ver `frontend/app-movil/README.md`.

## Estado

- [x] Base de datos (11 tablas, RLS, auditoría)
- [x] Login, invitación y recuperación de contraseña (web, móvil y microservicio)
- [x] Sedes y bloques con mapa en el panel web
- [x] Registro de rostro y verificación facial real con detección de vida pasiva
- [x] Marcación y marcación sin conexión con sincronización (app Android; falta probarla en celular real)
- [ ] Anomalías, justificación y panel de analítica
