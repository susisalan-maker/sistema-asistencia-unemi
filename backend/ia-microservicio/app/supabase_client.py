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

    async def enviar_recuperacion(self, email: str, redirect_to: str) -> None:
        await self._send("POST", "/auth/v1/recover", params={"redirect_to": redirect_to}, json={"email": email})

    async def eliminar_usuario_auth(self, user_id: str) -> None:
        await self._send("DELETE", f"/auth/v1/admin/users/{user_id}")

    async def bloquear_usuario_auth(self, user_id: str, bloquear: bool) -> None:
        # ~100 años equivale a un bloqueo permanente; "none" lo levanta.
        await self._send(
            "PUT", f"/auth/v1/admin/users/{user_id}", json={"ban_duration": "876000h" if bloquear else "none"}
        )

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

    # ---- Feriados ----
    async def feriado_activo(self, fecha: str) -> dict | None:
        """El feriado activo de esa fecha (AAAA-MM-DD), si lo hay."""
        resp = await self._send(
            "GET", "/rest/v1/feriados", params={"fecha": f"eq.{fecha}", "activo": "eq.true", "select": "*"}
        )
        filas = resp.json()
        return filas[0] if filas else None

    async def feriado_fila(self, feriado_id: str) -> dict | None:
        return await self._fila("feriados", feriado_id)

    async def insertar_feriado(self, datos: dict) -> dict:
        return await self._insertar("feriados", datos)

    async def actualizar_feriado(self, feriado_id: str, datos: dict) -> dict:
        return await self._actualizar("feriados", feriado_id, datos)
