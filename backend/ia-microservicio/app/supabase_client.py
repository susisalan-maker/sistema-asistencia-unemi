"""Cliente mínimo de Supabase (Auth admin + PostgREST) con la service_role key.

Se usa httpx directo para que sea fácil de probar y de entender. Solo este servicio
conoce la service_role key.
"""
import httpx


class SupabaseError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


class SupabaseClient:
    def __init__(self, url: str, service_key: str, transport: httpx.AsyncBaseTransport | None = None):
        self._base = url.rstrip("/")
        self._headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
        self._http = httpx.AsyncClient(timeout=15, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def _send(self, method: str, path: str, *, headers: dict | None = None, **kw) -> httpx.Response:
        resp = await self._http.request(
            method, f"{self._base}{path}", headers={**self._headers, **(headers or {})}, **kw
        )
        if resp.status_code >= 400:
            try:
                body = resp.json()
                msg = body.get("msg") or body.get("message") or body.get("error_description") or str(body)
            except ValueError:
                msg = resp.text
            raise SupabaseError(resp.status_code, msg)
        return resp

    # ---- Auth ----
    async def usuario_de_token(self, access_token: str) -> str | None:
        """Devuelve el id del usuario dueño del token, o None si el token no es válido."""
        try:
            resp = await self._send(
                "GET", "/auth/v1/user", headers={"Authorization": f"Bearer {access_token}"}
            )
        except SupabaseError:
            return None
        return resp.json().get("id")

    async def invitar_por_correo(self, email: str, redirect_to: str) -> dict:
        resp = await self._send(
            "POST", "/auth/v1/invite", params={"redirect_to": redirect_to}, json={"email": email}
        )
        return resp.json()

    async def obtener_usuario_auth(self, user_id: str) -> dict:
        resp = await self._send("GET", f"/auth/v1/admin/users/{user_id}")
        return resp.json()

    async def ids_con_invitacion_pendiente(self) -> list[str]:
        """Ids de las cuentas que aún no aceptaron su invitación (Auth no les confirmó el correo)."""
        pendientes: list[str] = []
        pagina, por_pagina = 1, 200
        while True:
            resp = await self._send(
                "GET", "/auth/v1/admin/users", params={"page": pagina, "per_page": por_pagina}
            )
            usuarios = resp.json().get("users", [])
            pendientes += [u["id"] for u in usuarios if not (u.get("email_confirmed_at") or u.get("confirmed_at"))]
            if len(usuarios) < por_pagina:
                return pendientes
            pagina += 1

    async def enviar_recuperacion(self, email: str, redirect_to: str) -> None:
        await self._send("POST", "/auth/v1/recover", params={"redirect_to": redirect_to}, json={"email": email})

    async def eliminar_usuario_auth(self, user_id: str) -> None:
        await self._send("DELETE", f"/auth/v1/admin/users/{user_id}")

    async def bloquear_usuario_auth(self, user_id: str, bloquear: bool) -> None:
        # ~100 años equivale a un bloqueo permanente; "none" lo levanta.
        await self._send(
            "PUT", f"/auth/v1/admin/users/{user_id}", json={"ban_duration": "876000h" if bloquear else "none"}
        )

    async def actualizar_correo_auth(self, user_id: str, email: str) -> None:
        """Cambia el correo con el que la persona inicia sesión (sin enviar correo de confirmación:
        lo cambia un administrador). Si el correo ya existe, Supabase responde 422."""
        await self._send("PUT", f"/auth/v1/admin/users/{user_id}", json={"email": email})

    # ---- Tabla usuarios (PostgREST) ----
    async def usuario_fila(self, user_id: str) -> dict | None:
        resp = await self._send(
            "GET", "/rest/v1/usuarios", params={"id": f"eq.{user_id}", "select": "*"}
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def insertar_usuario(self, datos: dict) -> dict:
        resp = await self._send(
            "POST", "/rest/v1/usuarios", json=datos, headers={"Prefer": "return=representation"}
        )
        return resp.json()[0]

    async def actualizar_usuario(self, user_id: str, datos: dict) -> dict:
        resp = await self._send(
            "PATCH",
            "/rest/v1/usuarios",
            params={"id": f"eq.{user_id}"},
            json=datos,
            headers={"Prefer": "return=representation"},
        )
        filas = resp.json()
        if not filas:
            raise SupabaseError(404, "Usuario no encontrado")
        return filas[0]

    async def vincular_dispositivo(self, user_id: str, dispositivo_id: str) -> dict | None:
        """Guarda el dispositivo solo si la cuenta aún no tiene uno (la condición va en la misma consulta,
        así dos celulares que lo intentan a la vez no se pisan). Devuelve None si ya había otro."""
        resp = await self._send(
            "PATCH",
            "/rest/v1/usuarios",
            params={"id": f"eq.{user_id}", "dispositivo_id": "is.null"},
            json={"dispositivo_id": dispositivo_id, "updated_by": user_id},
            headers={"Prefer": "return=representation"},
        )
        filas = resp.json()
        return filas[0] if filas else None

    # ---- Rostro ----
    async def rostro_fila(self, user_id: str) -> dict | None:
        """Fila de `rostros` (vectores cifrados). Solo el service_role puede leerla."""
        resp = await self._send(
            "GET",
            "/rest/v1/rostros",
            params={"usuario_id": f"eq.{user_id}", "select": "vectores_cifrados,version_clave"},
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def registrar_rostro(self, user_id: str, cifrado_hex: str, version_clave: int, consentimiento: str) -> None:
        """Guarda el rostro cifrado y las fechas de registro y consentimiento en una sola transacción
        (función `registrar_rostro` de la base). Falla con 400 si el usuario ya tiene rostro."""
        # El servicio no tiene sesión de usuario: se deja `updated_by` en la persona para que la bitácora
        # atribuya el registro a quien lo hizo y no al último administrador que editó su fila.
        await self._send(
            "PATCH", "/rest/v1/usuarios", params={"id": f"eq.{user_id}"}, json={"updated_by": user_id}
        )
        await self._send(
            "POST",
            "/rest/v1/rpc/registrar_rostro",
            json={
                "p_usuario": user_id,
                "p_vectores_cifrados": cifrado_hex,
                "p_version_clave": version_clave,
                "p_fecha_consentimiento": consentimiento,
            },
        )

    async def contar_administradores_activos(self) -> int:
        resp = await self._send(
            "GET",
            "/rest/v1/usuarios",
            params={"rol": "eq.administrador", "activo": "eq.true", "select": "id"},
        )
        return len(resp.json())

    # ---- Sedes y bloques (PostgREST) ----
    # Toda escritura envía updated_by de forma explícita (ver asignar_auditoria en el SQL):
    # sin sesión de usuario, la base de datos se fía de este valor para saber quién editó.
    async def _fila(self, tabla: str, fila_id: str) -> dict | None:
        resp = await self._send("GET", f"/rest/v1/{tabla}", params={"id": f"eq.{fila_id}", "select": "*"})
        filas = resp.json()
        return filas[0] if filas else None

    async def _insertar(self, tabla: str, datos: dict) -> dict:
        resp = await self._send(
            "POST", f"/rest/v1/{tabla}", json=datos, headers={"Prefer": "return=representation"}
        )
        return resp.json()[0]

    async def _actualizar(self, tabla: str, fila_id: str, datos: dict) -> dict:
        resp = await self._send(
            "PATCH",
            f"/rest/v1/{tabla}",
            params={"id": f"eq.{fila_id}"},
            json={"updated_by": None, **datos},
            headers={"Prefer": "return=representation"},
        )
        filas = resp.json()
        if not filas:
            raise SupabaseError(404, "Registro no encontrado")
        return filas[0]

    async def sede_fila(self, sede_id: str) -> dict | None:
        return await self._fila("sedes", sede_id)

    async def insertar_sede(self, datos: dict) -> dict:
        return await self._insertar("sedes", datos)

    async def actualizar_sede(self, sede_id: str, datos: dict) -> dict:
        return await self._actualizar("sedes", sede_id, datos)

    async def contar_usuarios_activos_de_sede(self, sede_id: str) -> int:
        resp = await self._send(
            "GET", "/rest/v1/usuarios", params={"sede_id": f"eq.{sede_id}", "activo": "eq.true", "select": "id"}
        )
        return len(resp.json())

    async def bloque_fila(self, bloque_id: str) -> dict | None:
        return await self._fila("bloques", bloque_id)

    async def insertar_bloque(self, datos: dict) -> dict:
        return await self._insertar("bloques", datos)

    async def actualizar_bloque(self, bloque_id: str, datos: dict) -> dict:
        return await self._actualizar("bloques", bloque_id, datos)

    async def contar_bloques_activos(self, sede_id: str) -> int:
        resp = await self._send(
            "GET", "/rest/v1/bloques", params={"sede_id": f"eq.{sede_id}", "activo": "eq.true", "select": "id"}
        )
        return len(resp.json())

    # ---- Marcaciones y anomalías ----
    # `marcaciones` y `anomalias` no tienen created_by/updated_by: basta con created_at (ver SQL).
    async def configuracion(self) -> dict:
        resp = await self._send("GET", "/rest/v1/configuracion", params={"id": "eq.1", "select": "*"})
        return resp.json()[0]

    # ---- Claves de la IA (tabla ia_claves: solo el service_role la ve) y bitácora ----
    async def claves_ia(self) -> list[dict]:
        resp = await self._send("GET", "/rest/v1/ia_claves", params={"select": "*", "order": "created_at.asc"})
        return resp.json()

    async def clave_ia(self, clave_id: str) -> dict | None:
        resp = await self._send("GET", "/rest/v1/ia_claves", params={"id": f"eq.{clave_id}", "select": "*"})
        filas = resp.json()
        return filas[0] if filas else None

    async def clave_ia_activa(self) -> dict | None:
        resp = await self._send("GET", "/rest/v1/ia_claves", params={"activa": "eq.true", "select": "*"})
        filas = resp.json()
        return filas[0] if filas else None

    async def insertar_clave_ia(self, datos: dict) -> dict:
        return await self._insertar("ia_claves", datos)

    async def actualizar_clave_ia(self, clave_id: str, datos: dict) -> dict:
        resp = await self._send(
            "PATCH", "/rest/v1/ia_claves", params={"id": f"eq.{clave_id}"}, json=datos,
            headers={"Prefer": "return=representation"},
        )
        filas = resp.json()
        if not filas:
            raise SupabaseError(404, "Clave no encontrada")
        return filas[0]

    async def borrar_clave_ia(self, clave_id: str) -> None:
        await self._send("DELETE", "/rest/v1/ia_claves", params={"id": f"eq.{clave_id}"})

    async def activar_clave_ia(self, clave_id: str, usuario_id: str) -> None:
        """Deja activa a esa clave y desactiva la anterior en una sola transacción (función ia_activar_clave)."""
        await self._send("POST", "/rest/v1/rpc/ia_activar_clave", json={"p_id": clave_id, "p_usuario": usuario_id})

    async def registrar_bitacora(self, datos: dict) -> None:
        """Una fila de la bitácora (para lo que no pasa por los triggers). Nunca lleva valores secretos."""
        await self._send("POST", "/rest/v1/bitacora", json=datos)

    async def bloques_activos_de_sede(self, sede_id: str) -> list[dict]:
        resp = await self._send(
            "GET", "/rest/v1/bloques", params={"sede_id": f"eq.{sede_id}", "activo": "eq.true", "select": "*"}
        )
        return resp.json()

    async def marcacion_fila(self, marcacion_id: str) -> dict | None:
        return await self._fila("marcaciones", marcacion_id)

    async def marcaciones_en_rango(self, usuario_id: str, desde: str, hasta: str) -> list[dict]:
        """Marcaciones del usuario con desde <= fecha_hora < hasta, de la más antigua a la más reciente."""
        resp = await self._send(
            "GET",
            "/rest/v1/marcaciones",
            params=[
                ("usuario_id", f"eq.{usuario_id}"),
                ("fecha_hora", f"gte.{desde}"),
                ("fecha_hora", f"lt.{hasta}"),
                ("select", "*"),
                ("order", "fecha_hora.asc"),
            ],
        )
        return resp.json()

    async def marcacion_anterior(self, usuario_id: str, antes_de: str) -> dict | None:
        resp = await self._send(
            "GET",
            "/rest/v1/marcaciones",
            params={
                "usuario_id": f"eq.{usuario_id}",
                "fecha_hora": f"lt.{antes_de}",
                "select": "*",
                "order": "fecha_hora.desc",
                "limit": "1",
            },
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def contar_marcaciones_web(self, usuario_id: str, desde: str, hasta: str) -> int:
        resp = await self._send(
            "GET",
            "/rest/v1/marcaciones",
            params=[
                ("usuario_id", f"eq.{usuario_id}"),
                ("origen", "eq.web"),
                ("fecha_hora", f"gte.{desde}"),
                ("fecha_hora", f"lt.{hasta}"),
                ("select", "id"),
            ],
        )
        return len(resp.json())

    async def insertar_marcacion(self, datos: dict) -> dict:
        return await self._insertar("marcaciones", datos)

    async def insertar_anomalia(self, datos: dict) -> dict:
        return await self._insertar("anomalias", datos)

    async def contar_verificaciones_fallidas(self, usuario_id: str, desde: str) -> int:
        resp = await self._send(
            "GET",
            "/rest/v1/anomalias",
            params={
                "usuario_id": f"eq.{usuario_id}",
                "tipo": "eq.verificacion_fallida",
                "created_at": f"gte.{desde}",
                "select": "id",
            },
        )
        return len(resp.json())

    # ---- Proceso de ausencias ----
    async def _todas(self, ruta: str, params: list[tuple[str, str]]) -> list[dict]:
        """Todas las filas de una consulta: PostgREST entrega como máximo 1000 por llamada."""
        filas: list[dict] = []
        while True:
            resp = await self._send("GET", ruta, params=[*params, ("limit", "1000"), ("offset", str(len(filas)))])
            lote = resp.json()
            filas += lote
            if len(lote) < 1000:
                return filas

    async def usuarios_para_ausencias(self) -> list[dict]:
        """Quienes marcan asistencia: usuarios activos con sede (sin sede no pueden marcar)."""
        return await self._todas(
            "/rest/v1/usuarios",
            [
                ("rol", "eq.usuario"),
                ("activo", "eq.true"),
                ("sede_id", "not.is.null"),
                ("select", "id,nombres,apellidos,jornada_inicio,jornada_fin,dias_laborables,created_at"),
                ("order", "id.asc"),
            ],
        )

    async def marcaciones_de_todos(self, desde: str, hasta: str) -> list[dict]:
        return await self._todas(
            "/rest/v1/marcaciones",
            [
                ("fecha_hora", f"gte.{desde}"),
                ("fecha_hora", f"lt.{hasta}"),
                ("select", "id,usuario_id,tipo,fecha_hora"),
                ("order", "fecha_hora.asc,id.asc"),
            ],
        )

    async def feriados_activos_entre(self, desde: str, hasta: str) -> list[dict]:
        """Feriados activos que tocan el rango de fechas (AAAA-MM-DD)."""
        return await self._todas(
            "/rest/v1/feriados",
            [
                ("activo", "eq.true"),
                ("fecha_fin", f"gte.{desde}"),
                ("fecha_inicio", f"lte.{hasta}"),
                ("select", "fecha_inicio,fecha_fin,nombre"),
                ("order", "fecha_inicio.asc"),
            ],
        )

    async def ausencias_registradas(self, desde: str, hasta: str) -> list[dict]:
        """Anomalías de ausencia ya generadas para jornadas entre dos fechas (AAAA-MM-DD)."""
        return await self._todas(
            "/rest/v1/anomalias",
            [
                ("tipo", "in.(sin_ingreso,sin_salida,sin_regreso_almuerzo)"),
                ("fecha_jornada", f"gte.{desde}"),
                ("fecha_jornada", f"lte.{hasta}"),
                ("select", "usuario_id,tipo,fecha_jornada"),
                ("order", "id.asc"),
            ],
        )

    async def ausencias_de_jornada(self, usuario_id: str, fecha: str) -> list[dict]:
        """Anomalías de ausencia ya generadas para una persona y un día (AAAA-MM-DD)."""
        resp = await self._send(
            "GET",
            "/rest/v1/anomalias",
            params={
                "usuario_id": f"eq.{usuario_id}",
                "tipo": "in.(sin_ingreso,sin_salida,sin_regreso_almuerzo)",
                "fecha_jornada": f"eq.{fecha}",
                "select": "id,tipo,estado,detalle",
            },
        )
        return resp.json()

    async def anotar_anomalia(self, anomalia_id: str, detalle: str) -> None:
        """Reemplaza el detalle de una anomalía (se usa solo para añadirle una nota; el estado no cambia)."""
        await self._send(
            "PATCH", "/rest/v1/anomalias", params={"id": f"eq.{anomalia_id}"}, json={"detalle": detalle}
        )

    async def marcar_sin_justificar(self) -> int:
        """Pasa a `sin_justificar` las anomalías pendientes cuyo plazo venció (función de la base)."""
        resp = await self._send("POST", "/rest/v1/rpc/marcar_sin_justificar", json={})
        return int(resp.json())

    # ---- Anomalías y justificaciones (lo que ve la propia persona) ----
    async def anomalias_de_usuario(self, usuario_id: str, limite: int = 100) -> list[dict]:
        resp = await self._send(
            "GET",
            "/rest/v1/anomalias",
            params={
                "usuario_id": f"eq.{usuario_id}",
                "select": "id,numero,tipo,estado,detalle,created_at,fecha_vencimiento",
                "order": "created_at.desc",
                "limit": str(limite),
            },
        )
        return resp.json()

    async def anomalia_de_usuario(self, usuario_id: str, anomalia_id: str) -> dict | None:
        """La anomalía solo si es de esa persona (una ajena se trata como inexistente)."""
        resp = await self._send(
            "GET",
            "/rest/v1/anomalias",
            params={
                "id": f"eq.{anomalia_id}",
                "usuario_id": f"eq.{usuario_id}",
                "select": "id,numero,tipo,estado,detalle,created_at,fecha_vencimiento",
            },
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def justificacion_de_anomalia(self, anomalia_id: str) -> dict | None:
        resp = await self._send(
            "GET",
            "/rest/v1/justificaciones",
            params={"anomalia_id": f"eq.{anomalia_id}", "select": "id,decision_final,comentario_admin,fecha_decision,revisado_por"},
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def mensajes_de_justificacion(self, justificacion_id: str) -> list[dict]:
        resp = await self._send(
            "GET",
            "/rest/v1/mensajes_chat",
            params={
                "justificacion_id": f"eq.{justificacion_id}",
                "select": "emisor,contenido,created_at",
                "order": "created_at.asc",
            },
        )
        return resp.json()

    async def justificar_anomalia(self, usuario_id: str, anomalia_id: str, texto: str) -> None:
        """Función `justificar_anomalia` de la base: valida dueño, estado y plazo, y registra todo en una transacción."""
        await self._send(
            "POST",
            "/rest/v1/rpc/justificar_anomalia",
            json={"p_usuario": usuario_id, "p_anomalia": anomalia_id, "p_texto": texto},
        )

    async def registrar_mensaje_usuario(self, usuario_id: str, anomalia_id: str, texto: str, maximo: int) -> str:
        """Función `registrar_mensaje_usuario` (migración 0004): valida dueño, estado, plazo y largo; devuelve el id de la justificación."""
        resp = await self._send(
            "POST",
            "/rest/v1/rpc/registrar_mensaje_usuario",
            json={"p_usuario": usuario_id, "p_anomalia": anomalia_id, "p_texto": texto, "p_max": maximo},
        )
        return resp.json()

    async def registrar_mensaje_asistente(self, justificacion_id: str, contenido: str) -> None:
        await self._send(
            "POST",
            "/rest/v1/rpc/registrar_mensaje_asistente",
            json={"p_justificacion": justificacion_id, "p_contenido": contenido},
        )

    async def cerrar_justificacion(
        self, anomalia_id: str, clasificacion: str | None, confianza: float | None, resumen: str | None, auto_aprobar: bool
    ) -> str:
        """Guarda lo que concluyó la IA y pasa el caso a `en_revision` (o a `justificada` si es aprobación automática)."""
        resp = await self._send(
            "POST",
            "/rest/v1/rpc/cerrar_justificacion",
            json={
                "p_anomalia": anomalia_id, "p_clasificacion": clasificacion, "p_confianza": confianza,
                "p_resumen": resumen, "p_auto_aprobar": auto_aprobar,
            },
        )
        return resp.json()

    # ---- Feriados ----
    async def feriado_activo(self, fecha: str) -> dict | None:
        """El feriado activo que cubre esa fecha (AAAA-MM-DD), si lo hay."""
        resp = await self._send(
            "GET",
            "/rest/v1/feriados",
            params={
                "fecha_inicio": f"lte.{fecha}",
                "fecha_fin": f"gte.{fecha}",
                "activo": "eq.true",
                "select": "*",
                "limit": "1",
            },
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def feriado_fila(self, feriado_id: str) -> dict | None:
        return await self._fila("feriados", feriado_id)

    async def insertar_feriado(self, datos: dict) -> dict:
        return await self._insertar("feriados", datos)

    async def actualizar_feriado(self, feriado_id: str, datos: dict) -> dict:
        return await self._actualizar("feriados", feriado_id, datos)
