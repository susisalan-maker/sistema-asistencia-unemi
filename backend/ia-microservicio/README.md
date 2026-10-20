# ia-microservicio

Servicio Python + FastAPI. Por ahora: **alta de usuarios por invitación** (Supabase Auth), **sedes y bloques** (zonas de marcación) y **registro de marcaciones** (con verificación facial simulada). Después: verificación de rostro, anomalías e IA.

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /health` | cualquiera | Estado del servicio |
| `POST /usuarios` | Administrador | Crea la cuenta en Supabase Auth, envía el correo de invitación y guarda la fila en `usuarios`. **No recibe contraseña.** |
| `POST /usuarios/{id}/reenviar-invitacion` | Administrador | Reenvía la invitación (o un enlace de restablecimiento si ya activó la cuenta) |
| `POST /usuarios/{id}/desactivar` | Administrador | Desactiva al usuario (la base borra su rostro) y bloquea su inicio de sesión |
| `POST /usuarios/{id}/activar` | Administrador | Lo reactiva |
| `PATCH /usuarios/{id}/horario` | Administrador | Cambia `jornada_inicio`, `jornada_fin` y/o `dias_laborables` (1 = lunes … 7 = domingo); valida que la salida sea después de la entrada |
| `POST /sedes` | Administrador | Crea una sede (nombre, latitud, longitud, radio 50–1000 m, `permite_fuera_geocerca`) |
| `PATCH /sedes/{id}` | Administrador | Cambia solo los campos enviados |
| `POST /sedes/{id}/desactivar` | Administrador | Desactiva la sede; **se rechaza (409) si tiene usuarios activos asignados** |
| `POST /sedes/{id}/activar` | Administrador | La reactiva |
| `POST /bloques` | Administrador | Crea un bloque en una sede activa (radio 20–200 m); el nombre no se repite dentro de la sede |
| `PATCH /bloques/{id}` | Administrador | Cambia nombre, coordenadas o radio (un bloque no cambia de sede) |
| `POST /bloques/{id}/desactivar` | Administrador | Lo desactiva; si era el último activo, avisa que la sede se validará por su círculo |
| `POST /bloques/{id}/activar` | Administrador | Lo reactiva (la sede debe estar activa) |
| `POST /feriados` | Administrador | Crea un feriado (`fecha` y `nombre`). Con `hasta` (máx. 31 días) crea uno por cada día del rango y respeta los que ya existían |
| `PATCH /feriados/{id}` | Administrador | Cambia fecha y/o nombre; 409 si ya hay un feriado en esa fecha |
| `POST /feriados/{id}/desactivar` · `/activar` | Administrador | Activa o desactiva (no se borran) |
| `POST /marcaciones` | Usuario activo | Registra una marcación (`ingreso`, `salida_almuerzo`, `entrada_almuerzo`, `salida`). Valida secuencia, zona, día laborable/feriado, horario, almuerzo, desplazamiento y uso web; devuelve la marcación y las anomalías detectadas. Reintentar el mismo `id` no duplica (200) |

**Marcación:** el orden de las comprobaciones y qué se registra y qué no está al inicio de `app/routers/marcaciones.py`; las reglas, como funciones puras, en `app/reglas_marcacion.py`. La verificación facial es **simulada** (`app/verificacion.py`) hasta que exista el registro de rostro: las marcaciones guardadas ahora son de prueba. Los días se cuentan en hora de Ecuador continental (UTC-5).

Nada se borra: sedes y bloques solo se desactivan. Cada escritura envía `updated_by` explícito (el administrador) para que la auditoría quede completa. Las rutas de administrador exigen `Authorization: Bearer <token de sesión del administrador>` (el panel web lo envía). El servicio valida el token con Supabase y comprueba en `usuarios` que sea administrador activo.

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
