"""Sedes (campus) y sus bloques (edificios): las zonas donde se puede marcar asistencia.

El panel solo lee estas tablas; toda escritura pasa por aquí para validar las reglas y dejar
constancia de quién la hizo. Nada se borra: se desactiva (ver docs/logica-negocio.md, sección 9).
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador, get_supabase
from app.schemas import BloqueCambios, BloqueNuevo, SedeCambios, SedeNueva
from app.supabase_client import SupabaseClient, SupabaseError

router_sedes = APIRouter(prefix="/sedes", tags=["sedes"])
router_bloques = APIRouter(prefix="/bloques", tags=["bloques"])


def _duplicado(e: SupabaseError) -> bool:
    return e.status == 409 and "duplicate" in e.message.lower()


async def _sede_o_404(sb: SupabaseClient, sede_id: str) -> dict:
    fila = await sb.sede_fila(sede_id)
    if not fila:
        raise HTTPException(404, "Sede no encontrada")
    return fila


async def _bloque_o_404(sb: SupabaseClient, bloque_id: str) -> dict:
    fila = await sb.bloque_fila(bloque_id)
    if not fila:
        raise HTTPException(404, "Bloque no encontrado")
    return fila


# ------------------------------------------------------------------ sedes
@router_sedes.post("", status_code=201)
async def crear_sede(
    datos: SedeNueva,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    try:
        return await sb.insertar_sede({**datos.model_dump(), "created_by": admin.id})
    except SupabaseError as e:
        if _duplicado(e):
            raise HTTPException(409, "Ya existe una sede con ese nombre")
        raise HTTPException(502, f"No se pudo guardar la sede: {e.message}")


@router_sedes.patch("/{sede_id}")
async def editar_sede(
    sede_id: str,
    cambios: SedeCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _sede_o_404(sb, sede_id)
    try:
        return await sb.actualizar_sede(
            sede_id, {**cambios.model_dump(exclude_unset=True), "updated_by": admin.id}
        )
    except SupabaseError as e:
        if _duplicado(e):
            raise HTTPException(409, "Ya existe una sede con ese nombre")
        raise HTTPException(502, f"No se pudo guardar la sede: {e.message}")


@router_sedes.post("/{sede_id}/desactivar")
async def desactivar_sede(
    sede_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    sede = await _sede_o_404(sb, sede_id)
    if not sede["activa"]:
        return {"mensaje": "La sede ya estaba inactiva"}
    asignados = await sb.contar_usuarios_activos_de_sede(sede_id)
    if asignados:
        raise HTTPException(
            409,
            f"La sede tiene {asignados} usuario(s) activo(s) asignado(s). "
            "Cámbialos de sede o desactívalos antes de desactivar la sede",
        )
    try:
        await sb.actualizar_sede(sede_id, {"activa": False, "updated_by": admin.id})
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo desactivar la sede: {e.message}")
    return {"mensaje": "Sede desactivada; su historial se conserva"}


@router_sedes.post("/{sede_id}/activar")
async def activar_sede(
    sede_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    sede = await _sede_o_404(sb, sede_id)
    if sede["activa"]:
        return {"mensaje": "La sede ya estaba activa"}
    try:
        await sb.actualizar_sede(sede_id, {"activa": True, "updated_by": admin.id})
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo activar la sede: {e.message}")
    return {"mensaje": "Sede activada"}


# ---------------------------------------------------------------- bloques
@router_bloques.post("", status_code=201)
async def crear_bloque(
    datos: BloqueNuevo,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    sede = await _sede_o_404(sb, str(datos.sede_id))
    if not sede["activa"]:
        raise HTTPException(409, "No se pueden agregar bloques a una sede inactiva")
    try:
        return await sb.insertar_bloque(
            {**datos.model_dump(mode="json"), "created_by": admin.id}
        )
    except SupabaseError as e:
        if _duplicado(e):
            raise HTTPException(409, "Ya existe un bloque con ese nombre en esta sede")
        raise HTTPException(502, f"No se pudo guardar el bloque: {e.message}")


@router_bloques.patch("/{bloque_id}")
async def editar_bloque(
    bloque_id: str,
    cambios: BloqueCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _bloque_o_404(sb, bloque_id)
    try:
        return await sb.actualizar_bloque(
            bloque_id, {**cambios.model_dump(exclude_unset=True), "updated_by": admin.id}
        )
    except SupabaseError as e:
        if _duplicado(e):
            raise HTTPException(409, "Ya existe un bloque con ese nombre en esta sede")
        raise HTTPException(502, f"No se pudo guardar el bloque: {e.message}")


@router_bloques.post("/{bloque_id}/desactivar")
async def desactivar_bloque(
    bloque_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    bloque = await _bloque_o_404(sb, bloque_id)
    if not bloque["activo"]:
        return {"mensaje": "El bloque ya estaba inactivo"}
    try:
        await sb.actualizar_bloque(bloque_id, {"activo": False, "updated_by": admin.id})
        quedan = await sb.contar_bloques_activos(bloque["sede_id"])
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo desactivar el bloque: {e.message}")
    aviso = "" if quedan else " La sede quedó sin bloques activos: se validará contra el círculo de la sede."
    return {"mensaje": f"Bloque desactivado.{aviso}"}


@router_bloques.post("/{bloque_id}/activar")
async def activar_bloque(
    bloque_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    bloque = await _bloque_o_404(sb, bloque_id)
    if bloque["activo"]:
        return {"mensaje": "El bloque ya estaba activo"}
    sede = await _sede_o_404(sb, bloque["sede_id"])
    if not sede["activa"]:
        raise HTTPException(409, "Activa primero la sede de este bloque")
    try:
        await sb.actualizar_bloque(bloque_id, {"activo": True, "updated_by": admin.id})
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo activar el bloque: {e.message}")
    return {"mensaje": "Bloque activado"}
