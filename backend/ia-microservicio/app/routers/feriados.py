"""Feriados: días no laborables para toda la institución.

Cada feriado es UN registro con `fecha_inicio` y `fecha_fin` (un solo día si son iguales). La base de
datos impide que dos feriados activos se crucen.

El panel solo lee la tabla; toda escritura pasa por aquí (misma regla que sedes y bloques).
No se borran: se desactivan. Marcar en un feriado activo genera la anomalía `dia_no_laborable`
(ver docs/logica-negocio.md, sección 2.3).
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador, get_supabase
from app.schemas import FeriadoCambios, FeriadoNuevo, validar_rango_feriado
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/feriados", tags=["feriados"])


def _se_cruza(e: SupabaseError) -> bool:
    """La restricción de exclusión de la tabla rechazó el rango por cruzarse con otro feriado activo."""
    m = e.message.lower()
    return e.status == 409 and ("exclusion" in m or "conflicting key" in m)


MENSAJE_CRUCE = "Ya hay un feriado activo que se cruza con esas fechas"


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
    try:
        return await sb.insertar_feriado(
            {
                "fecha_inicio": datos.fecha_inicio.isoformat(),
                "fecha_fin": datos.fecha_fin.isoformat(),
                "nombre": datos.nombre,
                "created_by": admin.id,
            }
        )
    except SupabaseError as e:
        if _se_cruza(e):
            raise HTTPException(409, MENSAJE_CRUCE)
        raise HTTPException(502, f"No se pudo guardar el feriado: {e.message}")


@router.patch("/{feriado_id}")
async def editar_feriado(
    feriado_id: str,
    cambios: FeriadoCambios,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    actual = await _o_404(sb, feriado_id)
    datos = cambios.model_dump(exclude_unset=True)
    # El rango final se valida contra la fila actual (se puede cambiar solo el inicio o solo el fin).
    inicio = datos.get("fecha_inicio") or date.fromisoformat(actual["fecha_inicio"])
    fin = datos.get("fecha_fin") or date.fromisoformat(actual["fecha_fin"])
    try:
        validar_rango_feriado(inicio, fin)
    except ValueError as e:
        raise HTTPException(422, str(e))
    for campo in ("fecha_inicio", "fecha_fin"):
        if campo in datos:
            datos[campo] = datos[campo].isoformat()
    try:
        return await sb.actualizar_feriado(feriado_id, {**datos, "updated_by": admin.id})
    except SupabaseError as e:
        if _se_cruza(e):
            raise HTTPException(409, MENSAJE_CRUCE)
        raise HTTPException(502, f"No se pudo guardar el feriado: {e.message}")


async def _estado(feriado_id: str, activo: bool, admin: Administrador, sb: SupabaseClient) -> str:
    fila = await _o_404(sb, feriado_id)
    if fila["activo"] == activo:
        return "ya estaba así"
    try:
        await sb.actualizar_feriado(feriado_id, {"activo": activo, "updated_by": admin.id})
    except SupabaseError as e:
        if _se_cruza(e):  # al activar uno que se cruza con otro feriado que ya está activo
            raise HTTPException(409, MENSAJE_CRUCE)
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
