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


async def exigir_administrador(
    authorization: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
) -> Administrador:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el token de sesión")
    token = authorization.split(" ", 1)[1].strip()
    user_id = await sb.usuario_de_token(token)
    if not user_id:
        raise HTTPException(401, "Sesión no válida o vencida")
    fila = await sb.usuario_fila(user_id)
    if not fila or fila["rol"] != "administrador" or not fila["activo"]:
        raise HTTPException(403, "Solo un administrador activo puede hacer esto")
    return Administrador(id=user_id)
