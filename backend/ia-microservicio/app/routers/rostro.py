"""Registro del rostro (docs/logica-negocio.md, sección 2.1).

La app manda el consentimiento y de 3 a 5 fotos guiadas. El servicio comprueba la calidad de cada una, que
todas sean de la misma persona, calcula un vector por foto y los guarda cifrados (AES-256-GCM) en `rostros`.
Las fotos no se guardan. Un usuario que ya tiene rostro no puede registrar otro: el administrador lo
resetea desde el panel (función `resetear_rostro` de la base) y la persona lo registra de nuevo.
"""
import asyncio
from datetime import datetime, timezone
from itertools import combinations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from app import cifrado
from app.auth import exigir_usuario, get_supabase
from app.biometria import ErrorRostro, MotorFacial, get_motor
from app.config import Settings, get_settings
from app.schemas import RegistroRostro
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/rostro", tags=["rostro"])

# Fotos 2 en adelante son «giros leves»: se tolera más giro que en la primera, que es de frente.
MAX_GIRO_FRENTE = 0.30
MAX_GIRO_LEVE = 0.60


def _analizar_todas(motor: MotorFacial, fotos: list[str]) -> list[np.ndarray]:
    vectores = []
    for i, foto in enumerate(fotos, start=1):
        try:
            analisis = motor.analizar(foto, MAX_GIRO_FRENTE if i == 1 else MAX_GIRO_LEVE)
        except ErrorRostro as e:
            raise HTTPException(422, f"Foto {i}: {e.mensaje}")
        vectores.append(analisis.vector)
    return vectores


@router.post("/registro", status_code=201)
async def registrar(
    datos: RegistroRostro,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
    motor: MotorFacial = Depends(get_motor),
):
    if not datos.consentimiento:
        raise HTTPException(422, "Debes aceptar el consentimiento de uso de datos biométricos")
    if usuario.get("fecha_registro_rostro"):
        raise HTTPException(409, "Ya tienes un rostro registrado. Si necesitas cambiarlo, pide a Talento Humano que lo reinicie")

    try:
        clave = cifrado.clave_desde_texto(cfg.rostro_clave_aes)
    except cifrado.ClaveInvalida as e:
        raise HTTPException(503, f"El registro de rostro no está configurado en el servidor: {e}")

    vectores = np.array(await asyncio.to_thread(_analizar_todas, motor, datos.fotos))

    # Todas las fotos deben ser de la misma persona (evita registrar a alguien más por error o mala fe).
    sims = vectores @ vectores.T
    peor = min(float(sims[i, j]) for i, j in combinations(range(len(vectores)), 2))
    if peor < cfg.rostro_umbral_registro:
        raise HTTPException(422, "Las fotos no parecen ser de la misma persona. Repite el registro con tu rostro en todas")

    cifrado_bytes = cifrado.cifrar_vectores(vectores, clave, usuario["id"])
    try:
        await sb.registrar_rostro(
            usuario["id"],
            cifrado.bytea_para_postgrest(cifrado_bytes),
            cfg.rostro_version_clave,
            datetime.now(timezone.utc).isoformat(),
        )
    except SupabaseError as e:
        if "ya tiene un rostro" in e.message.lower():
            raise HTTPException(409, "Ya tienes un rostro registrado. Si necesitas cambiarlo, pide a Talento Humano que lo reinicie")
        raise HTTPException(502, f"No se pudo guardar tu rostro: {e.message}")
    return {"rostro_registrado": True, "mensaje": "Tu rostro quedó registrado"}
