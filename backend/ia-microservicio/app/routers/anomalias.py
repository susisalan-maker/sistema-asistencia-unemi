"""Las anomalías de la propia persona y su justificación (docs/logica-negocio.md, secciones 3 a 6).

Solo ve y justifica lo suyo: una anomalía ajena responde 404, igual que una que no existe. Justificar es una
conversación corta: la persona escribe, el asistente (IA) repregunta una vez si hace falta y, al cerrar, el caso pasa a
`en_revision` (o a `justificada` si es de riesgo mínimo y la IA está muy segura). Mientras dura sigue `pendiente`.
La validación real (dueño, estado, plazo, largo, máximo de mensajes) la hacen las funciones de la base dentro de una
transacción; aquí se traducen sus errores y se aplican las reglas de `chat_ia.py`. Si la IA no responde, el caso pasa a
revisión humana: la IA nunca bloquea una justificación.
"""
import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import chat_ia
from app.auth import exigir_usuario, get_supabase
from app.config import Settings, get_settings
from app.ia import ClienteIA, IAError, get_ia
from app.schemas import JustificacionNueva
from app.supabase_client import SupabaseClient, SupabaseError

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/anomalias", tags=["anomalias"])

TEXTO_MIN = 10          # la primera explicación necesita contenido
RESPUESTA_MIN = 2       # las respuestas a la repregunta pueden ser cortas («sí», «no tengo»)
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
    salida = {**_resumen(a), "mensajes": [], "decision": None, "comentario": None, "automatica": False}
    try:
        salida["plazo_revision_h"] = int((await sb.configuracion()).get("plazo_revision_h", 48))
    except SupabaseError:
        salida["plazo_revision_h"] = 48        # solo es un texto informativo: no vale la pena fallar por esto
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
            # Aprobada sin nadie que la revisara: la decidió el sistema (riesgo mínimo + IA muy segura).
            salida["automatica"] = j["decision_final"] == "aprobada" and not j.get("revisado_por")
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


def _error_de_justificacion(e: SupabaseError) -> HTTPException:
    m = e.message.lower()
    if "no encontrada" in m:
        return HTTPException(404, "Anomalía no encontrada")
    if "venció" in m or "ya no admite" in m:
        return HTTPException(409, "Esta anomalía ya no se puede justificar: " + (
            "el plazo venció" if "venció" in m else "ya fue justificada o resuelta"))
    return HTTPException(502, f"No se pudo guardar tu justificación: {e.message}")


@router.post("/{anomalia_id}/justificacion")
async def justificar(
    anomalia_id: UUID,
    datos: JustificacionNueva,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
    ia: ClienteIA | None = Depends(get_ia),
    cfg: Settings = Depends(get_settings),
):
    a = await _propia(sb, usuario, anomalia_id)      # 404 si es ajena, antes de tocar nada
    id_anomalia = str(anomalia_id)
    texto = datos.texto.strip()
    try:
        empezada = await sb.justificacion_de_anomalia(id_anomalia) is not None
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo leer la justificación: {e.message}")
    minimo = RESPUESTA_MIN if empezada else TEXTO_MIN
    if not minimo <= len(texto) <= TEXTO_MAX:
        raise HTTPException(422, f"Escribe de {minimo} a {TEXTO_MAX} caracteres" if empezada
                            else f"Explica lo ocurrido en {TEXTO_MIN} a {TEXTO_MAX} caracteres")

    try:
        jid = await sb.registrar_mensaje_usuario(str(usuario["id"]), id_anomalia, texto, cfg.ia_max_mensajes_usuario)
    except SupabaseError as e:
        if "máximo de mensajes" in e.message.lower():
            # Ya había usado todos sus mensajes y el caso seguía abierto (p. ej. la IA falló antes de cerrarlo): se cierra ahora.
            try:
                await sb.cerrar_justificacion(id_anomalia, None, None, None, False)
            except SupabaseError as e2:
                raise _error_de_justificacion(e2)
            return await _detalle(sb, await _propia(sb, usuario, anomalia_id))
        raise _error_de_justificacion(e)

    try:
        mensajes = await sb.mensajes_de_justificacion(jid)
        plan = await _plan(ia, cfg, a, mensajes)
        if plan.respuesta:
            await sb.registrar_mensaje_asistente(jid, plan.respuesta)
        if plan.accion == "cerrar":
            await sb.cerrar_justificacion(id_anomalia, plan.clasificacion, plan.confianza, plan.resumen, plan.auto_aprobar)
    except SupabaseError as e:
        raise _error_de_justificacion(e)
    return await _detalle(sb, await _propia(sb, usuario, anomalia_id))


async def _plan(ia: ClienteIA | None, cfg: Settings, a: dict, mensajes: list[dict]) -> chat_ia.Plan:
    """Qué hacer después del mensaje de la persona: preguntar, o cerrar (con o sin lo que concluyó la IA)."""
    if ia is None:
        return chat_ia.plan_sin_ia()
    ultima = chat_ia.es_ultima_oportunidad(mensajes, cfg.ia_max_mensajes_usuario, cfg.ia_max_preguntas)
    caso = {"tipo": a["tipo"], "detalle": a.get("detalle"), "fecha": a.get("created_at")}
    try:
        ev = await ia.evaluar(caso, mensajes, ultima)
    except IAError as e:
        log.warning("La IA no pudo evaluar la justificación (%s): pasa a revisión humana", e)
        return chat_ia.plan_por_fallo_de_ia()
    return chat_ia.planificar(
        ev, mensajes, a["tipo"], max_mensajes=cfg.ia_max_mensajes_usuario, max_preguntas=cfg.ia_max_preguntas,
        autoaprobar=cfg.ia_autoaprobar, umbral=cfg.ia_umbral_autoaprobar,
    )
