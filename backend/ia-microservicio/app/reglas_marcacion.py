"""Reglas de negocio de la marcación, como funciones puras (sin red ni base de datos).

Cada regla recibe datos ya leídos y devuelve un `Hallazgo` (la anomalía a registrar) o None.
Así cada anomalía se puede explicar con «pasó esto, el límite era aquello» y se prueba sola.
Ver docs/logica-negocio.md, secciones 2.1.1 y 2.3.
"""
from dataclasses import dataclass
from datetime import datetime, time, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

# Ecuador continental: UTC-5 todo el año (no hay horario de verano). Se usa un desfase fijo y no
# `zoneinfo` para no depender del paquete tzdata en Windows. Galápagos (UTC-6) no está contemplado.
ZONA_LOCAL = timezone(timedelta(hours=-5))

NOMBRES_DIA = {1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes", 6: "sábado", 7: "domingo"}
ORDEN_DEL_DIA = ("ingreso", "salida_almuerzo", "entrada_almuerzo", "salida")


@dataclass(frozen=True)
class Hallazgo:
    tipo: str          # valor del enum tipo_anomalia
    descripcion: str   # qué se midió y cuál era el límite


@dataclass(frozen=True)
class Zona:
    dentro: bool
    bloque_id: str | None
    descripcion: str


# ------------------------------------------------------------------ utilidades
def distancia_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia en metros entre dos puntos (fórmula de haversine)."""
    r = 6_371_000
    f1, f2 = radians(lat1), radians(lat2)
    a = sin((f2 - f1) / 2) ** 2 + cos(f1) * cos(f2) * sin(radians(lon2 - lon1) / 2) ** 2
    return 2 * r * asin(sqrt(a))


def a_local(momento: datetime) -> datetime:
    return momento.astimezone(ZONA_LOCAL)


def limites_del_dia(momento: datetime) -> tuple[datetime, datetime]:
    """Inicio (incluido) y fin (excluido) del día local que contiene `momento`."""
    local = a_local(momento)
    inicio = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return inicio, inicio + timedelta(days=1)


def parsear_hora(valor: str | time) -> time:
    """PostgREST entrega las columnas `time` como 'HH:MM:SS'."""
    return valor if isinstance(valor, time) else time.fromisoformat(valor)


def _minutos(hora: time) -> int:
    return hora.hour * 60 + hora.minute


def _hhmm(hora: time) -> str:
    return f"{hora.hour:02d}:{hora.minute:02d}"


# ------------------------------------------------------------------ secuencia
def siguiente_tipo(marcas_del_dia: list[dict]) -> str | None:
    """La marcación que corresponde ahora, o None si la jornada ya tiene las cuatro."""
    hechas = len(marcas_del_dia)
    return ORDEN_DEL_DIA[hechas] if hechas < len(ORDEN_DEL_DIA) else None


# ------------------------------------------------------------------ zona
def evaluar_zona(lat: float, lon: float, sede: dict, bloques_activos: list[dict]) -> Zona:
    """Valida la ubicación contra los bloques activos de la sede o, si no hay, contra la sede."""
    if not bloques_activos:
        d = distancia_m(lat, lon, sede["latitud"], sede["longitud"])
        limite = sede["radio_metros"]
        if d <= limite:
            return Zona(True, None, f"A {d:.0f} m del centro de la sede (radio {limite} m)")
        return Zona(False, None, f"A {d:.0f} m del centro de la sede; el radio permitido es {limite} m")

    medidos = [(distancia_m(lat, lon, b["latitud"], b["longitud"]), b) for b in bloques_activos]
    dentro = [(d, b) for d, b in medidos if d <= b["radio_metros"]]
    if dentro:
        d, b = min(dentro, key=lambda x: x[0])  # si los círculos se traslapan, el de centro más cercano
        return Zona(True, b["id"], f"A {d:.0f} m del centro de «{b['nombre']}» (radio {b['radio_metros']} m)")
    d, b = min(medidos, key=lambda x: x[0] - x[1]["radio_metros"])  # el que queda más cerca de su borde
    return Zona(
        False, None,
        f"A {d:.0f} m del centro del bloque más cercano («{b['nombre']}»); su radio es {b['radio_metros']} m",
    )


# ------------------------------------------------------------------ anomalías al marcar
def texto_dias(dias: list[int]) -> str:
    """[1,2,3,4,5] -> «lunes a viernes»; [1,3,5] -> «lunes, miércoles, viernes»."""
    ordenados = sorted(set(dias))
    if len(ordenados) > 2 and ordenados[-1] - ordenados[0] == len(ordenados) - 1:
        return f"{NOMBRES_DIA[ordenados[0]]} a {NOMBRES_DIA[ordenados[-1]]}"
    return ", ".join(NOMBRES_DIA[d] for d in ordenados)


def evaluar_dia_laborable(momento: datetime, dias_laborables: list[int], feriado: dict | None) -> Hallazgo | None:
    """dia_no_laborable: marcó en un feriado o en un día de la semana que no trabaja."""
    if feriado:
        return Hallazgo("dia_no_laborable", f"Marcó en un día feriado: «{feriado['nombre']}»")
    dia = a_local(momento).isoweekday()  # 1 = lunes … 7 = domingo
    if dia not in dias_laborables:
        return Hallazgo(
            "dia_no_laborable",
            f"Marcó un {NOMBRES_DIA[dia]}; sus días laborables son {texto_dias(dias_laborables)}",
        )
    return None


def evaluar_horario(
    tipo: str, momento: datetime, jornada_inicio: time, jornada_fin: time, tolerancia_min: int
) -> Hallazgo | None:
    """fuera_horario: ingreso tarde (después de inicio + tolerancia) o salida temprana."""
    hora = a_local(momento).time()
    if tipo == "ingreso" and _minutos(hora) > _minutos(jornada_inicio) + tolerancia_min:
        limite = (datetime.combine(momento.date(), jornada_inicio) + timedelta(minutes=tolerancia_min)).time()
        return Hallazgo("fuera_horario", f"Ingreso a las {_hhmm(hora)}; el límite era {_hhmm(limite)}")
    if tipo == "salida" and _minutos(hora) < _minutos(jornada_fin) - tolerancia_min:
        limite = (datetime.combine(momento.date(), jornada_fin) - timedelta(minutes=tolerancia_min)).time()
        return Hallazgo("fuera_horario", f"Salida a las {_hhmm(hora)}; el límite era {_hhmm(limite)}")
    return None


def evaluar_almuerzo(
    salida_almuerzo: datetime | None, regreso: datetime, almuerzo_max_min: int, tolerancia_min: int
) -> Hallazgo | None:
    """almuerzo_excedido: el regreso supera el máximo más la tolerancia de puntualidad."""
    if salida_almuerzo is None:
        return None
    duracion = (regreso - salida_almuerzo).total_seconds() / 60
    limite = almuerzo_max_min + tolerancia_min
    if duracion > limite:
        return Hallazgo(
            "almuerzo_excedido",
            f"Almuerzo de {duracion:.0f} min; el máximo es {almuerzo_max_min} min más {tolerancia_min} de tolerancia",
        )
    return None


def evaluar_desplazamiento(
    anterior: dict | None, lat: float, lon: float, momento: datetime, velocidad_max_kmh: float
) -> Hallazgo | None:
    """desplazamiento_inusual: la velocidad entre dos marcaciones consecutivas supera el límite."""
    if anterior is None:
        return None
    segundos = (momento - datetime.fromisoformat(anterior["fecha_hora"])).total_seconds()
    if segundos <= 0:
        return None
    metros = distancia_m(anterior["latitud"], anterior["longitud"], lat, lon)
    kmh = (metros / 1000) / (segundos / 3600)
    if kmh > velocidad_max_kmh:
        return Hallazgo(
            "desplazamiento_inusual",
            f"{metros / 1000:.1f} km en {segundos / 60:.0f} min ({kmh:.0f} km/h); el límite es {velocidad_max_kmh:.0f} km/h",
        )
    return None


def evaluar_uso_web(marcaciones_web_previas_30d: int, maximo: int) -> Hallazgo | None:
    """uso_recurrente_web: con esta marcación se superan las permitidas en 30 días."""
    total = marcaciones_web_previas_30d + 1
    if total > maximo:
        return Hallazgo("uso_recurrente_web", f"{total} marcaciones por web en 30 días; el máximo es {maximo}")
    return None
