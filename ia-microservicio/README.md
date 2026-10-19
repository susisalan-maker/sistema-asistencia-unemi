# ia-microservicio

Servicio Python + FastAPI. Por ahora: **alta de usuarios por invitación** (Supabase Auth). Después: verificación de rostro, anomalías e IA.

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /health` | cualquiera | Estado del servicio |
| `POST /usuarios` | Administrador | Crea la cuenta en Supabase Auth, envía el correo de invitación y guarda la fila en `usuarios`. **No recibe contraseña.** |
| `POST /usuarios/{id}/reenviar-invitacion` | Administrador | Reenvía la invitación (o un enlace de restablecimiento si ya activó la cuenta) |
| `POST /usuarios/{id}/desactivar` | Administrador | Desactiva al usuario (la base borra su rostro) y bloquea su inicio de sesión |
| `POST /usuarios/{id}/activar` | Administrador | Lo reactiva |

Las rutas de administrador exigen `Authorization: Bearer <token de sesión del administrador>` (el panel web lo envía). El servicio valida el token con Supabase y comprueba en `usuarios` que sea administrador activo.

## Correr en local

```bash
cd ia-microservicio
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # completar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
uvicorn app.main:app --reload --port 8000
```

Documentación interactiva: http://localhost:8000/docs

## Pruebas

```bash
pytest
```

Las pruebas usan una Supabase simulada (no necesitan red ni claves). **Pendiente de verificar con un Supabase real:** el reenvío de invitación a una cuenta aún no confirmada (`/auth/v1/invite`) y el bloqueo con `ban_duration`; probarlos una vez con el proyecto real.

## Docker (para Render)

```bash
docker build -t asistencia-ms .
docker run --env-file .env -p 8000:8000 asistencia-ms
```
