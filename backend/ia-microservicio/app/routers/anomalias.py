"""Las anomalías de la propia persona y su justificación (docs/logica-negocio.md, secciones 3 y 4).

Solo ve y justifica lo suyo: una anomalía ajena responde 404, igual que una que no existe. Justificar pasa la
anomalía a `en_revision` para que la revise el Administrador; la validación real (dueño, estado `pendiente`,
plazo) la hace la función `justificar_anomalia` de la base, dentro de una transacción, así que dos envíos a la vez
no pueden justificarla dos veces. Aquí solo se traducen sus errores a respuestas claras.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.auth import exigir_usuario, get_supabase
from app.schemas import JustificacionNueva
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/anomalias", tags=["anomalias"])

TEXTO_MIN = 10
TEXTO_MAX = 1000


def _fecha(valor: str) -> datetime:
    return datetime.fromisoformat(valor.replace("Z", "+00:00"))


def _resumen(a: dict) -> dict:
    vence = _fecha(a["fecha_vencimiento"])
    return {
        "id": a["id"],
        "caso": f"A-{a['numero']}",
        "tipo": a["tipo"],
        "estado": a["estado"],
        "detalle": a.get("detalle"),
        "creada": a["created_at"],
        "vence": a["fecha_vencimiento"],
        "puede_justificar": a["estado"] == "pendiente" and vence > datetime.now(timezone.utc),
    }


async def _detalle(sb: SupabaseClient, a: dict) -> dict:
    salida = {**_resumen(a), "mensajes": [], "decision": None, "comentario": None}
    j = await sb.justificacion_de_anomalia(a["id"])
    if j:
        salida["mensajes"] = [
            {"emisor": m["emisor"], "contenido": m["contenido"], "fecha": m["created_at"]}
            for m in await sb.mensajes_de_justificacion(j["id"])
        ]
        # «escalada» es un paso interno: para la persona el caso sigue en revisión.
        if j.get("decision_final") in ("aprobada", "rechazada"):
            salida["decision"] = j["decision_final"]
            salida["comentario"] = j.get("comentario_admin")
    return salida


@router.get("")
async def mis_anomalias(usuario: dict = Depends(exigir_usuario), sb: SupabaseClient = Depends(get_supabase)):
    try:
        filas = await sb.anomalias_de_usuario(usuario["id"])
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudieron leer tus anomalías: {e.message}")
    return [_resumen(a) for a in filas]


async def _propia(sb: SupabaseClient, usuario: dict, anomalia_id: UUID) -> dict:
    try:
        a = await sb.anomalia_de_usuario(usuario["id"], str(anomalia_id))
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo leer la anomalía: {e.message}")
    if not a:
        raise HTTPException(404, "Anomalía no encontrada")
    return a


@router.get("/{anomalia_id}")
async def una_anomalia(
    anomalia_id: UUID, usuario: dict = Depends(exigir_usuario), sb: SupabaseClient = Depends(get_supabase)
):
    a = await _propia(sb, usuario, anomalia_id)
    try:
        return await _detalle(sb, a)
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo leer la justificación: {e.message}")


@router.post("/{anomalia_id}/justificacion")
async def justificar(
    anomalia_id: UUID,
    datos: JustificacionNueva,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
):
    texto = datos.texto.strip()
    if not TEXTO_MIN <= len(texto) <= TEXTO_MAX:
        raise HTTPException(422, f"Explica lo ocurrido en {TEXTO_MIN} a {TEXTO_MAX} caracteres")
    await _propia(sb, usuario, anomalia_id)      # 404 si es ajena, antes de tocar nada
    try:
        await sb.justificar_anomalia(usuario["id"], str(anomalia_id), texto)
    except SupabaseError as e:
        m = e.message.lower()
        if "no encontrada" in m:
            raise HTTPException(404, "Anomalía no encontrada")
        if "venció" in m or "ya no admite" in m:
            raise HTTPException(409, "Esta anomalía ya no se puede justificar: " + (
                "el plazo venció" if "venció" in m else "ya fue justificada o resuelta"))
        raise HTTPException(502, f"No se pudo guardar tu justificación: {e.message}")
    a = await _propia(sb, usuario, anomalia_id)
    return await _detalle(sb, a)
