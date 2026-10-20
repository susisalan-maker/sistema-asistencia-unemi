"""Feriados: días no laborables para toda la institución.

El panel solo lee la tabla; toda escritura pasa por aquí (misma regla que sedes y bloques).
No se borran: se desactivan. Marcar en un feriado activo genera la anomalía `dia_no_laborable`
(ver docs/logica-negocio.md, sección 2.3).
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador, get_supabase
from app.schemas import FeriadoCambios, FeriadoNuevo
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/feriados", tags=["feriados"])


def _duplicado(e: SupabaseError) -> bool:
    return e.status == 409 and "duplicate" in e.message.lower()


async def _o_404(sb: SupabaseClient, feriado_id: str) -> dict:
    fila = await sb.feriado_fila(feriado_id)
    if not fila:
        raise HTTPException(404, "Feriado no encontrado")
    return fila


@router.post("", status_code=201)
async def crear_feriado(
    datos: FeriadoNuevo,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    fechas = datos.fechas()
    if len(fechas) == 1:
        try:
            return await sb.insertar_feriado(
                {"fecha": fechas[0].isoformat(), "nombre": datos.nombre, "created_by": admin.id}
            )
        except SupabaseError as e:
            if _duplicado(e):
                raise HTTPException(409, "Ya hay un feriado registrado en esa fecha")
            raise HTTPException(502, f"No se pudo guardar el feriado: {e.message}")

    # Varios días seguidos: una fila por día (así cada día se puede desactivar por separado, p. ej. un
    # puente que la institución sí trabaja). Las fechas que ya tenían feriado se respetan y se informan.
    creados: list[str] = []
    omitidos: list[str] = []
    for dia in fechas:
        try:
            await sb.insertar_feriado({"fecha": dia.isoformat(), "nombre": datos.nombre, "created_by": admin.id})
            creados.append(dia.isoformat())
        except SupabaseError as e:
            if _duplicado(e):
                omitidos.append(dia.isoformat())
                continue
            hecho = f" Ya se crearon {len(creados)} día(s) antes del error." if creados else ""
            raise HTTPException(502, f"No se pudo guardar el feriado: {e.message}.{hecho}")
    if not creados:
        raise HTTPException(409, "Ya hay un feriado registrado en todas esas fechas")
    return {"creados": creados, "omitidos": omitidos}


@router.patch("/{feriado_id}")
async def editar_feriado(
    feriado_id: str,
    cambios: FeriadoCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _o_404(sb, feriado_id)
    datos = cambios.model_dump(exclude_unset=True)
    if "fecha" in datos:
        datos["fecha"] = datos["fecha"].isoformat()
    try:
        return await sb.actualizar_feriado(feriado_id, {**datos, "updated_by": admin.id})
    except SupabaseError as e:
        if _duplicado(e):
            raise HTTPException(409, "Ya hay un feriado registrado en esa fecha")
        raise HTTPException(502, f"No se pudo guardar el feriado: {e.message}")


async def _estado(feriado_id: str, activo: bool, admin: Administrador, sb: SupabaseClient) -> str:
    fila = await _o_404(sb, feriado_id)
    if fila["activo"] == activo:
        return "ya estaba así"
    try:
        await sb.actualizar_feriado(feriado_id, {"activo": activo, "updated_by": admin.id})
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo cambiar el feriado: {e.message}")
    return "ok"


@router.post("/{feriado_id}/desactivar")
async def desactivar_feriado(
    feriado_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _estado(feriado_id, False, admin, sb)
    return {"mensaje": "Feriado desactivado; las marcaciones de ese día dejan de generar anomalía por feriado"}


@router.post("/{feriado_id}/activar")
async def activar_feriado(
    feriado_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    await _estado(feriado_id, True, admin, sb)
    return {"mensaje": "Feriado activado"}
