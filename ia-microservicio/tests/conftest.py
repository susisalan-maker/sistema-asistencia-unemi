import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_supabase
from app.config import Settings, get_settings
from app.routers import usuarios
from app.supabase_client import SupabaseError

ADMIN_ID = "11111111-1111-1111-1111-111111111111"
SEDE_ID = "22222222-2222-2222-2222-222222222222"
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


@pytest.fixture
def fake():
    return FakeSupabase()


@pytest.fixture
def client(fake):
    app = FastAPI()
    app.include_router(usuarios.router)
    app.dependency_overrides[get_supabase] = lambda: fake
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="http://sb", supabase_service_role_key="k", url_panel_web="http://panel.test"
    )
    return TestClient(app)


def admin_headers():
    return {"Authorization": "Bearer token-admin"}
