# Sistema de asistencia universitaria con IA

Proyecto de titulación · UNEMI · Ingeniería de Software.

Registro de asistencia con geolocalización (sedes y bloques), verificación facial con detección de vida, detección de anomalías con IA y justificación conversacional.

## Componentes

| Carpeta | Qué es | Tecnología |
|---|---|---|
| `app-movil/` | App del Usuario (marcar asistencia, offline) | React Native + Expo |
| `panel-web/` | Panel del Administrador (`/admin`) y contingencia del Usuario (`/usuario`) | React + Vite + Tailwind |
| `ia-microservicio/` | Alta de usuarios, verificación de rostro, anomalías, IA | Python + FastAPI |
| `supabase/` | Migraciones de la base de datos | PostgreSQL (Supabase) |
| `docs/` | Documentación de la tesis (arquitectura, lógica de negocio, modelo de datos) | Markdown |

Lee primero `docs/plan-tecnico-arquitectura.md` y `docs/logica-negocio.md`.

## Reglas del equipo

- **Nunca** subas claves: `.env` está en `.gitignore`. Cada componente trae un `.env.example`.
- La `service_role key` de Supabase solo la usa `ia-microservicio`. Jamás va en `panel-web` ni en `app-movil`.
- Los clientes (web y app) solo **leen** de Supabase; todo lo que se escribe pasa por el microservicio.
- Trabajo en ramas: `main` protegida, una rama por tarea (`feature/login-web`) y Pull Request revisado por la otra persona.
- Nombres de base de datos: ver `docs/convenciones-base-datos.md`.

## Puesta en marcha

1. Supabase: seguir `docs/pasos-manuales.md` (sección 1) y ejecutar `supabase/migrations/0001_init.sql`.
2. Microservicio: ver `ia-microservicio/README.md`.
3. Panel web: ver `panel-web/README.md`.
4. App móvil: ver `app-movil/README.md`.

## Estado

- [x] Base de datos (10 tablas, RLS, auditoría)
- [ ] Login, invitación y recuperación de contraseña (en curso)
- [ ] Registro de rostro
- [ ] Marcación, offline y sincronización
- [ ] Anomalías, justificación y panel de analítica
