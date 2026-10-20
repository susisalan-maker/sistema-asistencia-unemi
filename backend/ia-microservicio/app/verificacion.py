"""Verificación facial de la marcación (docs/logica-negocio.md, sección 2.1).

HOY ES SIMULADA: `VerificadorSimulado` da por buena toda marcación, porque el registro de rostro
y la detección de vida todavía no están construidos. Así se puede probar el resto de la marcación
(secuencia, zona, horario, anomalías) sin la parte biométrica.

Cuando exista el registro de rostro, se escribe un verificador real con esta misma interfaz
(detección de vida + comparación con los vectores cifrados de la tabla `rostros`) y se cambia
únicamente `get_verificador`. Ni el endpoint ni sus pruebas cambian.

CUIDADO: las marcaciones guardadas con el verificador simulado quedan como «verificada» sin serlo.
Son datos de prueba; no deben usarse como evidencia real.
"""
from dataclasses import dataclass
from typing import Literal, Protocol


@dataclass(frozen=True)
class ResultadoVerificacion:
    estado: Literal["verificada", "pendiente", "fallida"]
    score: float | None = None   # similitud entre 0 y 1; None si no hubo comparación
    motivo: str | None = None    # por qué falló (p. ej. «no es una cara real»)


class Verificador(Protocol):
    async def verificar(self, usuario: dict, selfie_b64: str | None) -> ResultadoVerificacion: ...


class VerificadorSimulado:
    async def verificar(self, usuario: dict, selfie_b64: str | None) -> ResultadoVerificacion:
        return ResultadoVerificacion("verificada")


def get_verificador() -> Verificador:
    return VerificadorSimulado()
