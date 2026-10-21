"""Vinculación del celular a la cuenta (docs/logica-negocio.md, sección 8).

El usuario no puede escribir su propia fila de `usuarios` (la política de la base solo lo permite al
Administrador), así que vincular su dispositivo pasa por aquí. Reglas:
  * Una cuenta tiene a lo sumo un dispositivo, y un dispositivo pertenece a una sola cuenta.
  * Repetir la vinculación con el mismo dispositivo no hace nada (la app puede reintentar).
  * Para cambiar de celular, el Administrador reinicia el vínculo; el usuario no lo cambia solo.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import exigir_usuario, get_supabase
from app.schemas import DispositivoNuevo
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/dispositivo", tags=["dispositivo"])


@router.post("/vincular")
async def vincular(
    datos: DispositivoNuevo,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
):
    actual = usuario.get("dispositivo_id")
    if actual == datos.dispositivo_id:
        return {"dispositivo": "este", "mensaje": "Este dispositivo ya estaba vinculado a tu cuenta"}
    if actual:
        raise HTTPException(
            409, "Tu cuenta ya tiene otro celular vinculado. Pide a Talento Humano que lo reinicie para usar este"
        )
    try:
        fila = await sb.vincular_dispositivo(usuario["id"], datos.dispositivo_id)
    except SupabaseError as e:
        if e.status == 409 and "duplicate" in e.message.lower():
            raise HTTPException(409, "Este celular ya está vinculado a otra cuenta")
        raise HTTPException(502, f"No se pudo vincular el dispositivo: {e.message}")
    if fila is None:
        # Otro celular de la misma cuenta se vinculó justo antes.
        raise HTTPException(
            409, "Tu cuenta ya tiene otro celular vinculado. Pide a Talento Humano que lo reinicie para usar este"
        )
    return {"dispositivo": "este", "mensaje": "Dispositivo vinculado"}
