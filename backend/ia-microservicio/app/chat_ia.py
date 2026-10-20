"""Reglas del chat de justificación: cuándo se repregunta, cuándo se cierra y cuándo puede aprobarse solo.

Son funciones puras (sin red ni base de datos) para poder probarlas una por una. El modelo opina; estas reglas deciden:
aunque alguien lo engañe, lo peor que logra es que el caso llegue al administrador (docs/logica-negocio.md, sección 5).
"""
from dataclasses import dataclass

from app.ia import Evaluacion

RESPUESTA_FUERA_DE_TEMA = "Solo puedo ayudarte con la justificación de esta anomalía. ¿Qué ocurrió ese día?"
CIERRE_FUERA_DE_TEMA = (
    "Cerré la conversación porque los mensajes no tratan de tu caso. "
    "Talento Humano revisará lo que ya escribiste."
)
CIERRE_SIN_RESPUESTA = "Recibimos tu explicación y la enviamos a Talento Humano para su revisión."

# Los únicos tipos que pueden aprobarse solos: faltas de menor riesgo. Una marcación fuera de zona, un desplazamiento
# raro, un rostro que no coincidió o un día no laborable SIEMPRE los revisa una persona.
TIPOS_AUTOAPROBABLES = frozenset({"fuera_horario", "almuerzo_excedido", "sin_regreso_almuerzo", "sin_salida"})


@dataclass
class Plan:
    accion: str                      # 'preguntar' (sigue la conversación) | 'cerrar' (pasa a revisión)
    respuesta: str | None            # lo que dice el asistente (None: no se agrega mensaje)
    clasificacion: str | None = None
    confianza: float | None = None
    resumen: str | None = None
    auto_aprobar: bool = False


def _asistente(mensajes: list[dict]) -> list[str]:
    return [m["contenido"] for m in mensajes if m["emisor"] == "asistente"]


def mensajes_de_la_persona(mensajes: list[dict]) -> int:
    return sum(1 for m in mensajes if m["emisor"] == "usuario")


def preguntas_hechas(mensajes: list[dict]) -> int:
    """Respuestas del asistente que no son el aviso fijo de «fuera de tema»."""
    return sum(1 for c in _asistente(mensajes) if c != RESPUESTA_FUERA_DE_TEMA)


def avisos_seguidos_fuera_de_tema(mensajes: list[dict]) -> int:
    """Cuántas de las últimas respuestas del asistente fueron el aviso de «fuera de tema», una tras otra."""
    n = 0
    for c in reversed(_asistente(mensajes)):
        if c != RESPUESTA_FUERA_DE_TEMA:
            break
        n += 1
    return n


def es_ultima_oportunidad(mensajes: list[dict], max_mensajes: int, max_preguntas: int) -> bool:
    return mensajes_de_la_persona(mensajes) >= max_mensajes or preguntas_hechas(mensajes) >= max_preguntas


def plan_sin_ia() -> Plan:
    """Sin llave de IA, o si la IA falla: el caso pasa tal cual a revisión humana, sin clasificar."""
    return Plan(accion="cerrar", respuesta=None)


def plan_por_fallo_de_ia() -> Plan:
    return Plan(accion="cerrar", respuesta=CIERRE_SIN_RESPUESTA)


def planificar(
    ev: Evaluacion, mensajes: list[dict], tipo: str, *,
    max_mensajes: int, max_preguntas: int, autoaprobar: bool, umbral: float,
) -> Plan:
    """`mensajes` ya incluye el último de la persona. Decide qué hacer con lo que opinó el modelo."""
    if ev.fuera_de_tema:
        # El aviso es fijo: el modelo no puede usar este camino para contestar otra cosa.
        if avisos_seguidos_fuera_de_tema(mensajes) + 1 >= 2 or mensajes_de_la_persona(mensajes) >= max_mensajes:
            return Plan(accion="cerrar", respuesta=CIERRE_FUERA_DE_TEMA)
        return Plan(accion="preguntar", respuesta=RESPUESTA_FUERA_DE_TEMA)

    cerrar = (
        ev.accion == "cerrar"
        or not ev.respuesta
        or es_ultima_oportunidad(mensajes, max_mensajes, max_preguntas)
    )
    if not cerrar:
        return Plan(accion="preguntar", respuesta=ev.respuesta)

    hubo_fuera_de_tema = RESPUESTA_FUERA_DE_TEMA in _asistente(mensajes)
    auto = (
        autoaprobar
        and ev.clasificacion == "aceptable"
        and ev.confianza is not None and ev.confianza >= umbral
        and tipo in TIPOS_AUTOAPROBABLES
        and not hubo_fuera_de_tema
    )
    return Plan(
        accion="cerrar",
        respuesta=ev.respuesta or CIERRE_SIN_RESPUESTA,
        clasificacion=ev.clasificacion,
        confianza=ev.confianza,
        resumen=ev.resumen,
        auto_aprobar=auto,
    )
