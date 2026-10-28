"""Verificación facial de la marcación (docs/logica-negocio.md, sección 2.1).

Hay dos verificadores con la misma interfaz:
  * `VerificadorFacial` (VERIFICACION_FACIAL=real, el predeterminado): compara la selfie con los vectores
    cifrados de la tabla `rostros`. Sin rostro registrado no se puede marcar.
  * `VerificadorSimulado` (VERIFICACION_FACIAL=simulada): da por buena toda marcación. Solo para
    desarrollo; avisa en el arranque.

Detección de vida: PASIVA y en el servidor (ver app/biometria.py): ayuda contra fotos impresas y pantallas,
pero no es infalible. Una detección ACTIVA (parpadeo, giro) sí necesitaría un build de desarrollo de la app.

CUIDADO: las marcaciones guardadas con el verificador simulado quedan como «verificada» sin serlo.
Son datos de prueba; no deben usarse como evidencia real.
"""
import asyncio
import logging
from dataclasses import dataclass
from typing import Literal, Protocol

import numpy as np
from fastapi import Depends, HTTPException

from app import cifrado
from app.auth import get_supabase
from app.biometria import Criterios, ErrorRostro, MotorFacial, get_motor
from app.config import Settings, get_settings
from app.supabase_client import SupabaseClient

log = logging.getLogger("uvicorn.error")

@dataclass(frozen=True)
class ResultadoVerificacion:
    estado: Literal["verificada", "pendiente", "fallida"]
    score: float | None = None   # similitud entre 0 y 1; None si no hubo comparación
    motivo: str | None = None    # por qué falló (p. ej. «no es una cara real»)


class Verificador(Protocol):
    async def verificar(
        self, usuario: dict, selfie_b64: str | None, criterios: Criterios | None = None
    ) -> ResultadoVerificacion: ...


class VerificadorSimulado:
    async def verificar(
        self, usuario: dict, selfie_b64: str | None, criterios: Criterios | None = None
    ) -> ResultadoVerificacion:
        return ResultadoVerificacion("verificada")


class VerificadorFacial:
    def __init__(self, sb: SupabaseClient, motor: MotorFacial, clave: bytes, umbral: float, version_clave: int):
        self._sb, self._motor, self._clave, self._umbral, self._version = sb, motor, clave, umbral, version_clave

    async def verificar(
        self, usuario: dict, selfie_b64: str | None, criterios: Criterios | None = None
    ) -> ResultadoVerificacion:
        """`criterios` son los umbrales vigentes del panel; sin ellos se usa el umbral con que se creó el verificador
        y los límites de siempre."""
        c = criterios or Criterios(rostro_umbral=self._umbral)
        sin_rostro = HTTPException(409, "Primero debes registrar tu rostro para poder marcar")
        if not usuario.get("fecha_registro_rostro"):
            raise sin_rostro
        if not selfie_b64:
            raise HTTPException(422, "Falta la selfie para verificar tu rostro")

        fila = await self._sb.rostro_fila(usuario["id"])
        if not fila:  # las fechas dicen que hay rostro pero la fila no existe: dato inconsistente
            raise sin_rostro
        try:
            if fila["version_clave"] != self._version:
                raise cifrado.CifradoInvalido("Versión de clave distinta")
            guardados = cifrado.descifrar_vectores(
                cifrado.bytea_desde_postgrest(fila["vectores_cifrados"]), self._clave, usuario["id"]
            )
        except cifrado.CifradoInvalido as e:
            log.error("No se pudo leer el rostro de %s: %s", usuario["id"], e)
            raise HTTPException(503, "No pudimos leer tu rostro registrado. Contacta a Talento Humano")

        try:
            # En la selfie de cada marcación se pide mirar de frente (giro algo menor que en el registro).
            analisis = await asyncio.to_thread(self._motor.analizar, selfie_b64, c.giro_marcacion, criterios)
        except ErrorRostro as e:
            if e.codigo == "no_es_real":
                # Parece una foto o una pantalla: es un posible intento de suplantación (queda la anomalía).
                return ResultadoVerificacion("fallida", None, "La selfie parece una foto o una pantalla, no un rostro real")
            # Una foto mala no es un intento de suplantación: se pide repetirla, sin anomalía.
            raise HTTPException(422, e.mensaje)

        score = float(np.max(guardados @ analisis.vector))
        score = round(min(max(score, 0.0), 1.0), 4)
        if score >= c.rostro_umbral:
            return ResultadoVerificacion("verificada", score)
        return ResultadoVerificacion("fallida", score, "El rostro no coincide con el registrado")


def configurar_verificador(cfg: Settings) -> bytes | None:
    """Valida la configuración facial al arrancar. Devuelve la clave (o None si es simulada)."""
    if cfg.verificacion_facial == "simulada":
        return None
    return cifrado.clave_desde_texto(cfg.rostro_clave_aes)  # lanza ClaveInvalida si falta o está mal


def get_verificador(
    sb: SupabaseClient = Depends(get_supabase), cfg: Settings = Depends(get_settings)
) -> Verificador:
    if cfg.verificacion_facial == "simulada":
        return VerificadorSimulado()
    try:
        clave = cifrado.clave_desde_texto(cfg.rostro_clave_aes)
    except cifrado.ClaveInvalida as e:
        raise HTTPException(503, f"La verificación facial no está configurada: {e}")
    return VerificadorFacial(sb, get_motor(cfg), clave, cfg.rostro_umbral, cfg.rostro_version_clave)
