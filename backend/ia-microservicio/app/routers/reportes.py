"""Módulo de Reportes (docs/logica-negocio.md, sección 10). Los números del reporte los calcula la base de datos y el panel los
lee directo de Supabase; este servicio solo hace lo que el panel no puede: pedirle a la IA el resumen ejecutivo.

El panel manda SOLO números ya agregados (`DatosResumen`): nunca personas ni textos de justificaciones. Un solo llamado por reporte.
Si no hay IA configurada o falla, el reporte sigue funcionando: el panel muestra el aviso y deja reintentar.
"""
from fastapi import APIRouter, Depends, HTTPException

from app.auth import Administrador, exigir_administrador
from app.ia import INSTRUCCIONES_REPORTE, IAError, get_ia, texto_del_reporte
from app.schemas import DatosResumen

router = APIRouter(prefix="/reportes", tags=["reportes"])


def _explicar(e: IAError) -> str:
    if e.status in (401, 403):
        return "La llave de la IA no es válida o no tiene permiso. Revísala en Configuración → Inteligencia artificial"
    if e.status in (400, 404):
        return "El modelo de la IA no existe o no está disponible para esa llave. Revísalo en Configuración → Inteligencia artificial"
    if e.status == 429:
        return "La IA rechazó la llamada por límite de uso o de saldo. Intenta de nuevo en un momento"
    return "No se pudo generar el resumen con la IA"


@router.post("/resumen")
async def resumen(
    datos: DatosResumen,
    _: Administrador = Depends(exigir_administrador),
    cliente=Depends(get_ia),
):
    """El resumen ejecutivo del periodo, redactado por la IA activa en Configuración. Solo un administrador puede pedirlo."""
    if cliente is None:
        raise HTTPException(503, "Aún no hay una IA configurada. Agrega una llave en Configuración → Inteligencia artificial")
    try:
        texto = await cliente.redactar(INSTRUCCIONES_REPORTE, texto_del_reporte(datos.model_dump()))
    except IAError as e:
        raise HTTPException(502, _explicar(e))
    return {"resumen": texto}
