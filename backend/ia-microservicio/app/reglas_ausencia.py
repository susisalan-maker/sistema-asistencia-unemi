"""Reglas de las ausencias (docs/logica-negocio.md, sección 2.3): funciones puras, sin red ni base de datos.

Para cada persona y cada día laborable ya terminado se mira qué marcó, y como mucho se genera UNA anomalía:

  | Marcó ese día                          | Anomalía               |
  |----------------------------------------|------------------------|
  | nada                                   | `sin_ingreso`          |
  | ingreso y salida a almorzar            | `sin_regreso_almuerzo` |
  | cualquier otra jornada incompleta      | `sin_salida`           |
  | las cuatro                             | ninguna                |

`sin_regreso_almuerzo` va antes que `sin_salida` porque es la causa: la secuencia exige el regreso del almuerzo
antes de la salida, así que quien no regresó no podía marcar la salida y avisar dos veces sería ruido.
Un día que no es laborable para la persona (otro día de la semana o feriado activo) no genera nada.
"""
from datetime import date, datetime, time, timedelta

from app.reglas_marcacion import NOMBRES_DIA, ZONA_LOCAL, Hallazgo, a_local, parsear_hora

TIPOS_AUSENCIA = ("sin_ingreso", "sin_salida", "sin_regreso_almuerzo")


def fin_de_jornada(dia: date, jornada_fin: str | time) -> datetime:
    """El momento en que termina la jornada de ese día (hora de Ecuador)."""
    return datetime.combine(dia, parsear_hora(jornada_fin), tzinfo=ZONA_LOCAL)


def texto_dia(dia: date) -> str:
    return f"{NOMBRES_DIA[dia.isoweekday()]} {dia:%d/%m/%Y}"


def cubre_feriado(dia: date, feriados: list[dict]) -> dict | None:
    for f in feriados:
        if date.fromisoformat(f["fecha_inicio"]) <= dia <= date.fromisoformat(f["fecha_fin"]):
            return f
    return None


def dias_a_revisar(
    ahora: datetime, usuario: dict, feriados: list[dict], gracia_min: int, dias_atras: int
) -> list[date]:
    """Días (más antiguos primero) cuya jornada ya terminó —con la gracia— y en los que la persona debía trabajar."""
    hoy = a_local(ahora).date()
    # Nadie debe ausencias de antes de existir: el día en que se creó la cuenta no cuenta (pudo crearse a media jornada).
    creada = a_local(datetime.fromisoformat(usuario["created_at"])).date()
    dias = []
    for atras in range(dias_atras, -1, -1):
        dia = hoy - timedelta(days=atras)
        if dia <= creada or dia.isoweekday() not in usuario["dias_laborables"] or cubre_feriado(dia, feriados):
            continue
        if ahora >= fin_de_jornada(dia, usuario["jornada_fin"]) + timedelta(minutes=gracia_min):
            dias.append(dia)
    return dias


def _hora(iso: str) -> str:
    return a_local(datetime.fromisoformat(iso)).strftime("%H:%M")


def evaluar_jornada(dia: date, marcas_del_dia: list[dict], usuario: dict) -> tuple[Hallazgo, str | None] | None:
    """Devuelve (hallazgo, id de la marcación a la que se refiere) o None si la jornada está completa.
    `marcas_del_dia` es lo que marcó ese día, de la más antigua a la más reciente."""
    cuando = texto_dia(dia)
    if not marcas_del_dia:
        inicio, fin = parsear_hora(usuario["jornada_inicio"]), parsear_hora(usuario["jornada_fin"])
        return Hallazgo(
            "sin_ingreso", f"No marcó nada el {cuando} (jornada {inicio:%H:%M}–{fin:%H:%M})"
        ), None
    tipos = [m["tipo"] for m in marcas_del_dia]
    ultima = marcas_del_dia[-1]
    if "salida" in tipos:
        return None
    if tipos == ["ingreso", "salida_almuerzo"]:
        return Hallazgo(
            "sin_regreso_almuerzo",
            f"Salió a almorzar a las {_hora(ultima['fecha_hora'])} el {cuando} y no marcó el regreso",
        ), ultima["id"]
    return Hallazgo(
        "sin_salida",
        f"No marcó la salida el {cuando}; su última marcación fue «{ultima['tipo']}» a las {_hora(ultima['fecha_hora'])}",
    ), ultima["id"]
