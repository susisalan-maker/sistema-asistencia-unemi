"""Verifica que quien llama sea un Administrador activo.

El panel web envía el token de sesión del administrador (Authorization: Bearer ...).
El servicio le pregunta a Supabase de quién es ese token y luego revisa en la tabla
usuarios que sea administrador y esté activo.
"""
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, Request

from app.supabase_client import SupabaseClient


@dataclass
class Administrador:
    id: str


def get_supabase(request: Request) -> SupabaseClient:
    return request.app.state.supabase


async def _usuario_de_la_peticion(authorization: str | None, sb: SupabaseClient) -> dict:
    """Valida el token de sesión y devuelve la fila de `usuarios` de su dueño."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el token de sesión")
    token = authorization.split(" ", 1)[1].strip()
    user_id = await sb.usuario_de_token(token)
    if not user_id:
        raise HTTPException(401, "Sesión no válida o vencida")
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(403, "Tu cuenta no está habilitada")
    return fila


async def exigir_administrador(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> Administrador:
    fila = await _usuario_de_la_peticion(authorization, sb)
    if fila["rol"] != "administrador" or not fila["activo"]:
        raise HTTPException(403, "Solo un administrador activo puede hacer esto")
    return Administrador(id=fila["id"])


async def exigir_usuario(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> dict:
    """Quien marca asistencia: un Usuario (no Administrador) activo. Devuelve su fila de `usuarios`."""
    fila = await _usuario_de_la_peticion(authorization, sb)
    if fila["rol"] != "usuario" or not fila["activo"]:
        raise HTTPException(403, "Solo un usuario activo puede marcar asistencia")
    return fila
