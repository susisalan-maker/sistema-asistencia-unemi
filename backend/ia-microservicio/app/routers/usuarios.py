"""Alta de usuarios por invitación, reenvío y baja/alta lógica.

El Administrador nunca define ni conoce la contraseña: Supabase envía un correo
y la persona crea la suya (ver docs/plan-tecnico-arquitectura.md, sección 3.3.1).
"""
from datetime import time

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador, get_supabase
from app.config import Settings, get_settings
from app.schemas import HorarioCambios, UsuarioCambios, UsuarioCreado, UsuarioNuevo
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
        "nombres": datos.nombres.strip(),
        "apellidos": datos.apellidos.strip(),
        "email": email,
        "rol": datos.rol,
        "sede_id": str(datos.sede_id) if datos.sede_id else None,
        "jornada_inicio": datos.jornada_inicio.isoformat(),
        "jornada_fin": datos.jornada_fin.isoformat(),
        "dias_laborables": datos.dias_laborables,
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


@router.get("/invitaciones-pendientes")
async def invitaciones_pendientes(
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Ids de las personas que aún no aceptan su invitación (el panel lo usa para ofrecer la acción correcta)."""
    try:
        return {"ids": await sb.ids_con_invitacion_pendiente()}
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo consultar el estado de las cuentas: {e.message}")


def _cuenta_activada(auth_user: dict) -> bool:
    return bool(auth_user.get("email_confirmed_at") or auth_user.get("confirmed_at"))


@router.post("/{user_id}/reenviar-invitacion")
async def reenviar_invitacion(
    user_id: str,
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Solo para quien aún no aceptó. Si la cuenta ya está activa, se debe usar «Restablecer contraseña»."""
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")
    try:
        if _cuenta_activada(await sb.obtener_usuario_auth(user_id)):
            raise HTTPException(409, "La cuenta ya está activa: usa «Restablecer contraseña»")
        await sb.invitar_por_correo(fila["email"], f"{cfg.url_panel_web.rstrip('/')}/aceptar-invitacion")
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo reenviar: {e.message}")
    return {"mensaje": "Invitación reenviada"}


@router.post("/{user_id}/restablecer-contrasena")
async def restablecer_contrasena(
    user_id: str,
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Envía el enlace para crear una contraseña nueva. Solo si la persona ya activó su cuenta."""
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")
    try:
        if not _cuenta_activada(await sb.obtener_usuario_auth(user_id)):
            raise HTTPException(409, "La persona aún no acepta su invitación: reenvíale la invitación")
        await sb.enviar_recuperacion(fila["email"], f"{cfg.url_panel_web.rstrip('/')}/restablecer-contrasena")
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo enviar el enlace: {e.message}")
    return {"mensaje": "Se envió un enlace para restablecer la contraseña"}


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


async def _aplicar_cambios(
    user_id: str, datos: dict, admin: Administrador, sb: SupabaseClient, error: str, cfg: Settings | None = None
) -> tuple[dict, str | None]:
    """Valida y guarda los cambios de un usuario (nombres, correo, rol, sede y/o horario).
    Devuelve la fila y, si hace falta, un mensaje para quien edita. Los datos de `usuarios` se guardan en una sola
    escritura; si cambia el correo, también se cambia en Supabase Auth (y se revierte si lo demás falla)."""
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")

    # Correo: es el usuario con el que inicia sesión. Repetir el actual (sin importar mayúsculas) no es un cambio.
    cambia_correo = False
    if "email" in datos:
        datos["email"] = str(datos["email"]).lower()
        if datos["email"] == (fila.get("email") or "").lower():
            del datos["email"]
        else:
            if user_id == admin.id:
                raise HTTPException(409, "Tu propio correo no se puede cambiar desde aquí: un error te dejaría sin acceso")
            cambia_correo = True

    # Rol: repetir el actual no es un cambio.
    if datos.get("rol") == fila["rol"]:
        del datos["rol"]
    if "rol" in datos:
        # Quien edita ya es un administrador activo; mientras no pueda cambiar su propio rol, siempre queda al menos uno.
        if user_id == admin.id:
            raise HTTPException(409, "No puedes cambiar tu propio rol")

    # Sede: debe existir y estar activa.
    if "sede_id" in datos:
        datos["sede_id"] = str(datos["sede_id"])
        sede = await sb.sede_fila(datos["sede_id"])
        if not sede or not sede["activa"]:
            raise HTTPException(422, "Esa sede no existe o está inactiva")
    # Al pasar a «usuario» hace falta una sede (la base lo exige; aquí se explica antes de llegar al error).
    if datos.get("rol") == "usuario" and not datos.get("sede_id", fila.get("sede_id")):
        raise HTTPException(422, "Un usuario necesita una sede asignada")

    # Horario: la jornada se valida contra la que ya tiene.
    if "jornada_inicio" in datos or "jornada_fin" in datos:
        inicio = datos.get("jornada_inicio") or time.fromisoformat(fila["jornada_inicio"])
        fin = datos.get("jornada_fin") or time.fromisoformat(fila["jornada_fin"])
        if fin <= inicio:
            raise HTTPException(422, "La jornada debe terminar después de iniciar")
        for campo in ("jornada_inicio", "jornada_fin"):
            if campo in datos:
                datos[campo] = datos[campo].isoformat()

    if not datos:
        return fila, None  # nada cambió

    # Primero el correo de acceso en Auth (aquí se detecta si ya lo usa otra cuenta); luego la tabla.
    pendiente = False
    if cambia_correo:
        try:
            auth_user = await sb.obtener_usuario_auth(user_id)
            pendiente = not (auth_user.get("email_confirmed_at") or auth_user.get("confirmed_at"))
            await sb.actualizar_correo_auth(user_id, datos["email"])
        except SupabaseError as e:
            if _ya_existe(e):
                raise HTTPException(409, "Ya existe un usuario con ese correo")
            raise HTTPException(502, f"No se pudo cambiar el correo de acceso: {e.message}")

    try:
        actualizado = await sb.actualizar_usuario(user_id, {**datos, "updated_by": admin.id})
    except SupabaseError as e:
        revertido = True
        if cambia_correo:
            try:
                await sb.actualizar_correo_auth(user_id, fila["email"])
            except SupabaseError:
                revertido = False
        if cambia_correo and e.status == 409:
            raise HTTPException(409, "Ya existe un usuario con ese correo")
        extra = "" if revertido else " (además no se pudo devolver el correo de acceso al anterior: revisa la cuenta en Supabase)"
        raise HTTPException(502, f"{error}: {e.message}{extra}")

    mensaje = None
    if cambia_correo:
        if pendiente and cfg is not None:
            # Aún no aceptó la invitación: la anterior iba al correo viejo, se envía una nueva.
            try:
                await sb.invitar_por_correo(datos["email"], f"{cfg.url_panel_web.rstrip('/')}/aceptar-invitacion")
                mensaje = "Correo actualizado. Se envió la invitación al correo nuevo."
            except SupabaseError:
                mensaje = "Correo actualizado, pero no se pudo enviar la invitación: reenvíala desde el menú de acciones."
        else:
            mensaje = "Correo actualizado: desde ahora la persona debe iniciar sesión con el correo nuevo."
    return actualizado, mensaje


@router.patch("/{user_id}")
async def editar_usuario(
    user_id: str,
    cambios: UsuarioCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Cambia nombres, correo, rol, sede y/o horario. Los cambios de horario rigen para las marcaciones desde ahora;
    las marcaciones ya hechas conservan la sede que tenían. Devuelve la fila actualizada y, si corresponde, un `mensaje`."""
    fila, mensaje = await _aplicar_cambios(
        user_id, cambios.model_dump(exclude_unset=True), admin, sb, "No se pudo actualizar el usuario", cfg
    )
    return {**fila, "mensaje": mensaje}


@router.patch("/{user_id}/horario")
async def cambiar_horario(
    user_id: str,
    cambios: HorarioCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Cambia la jornada y/o los días laborables. Rige para las marcaciones que se hagan desde ahora."""
    fila, _ = await _aplicar_cambios(user_id, cambios.model_dump(exclude_unset=True), admin, sb, "No se pudo cambiar el horario")
    return fila


@router.post("/{user_id}/reiniciar-dispositivo")
async def reiniciar_dispositivo(
    user_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Quita el celular vinculado, para que la persona pueda vincular otro (cambió de celular), y cierra sus
    sesiones abiertas: así el celular anterior (perdido, robado o simplemente viejo) no puede volver a vincularse
    solo con la sesión que tenía; tendría que escribir la contraseña otra vez. También borra la clave de seguridad
    que ese celular había registrado (app/firma_dispositivo.py): el nuevo registrará la suya.
    La bitácora registra el evento «resetear_dispositivo» con quién lo hizo."""
    fila = await sb.usuario_fila(user_id)
    if not fila:
        raise HTTPException(404, "Usuario no encontrado")
    if not fila.get("dispositivo_id"):
        return {"mensaje": "Esa persona no tenía un celular vinculado"}
    try:
        # Orden: primero las sesiones, después el vínculo. Si algo falla a medias, el celular sigue vinculado y
        # el administrador puede repetir la acción; al revés, el reintento no cerraría las sesiones.
        # Si quien reinicia es la misma persona, su sesión actual tampoco sobrevive (vuelve a iniciar sesión).
        await sb.cerrar_sesiones(user_id)
        # La clave de seguridad es del celular que se desvincula: el nuevo registrará la suya.
        await sb.actualizar_usuario(
            user_id,
            {"dispositivo_id": None, "clave_publica": None, "clave_evidencia": None, "clave_registrada_at": None, "updated_by": admin.id},
        )
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo reiniciar el celular: {e.message}")
    return {"mensaje": "Celular desvinculado y sesiones cerradas: la persona deberá iniciar sesión de nuevo y podrá vincular otro celular"}
