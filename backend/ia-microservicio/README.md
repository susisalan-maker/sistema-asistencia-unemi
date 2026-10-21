# ia-microservicio

Servicio Python + FastAPI. Por ahora: **alta de usuarios por invitación** (Supabase Auth), **sedes y bloques** (zonas de marcación) **registro de marcaciones** y **registro y verificación de rostro** (embeddings con ONNX cifrados con AES-256-GCM, con detección de vida pasiva). Después: anomalías periódicas e IA.

## Endpoints

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /health` | cualquiera | Estado del servicio |
| `POST /usuarios` | Administrador | Crea la cuenta en Supabase Auth, envía el correo de invitación y guarda la fila en `usuarios`. **No recibe contraseña.** |
| `POST /usuarios/{id}/reenviar-invitacion` | Administrador | Reenvía la invitación (o un enlace de restablecimiento si ya activó la cuenta) |
| `POST /usuarios/{id}/desactivar` | Administrador | Desactiva al usuario (la base borra su rostro) y bloquea su inicio de sesión |
| `POST /usuarios/{id}/activar` | Administrador | Lo reactiva |
| `PATCH /usuarios/{id}` | Administrador | Edita nombres, apellidos, correo, rol, sede y/o horario (solo cambian los campos enviados). La sede debe existir y estar activa; no puedes cambiar tu propio rol ni tu propio correo; pasar a `usuario` exige sede. **El correo se cambia primero en Supabase Auth y luego en `usuarios`** (si la tabla falla, se devuelve el anterior en Auth); 409 si ya lo usa otra cuenta; si la persona aún no aceptó la invitación se le envía una nueva al correo nuevo. Responde la fila y un `mensaje` opcional |
| `PATCH /usuarios/{id}/horario` | Administrador | Cambia `jornada_inicio`, `jornada_fin` y/o `dias_laborables` (1 = lunes … 7 = domingo); valida que la salida sea después de la entrada |
| `POST /usuarios/{id}/reiniciar-dispositivo` | Administrador | Quita el celular vinculado para que la persona pueda vincular otro; la bitácora registra «resetear_dispositivo» con quién lo hizo |
| `POST /sedes` | Administrador | Crea una sede (nombre, latitud, longitud, radio 50–1000 m, `permite_fuera_geocerca`) |
| `PATCH /sedes/{id}` | Administrador | Cambia solo los campos enviados |
| `POST /sedes/{id}/desactivar` | Administrador | Desactiva la sede; **se rechaza (409) si tiene usuarios activos asignados** |
| `POST /sedes/{id}/activar` | Administrador | La reactiva |
| `POST /bloques` | Administrador | Crea un bloque en una sede activa (radio 20–200 m); el nombre no se repite dentro de la sede |
| `PATCH /bloques/{id}` | Administrador | Cambia nombre, coordenadas o radio (un bloque no cambia de sede) |
| `POST /bloques/{id}/desactivar` | Administrador | Lo desactiva; si era el último activo, avisa que la sede se validará por su círculo |
| `POST /bloques/{id}/activar` | Administrador | Lo reactiva (la sede debe estar activa) |
| `POST /feriados` | Administrador | Crea un feriado: un registro de `fecha_inicio` a `fecha_fin` (opcional; sin ella dura un día; máx. 31 días). 409 si se cruza con otro feriado activo |
| `PATCH /feriados/{id}` | Administrador | Cambia inicio, fin y/o nombre (valida el rango resultante); 409 si se cruza con otro feriado activo |
| `POST /feriados/{id}/desactivar` · `/activar` | Administrador | Activa o desactiva (no se borran); activar uno que se cruza con otro activo da 409 |
| `POST /marcaciones` | Usuario activo | Registra una marcación (`ingreso`, `salida_almuerzo`, `entrada_almuerzo`, `salida`). Valida secuencia, zona, día laborable/feriado, horario, almuerzo, desplazamiento y uso web; devuelve la marcación y las anomalías detectadas. Reintentar el mismo `id` no duplica (200) |
| `GET /marcaciones/hoy` | Usuario activo | Las marcaciones de hoy (día de Ecuador), cuál toca ahora (`siguiente`, o `null` si ya están las cuatro) y si el celular que pregunta (cabecera `X-Dispositivo-Id`) es el vinculado: `sin_vincular`, `este` u `otro`. También `rostro_registrado` y `rostro_requerido` (false solo con la verificación simulada), `ultima` (la última marcación de todas, aunque sea de otro día) y `jornada` (`{inicio, fin}` de la persona) |
| `GET /marcaciones/zona?latitud=&longitud=` | Usuario activo | Dónde está la persona respecto a su sede: `dentro`, `sede`, `lugar` (bloque o sede), `distancia_m`, `radio_m` y `permite_fuera`. Solo informa; la marcación vuelve a validarlo. 409 si no tiene sede activa |
| `GET /marcaciones/historial?dias=7` | Usuario activo | Las marcaciones de los últimos `dias` días (1 a 31) agrupadas por día local, del más reciente al más antiguo; cada una con su `lugar` y la `anomalia` que dejó (`{tipo, estado}`) o `null` |
| `GET /anomalias` | Usuario activo | Las anomalías de la propia persona (más recientes primero) con su estado, el detalle de la regla, el plazo (`vence`) y `puede_justificar` (pendiente y dentro del plazo) |
| `GET /anomalias/{id}` | Usuario activo | Una anomalía propia con su justificación: mensajes, y la decisión y el comentario del administrador solo si fue aprobada o rechazada. Una ajena o inexistente da 404 |
| `POST /anomalias/{id}/justificacion` | Usuario activo | Un mensaje del chat de justificación (`{"texto"}`: la primera vez 10 a 1000 caracteres; las respuestas a la repregunta, 2 a 1000). **Con IA** (`IA_PROVEEDOR=gemini` + `GEMINI_API_KEY`, o `anthropic` + `ANTHROPIC_API_KEY`) el asistente responde: repregunta una sola vez si falta algo y, al cerrar, guarda la clasificación (`aceptable` / `requiere_revision` / `sospechosa`), la confianza y el resumen, y el caso pasa a `en_revision` (o a `justificada` si es una falta menor, la IA es aceptable con confianza ≥ `IA_UMBRAL_AUTOAPROBAR` y no hubo temas ajenos). Máximo 3 mensajes de la persona; lo que no trata del caso recibe un aviso fijo y dos seguidos cierran el chat. **Sin llave del proveedor elegido**, o si la IA falla, un mensaje basta y pasa a `en_revision`. Devuelve el detalle del caso con `mensajes`. 404 si no es suya, 409 si ya no está pendiente, venció el plazo o ya usó sus mensajes, 422 si el texto no cumple el largo. Las reglas están en `app/chat_ia.py`, el cliente del modelo en `app/ia.py` y la escritura en las funciones de `0004_chat_ia.sql` |
| `POST /procesos/ausencias` | Secreto (`X-Proceso-Secreto`) | Proceso periódico: registra `sin_ingreso`, `sin_salida` y `sin_regreso_almuerzo` de las jornadas ya terminadas (últimos `AUSENCIAS_DIAS_ATRAS` días, tras `AUSENCIAS_GRACIA_MIN` minutos de gracia) y pasa a `sin_justificar` las vencidas. Idempotente. 503 si `PROCESOS_SECRETO` está vacío; 401 si el secreto no coincide |
| `POST /rostro/registro` | Usuario activo | Registro guiado del rostro: `{consentimiento: true, fotos: [3 a 5 en base64]}`. Revisa la calidad de cada foto (un solo rostro, tamaño, luz, nitidez, de frente; el error dice «Foto N: …»), exige que todas sean de la misma persona, calcula un vector por foto y los guarda **cifrados** con `registrar_rostro()`. **Las fotos no se guardan.** 409 si ya tiene rostro (el Administrador lo resetea) |
| `POST /dispositivo/vincular` | Usuario activo | Vincula el celular a la cuenta. Un celular por cuenta y una cuenta por celular; repetirlo con el mismo celular no hace nada; 409 si la cuenta ya tiene otro o si el celular es de otra cuenta. Cambiar de celular lo hace el Administrador con «Reiniciar celular vinculado» (Usuarios → Editar) |

**Marcación:** el orden de las comprobaciones y qué se registra y qué no está al inicio de `app/routers/marcaciones.py`; las reglas, como funciones puras, en `app/reglas_marcacion.py`. La verificación facial es real (`app/verificacion.py`, ver abajo): sin rostro registrado la marcación se rechaza con 409; una foto de mala calidad con 422 (sin anomalía); un rostro que no coincide no se registra y deja la anomalía `verificacion_fallida`; esa respuesta 422 trae además `codigo: "rostro_no_verificado"` e `intento` (número de intentos fallidos de ese día), que la app muestra en «No pudimos verificar tu identidad». Las marcaciones hechas **antes** de este cambio (verificador simulado) son de prueba. Los días se cuentan en hora de Ecuador continental (UTC-5).

Nada se borra: sedes y bloques solo se desactivan. Cada escritura envía `updated_by` explícito (el administrador) para que la auditoría quede completa. Las rutas de administrador exigen `Authorization: Bearer <token de sesión del administrador>` (el panel web lo envía). El servicio valida el token con Supabase y comprueba en `usuarios` que sea administrador activo.

## Verificación facial

- **Modelos** (paquete `buffalo_sc` de InsightFace, ~15 MB, CPU con `onnxruntime`): detector SCRFD (`det_500m.onnx`) y MobileFaceNet/ArcFace (`w600k_mbf.onnx`, vector de 512 números). No están en Git (`*.onnx` está ignorado): `python scripts/descargar_modelos.py` los baja a `modelos/` (el Dockerfile lo hace al construir la imagen). **Licencia:** los modelos preentrenados de InsightFace son de uso académico/investigación; hay que declararlo en la tesis (para un uso comercial habría que entrenar o licenciar otro).
- **Registro:** 3 a 5 fotos; cada una pasa los controles de calidad de `app/biometria.py` (constantes ajustables arriba del archivo). Se guarda un vector por foto, cifrado con AES-256-GCM (`app/cifrado.py`): `nonce(12) ‖ cifrado ‖ etiqueta(16)` en `rostros.vectores_cifrados`, con el id del usuario como dato asociado (copiar la fila a otra cuenta no sirve) y `version_clave` para una rotación futura.
- **Verificación:** se calcula el vector de la selfie y se toma la **mayor similitud coseno** contra los vectores guardados. `≥ ROSTRO_UMBRAL` (0.40 por defecto) → `verificada`; si no → `fallida`. El puntaje se guarda en `marcaciones.similitud_score`.
- **Variables:** `VERIFICACION_FACIAL` (`real`/`simulada`), `ROSTRO_CLAVE_AES` (64 hex; **solo en el servidor**; el servicio no arranca en modo real sin ella), `ROSTRO_UMBRAL`, `ROSTRO_UMBRAL_REGISTRO`, `VIDA_ACTIVA`, `VIDA_UMBRAL`, `MODELOS_DIR`. Perder la clave obliga a que todos registren su rostro de nuevo.
- **Reseteo:** el Administrador lo hace desde Usuarios → Editar → «Resetear rostro»; el panel llama a la función `resetear_rostro()` de la base (borra el rostro y el consentimiento; la bitácora lo atribuye al administrador).
- **Medido** (CPU de desarrollo, Python 3.13): ~170 MB de memoria con los dos modelos cargados y ~0.1–0.3 s por foto. Falta medirlo en Render.
- **Umbral:** con fotos de muestra, la misma persona dio 0.94–0.99 y personas distintas 0.01–0.22, así que 0.40 separa bien esas fotos, pero **no está calibrado con celulares reales**. Calibra con el equipo de la tesis (varias personas, varios días, luz distinta): sube el umbral si se cuelan suplantaciones, bájalo si se rechaza a la persona correcta.
- **Detección de vida pasiva** (`VIDA_ACTIVA=true`, `VIDA_UMBRAL=0.5`): dos modelos MiniFASNet (Silent-Face-Anti-Spoofing de Minivision, Apache-2.0, ~3.5 MB; pesos ONNX de `yakhyo/face-anti-spoofing`) estiman la probabilidad de que la foto sea un rostro real y no una foto impresa o una pantalla (promedio de los dos). Se aplica en el registro (la foto se rechaza con «Foto N: Parece una foto de una foto o de una pantalla…») y en cada marcación (verificación `fallida` con anomalía `verificacion_fallida` y el motivo). Se probó con una foto tomada a una pantalla: probabilidad de «real» de 0.02 → rechazada. **Pendiente calibrar el umbral con selfies reales:** si rechaza a quien está en persona, baja `VIDA_UMBRAL`; si deja pasar fotos de pantalla, súbelo. Cada rechazo deja el motivo en la anomalía.
- **Limitaciones (declarar en la tesis):** la detección es **pasiva** y de un solo fotograma: no es infalible (un video, una máscara o un ataque cuidadoso pueden pasar; además rinde peor con poca luz o fotos de rostros muy pequeños). Una detección **activa** (parpadeo o giro guiado) sería la segunda etapa y sí necesitaría un *build* de desarrollo de la app (EAS), no funciona en Expo Go.

## Correr en local

```bash
cd ia-microservicio
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env        # completar SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y ROSTRO_CLAVE_AES
python scripts/descargar_modelos.py   # modelos faciales (una vez)
uvicorn app.main:app --reload --port 8000
```

Documentación interactiva: http://localhost:8000/docs

## Pruebas

```bash
pytest
```

Las pruebas usan una Supabase simulada (no necesitan red ni claves) y un motor facial falso; `tests/test_biometria.py` usa los modelos reales y se omite si no están descargados. **Pendiente de verificar con un Supabase real:** el reenvío de invitación a una cuenta aún no confirmada (`/auth/v1/invite`) y el bloqueo con `ban_duration`; probarlos una vez con el proyecto real.

## Docker (para Render)

```bash
docker build -t asistencia-ms .
docker run --env-file .env -p 8000:8000 asistencia-ms
```
