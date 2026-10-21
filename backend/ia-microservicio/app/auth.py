"""Verifica que quien llama sea un Administrador activo.

El panel web envía el token de sesión del administrador (Authorization: Bearer ...).
El servicio le pregunta a Supabase de quién es ese token y luego revisa en la tabla
usuarios que sea administrador y esté activo.
"""
from dataclasses import dataclass

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from app.supabase_client import SupabaseClient

# Códigos que las apps usan para saber qué hacer (volver al login); el texto de `detail` es solo para mostrar.
SESION_VENCIDA = "sesion_vencida"
CUENTA_INHABILITADA = "cuenta_inhabilitada"


class ErrorDeAcceso(HTTPException):
    """401 (la sesión ya no sirve) o 403 (la cuenta está desactivada), con un `codigo` para la app."""

    def __init__(self, status_code: int, detail: str, codigo: str):
        super().__init__(status_code, detail)
        self.codigo = codigo


async def _responder_error_de_acceso(_: Request, exc: ErrorDeAcceso) -> JSONResponse:
    return JSONResponse({"detail": exc.detail, "codigo": exc.codigo}, status_code=exc.status_code)


def registrar_manejadores(app: FastAPI) -> None:
    app.add_exception_handler(ErrorDeAcceso, _responder_error_de_acceso)


@dataclass
class Administrador:
    id: str


def get_supabase(request: Request) -> SupabaseClient:
    return request.app.state.supabase


async def _usuario_de_la_peticion(authorization: str | None, sb: SupabaseClient) -> dict:
    """Valida el token de sesión y devuelve la fila de `usuarios` de su dueño."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ErrorDeAcceso(401, "Tu sesión terminó. Vuelve a iniciar sesión", SESION_VENCIDA)
    token = authorization.split(" ", 1)[1].strip()
    user_id = await sb.usuario_de_token(token)
    if not user_id:
        raise ErrorDeAcceso(401, "Tu sesión terminó. Vuelve a iniciar sesión", SESION_VENCIDA)
    fila = await sb.usuario_fila(user_id)
    if not fila or not fila["activo"]:
        raise ErrorDeAcceso(403, "Tu cuenta está desactivada. Comunícate con Talento Humano", CUENTA_INHABILITADA)
    return fila


async def exigir_administrador(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> Administrador:
    fila = await _usuario_de_la_peticion(authorization, sb)
    if fila["rol"] != "administrador":
        raise HTTPException(403, "Solo un administrador activo puede hacer esto")
    return Administrador(id=fila["id"])


async def exigir_usuario(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> dict:
    """Quien marca asistencia: un Usuario (no Administrador) activo. Devuelve su fila de `usuarios`."""
    fila = await _usuario_de_la_peticion(authorization, sb)
    if fila["rol"] != "usuario":
        raise HTTPException(403, "Solo un usuario activo puede marcar asistencia")
    return fila
