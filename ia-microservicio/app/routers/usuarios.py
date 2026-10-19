"""Alta de usuarios por invitación, reenvío y baja/alta lógica.

El Administrador nunca define ni conoce la contraseña: Supabase envía un correo
y la persona crea la suya (ver docs/plan-tecnico-arquitectura.md, sección 3.3.1).
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador, get_supabase
from app.config import Settings, get_settings
from app.schemas import UsuarioCreado, UsuarioNuevo
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


def _ya_existe(error: SupabaseError) -> bool:
    texto = error.message.lower()
    return error.status in (409, 422) and ("already" in texto or "registered" in texto or "exists" in texto)


@router.post("", response_model=UsuarioCreado, status_code=201)
async def crear_usuario(
    datos: UsuarioNuevo,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    email = datos.email.lower()
    redirect = f"{cfg.url_panel_web.rstrip('/')}/aceptar-invitacion"

    # 1) Crea la cuenta en Auth y envía el correo de invitación.
    try:
        auth_user = await sb.invitar_por_correo(email, redirect)
    except SupabaseError as e:
        if _ya_existe(e):
            raise HTTPException(409, "Ya existe un usuario con ese correo")
        raise HTTPException(502, f"No se pudo enviar la invitación: {e.message}")

    # 2) Guarda la fila en usuarios con el mismo id. Si falla, se deshace el paso 1.
    fila = {
        "id": auth_user["id"],
        "nombre": datos.nombre.strip(),
        "email": email,
        "rol": datos.rol,
        "sede_id": str(datos.sede_id) if datos.sede_id else None,
        "jornada_inicio": datos.jornada_inicio.isoformat(),
        "jornada_fin": datos.jornada_fin.isoformat(),
        "created_by": admin.id,  # el service_role no tiene sesión: se indica quién lo creó
    }
    try:
        await sb.insertar_usuario(fila)
    except SupabaseError as e:
        try:
            await sb.eliminar_usuario_auth(auth_user["id"])
        except SupabaseError:
            pass  # si tampoco se puede deshacer, se informa abajo
        raise HTTPException(502, f"No se pudo guardar el usuario: {e.message}")

    return UsuarioCreado(id=auth_user["id"], email=email, mensaje="Invitación enviada")


@router.post("/{user_id}/reenviar-invitacion")
async def reenviar_invitacion(
    user_id: str,
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")
    base = cfg.url_panel_web.rstrip("/")
    try:
        auth_user = await sb.obtener_usuario_auth(user_id)
        if auth_user.get("email_confirmed_at") or auth_user.get("confirmed_at"):
            # Ya activó su cuenta: se le manda un enlace para restablecer la contraseña.
            await sb.enviar_recuperacion(fila["email"], f"{base}/restablecer-contrasena")
            return {"mensaje": "La cuenta ya estaba activa: se envió un enlace para restablecer la contraseña"}
        await sb.invitar_por_correo(fila["email"], f"{base}/aceptar-invitacion")
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo reenviar: {e.message}")
    return {"mensaje": "Invitación reenviada"}


async def _cambiar_estado(user_id: str, activo: bool, admin: Administrador, sb: SupabaseClient):
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")
    if fila["activo"] == activo:
        return fila
    if not activo:
        if user_id == admin.id:
            raise HTTPException(409, "No puedes desactivar tu propia cuenta")
        if fila["rol"] == "administrador" and await sb.contar_administradores_activos() <= 1:
            raise HTTPException(409, "Debe existir al menos un administrador activo")
    try:
        # Orden: primero la fila (trigger borra rostro y consentimiento), luego el bloqueo en Auth.
        actualizado = await sb.actualizar_usuario(user_id, {"activo": activo, "updated_by": admin.id})
        await sb.bloquear_usuario_auth(user_id, bloquear=not activo)
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo actualizar el usuario: {e.message}")
    return actualizado


@router.post("/{user_id}/desactivar")
async def desactivar(
    user_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _cambiar_estado(user_id, False, admin, sb)
    return {"mensaje": "Usuario desactivado; su rostro registrado fue eliminado"}


@router.post("/{user_id}/activar")
async def activar(
    user_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _cambiar_estado(user_id, True, admin, sb)
    return {"mensaje": "Usuario activado; deberá registrar su rostro de nuevo"}
