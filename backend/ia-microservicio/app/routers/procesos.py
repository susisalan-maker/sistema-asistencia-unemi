"""Procesos periódicos. No son para personas: los llama un programador con un secreto compartido."""
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException

from app.auth import get_supabase
from app.config import Settings, get_settings
from app.procesos import ejecutar_ausencias
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/procesos", tags=["procesos"])


def get_ahora() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/ausencias")
async def ausencias(
    x_proceso_secreto: str | None = Header(default=None),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
    ahora: datetime = Depends(get_ahora),
):
    """Genera las anomalías `sin_ingreso`, `sin_salida` y `sin_regreso_almuerzo` de las jornadas ya terminadas y
    pasa a `sin_justificar` las que vencieron. Se puede repetir sin duplicar nada."""
    if not cfg.procesos_secreto:
        raise HTTPException(503, "Los procesos periódicos están apagados: falta PROCESOS_SECRETO en el servidor")
    if not x_proceso_secreto or not hmac.compare_digest(x_proceso_secreto, cfg.procesos_secreto):
        raise HTTPException(401, "Secreto inválido")
    try:
        return await ejecutar_ausencias(sb, ahora, cfg.ausencias_gracia_min, cfg.ausencias_dias_atras)
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo completar el proceso: {e.message}")
