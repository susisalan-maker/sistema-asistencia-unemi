import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_supabase
from app.config import Settings, get_settings
from app.routers import sedes, usuarios
from app.supabase_client import SupabaseError

ADMIN_ID = "11111111-1111-1111-1111-111111111111"
SEDE_ID = "22222222-2222-2222-2222-222222222222"
BLOQUE_ID = "44444444-4444-4444-4444-444444444444"
NUEVO_ID = "33333333-3333-3333-3333-333333333333"


class FakeSupabase:
    """Simula Supabase en memoria para probar la lógica sin red."""

    def __init__(self):
        self.tokens = {"token-admin": ADMIN_ID, "token-usuario": "u-1"}
        self.filas = {
            ADMIN_ID: {"id": ADMIN_ID, "rol": "administrador", "activo": True, "email": "admin@x.com"},
            "u-1": {"id": "u-1", "rol": "usuario", "activo": True, "email": "u1@x.com"},
        }
        self.auth_users = {ADMIN_ID: {"id": ADMIN_ID, "email_confirmed_at": "2026-01-01"},
                           "u-1": {"id": "u-1", "email_confirmed_at": None}}
        self.sedes = {SEDE_ID: {"id": SEDE_ID, "nombre": "Matriz Milagro", "latitud": -2.14, "longitud": -79.6,
                                 "radio_metros": 400, "permite_fuera_geocerca": False, "activa": True}}
        self.bloques = {BLOQUE_ID: {"id": BLOQUE_ID, "sede_id": SEDE_ID, "nombre": "Bloque M", "latitud": -2.14,
                                     "longitud": -79.6, "radio_metros": 60, "activo": True}}
        self.nombre_duplicado = False
        self.llamadas = []
        self.fallar_insert = False
        self.correo_existente = False

    async def usuario_de_token(self, token):
        return self.tokens.get(token)

    async def usuario_fila(self, uid):
        return self.filas.get(uid)

    async def invitar_por_correo(self, email, redirect_to):
        self.llamadas.append(("invitar", email, redirect_to))
        if self.correo_existente:
            raise SupabaseError(422, "A user with this email address has already been registered")
        uid = NUEVO_ID
        self.auth_users[uid] = {"id": uid, "email_confirmed_at": None}
        return {"id": uid, "email": email}

    async def insertar_usuario(self, datos):
        self.llamadas.append(("insertar", datos))
        if self.fallar_insert:
            raise SupabaseError(400, "violación de restricción")
        self.filas[datos["id"]] = {**datos, "activo": True}
        return datos

    async def eliminar_usuario_auth(self, uid):
        self.llamadas.append(("eliminar_auth", uid))
        self.auth_users.pop(uid, None)

    async def obtener_usuario_auth(self, uid):
        return self.auth_users[uid]

    async def enviar_recuperacion(self, email, redirect_to):
        self.llamadas.append(("recuperar", email, redirect_to))

    async def contar_administradores_activos(self):
        return sum(1 for f in self.filas.values() if f["rol"] == "administrador" and f["activo"])

    async def actualizar_usuario(self, uid, datos):
        self.llamadas.append(("actualizar", uid, datos))
        self.filas[uid].update({k: v for k, v in datos.items() if k != "updated_by"})
        return self.filas[uid]

    async def bloquear_usuario_auth(self, uid, bloquear):
        self.llamadas.append(("bloquear", uid, bloquear))

    # ---- sedes y bloques ----
    async def sede_fila(self, sede_id):
        return self.sedes.get(sede_id)

    async def insertar_sede(self, datos):
        self.llamadas.append(("insertar_sede", datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "sedes_nombre_key"')
        fila = {"id": "sede-nueva", "activa": True, **datos}
        self.sedes[fila["id"]] = fila
        return fila

    async def actualizar_sede(self, sede_id, datos):
        self.llamadas.append(("actualizar_sede", sede_id, datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "sedes_nombre_key"')
        self.sedes[sede_id].update(datos)
        return self.sedes[sede_id]

    async def contar_usuarios_activos_de_sede(self, sede_id):
        return sum(1 for f in self.filas.values() if f.get("sede_id") == sede_id and f["activo"])

    async def bloque_fila(self, bloque_id):
        return self.bloques.get(bloque_id)

    async def insertar_bloque(self, datos):
        self.llamadas.append(("insertar_bloque", datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "bloques_nombre_por_sede_unico"')
        fila = {"id": "bloque-nuevo", "activo": True, **datos}
        self.bloques[fila["id"]] = fila
        return fila

    async def actualizar_bloque(self, bloque_id, datos):
        self.llamadas.append(("actualizar_bloque", bloque_id, datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "bloques_nombre_por_sede_unico"')
        self.bloques[bloque_id].update(datos)
        return self.bloques[bloque_id]

    async def contar_bloques_activos(self, sede_id):
        return sum(1 for b in self.bloques.values() if b["sede_id"] == sede_id and b["activo"])


@pytest.fixture
def fake():
    return FakeSupabase()


@pytest.fixture
def client(fake):
    app = FastAPI()
    app.include_router(usuarios.router)
    app.include_router(sedes.router_sedes)
    app.include_router(sedes.router_bloques)
    app.dependency_overrides[get_supabase] = lambda: fake
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="http://sb", supabase_service_role_key="k", url_panel_web="http://panel.test"
    )
    return TestClient(app)


def admin_headers():
    return {"Authorization": "Bearer token-admin"}
