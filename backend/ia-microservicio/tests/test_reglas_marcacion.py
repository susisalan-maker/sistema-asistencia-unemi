"""Reglas de marcación: funciones puras, sin red ni base de datos."""
from datetime import datetime, time, timedelta, timezone

import pytest

from app import reglas_marcacion as r

UTC = timezone.utc
LOCAL = r.ZONA_LOCAL

# Un punto y otro a ~111 m al norte (0.001° de latitud ≈ 111 m).
LAT, LON = -2.1500, -79.6000
SEDE = {"id": "s1", "nombre": "Matriz", "latitud": LAT, "longitud": LON, "radio_metros": 400}


def bloque(id, nombre, dlat=0.0, radio=60):
    return {"id": id, "nombre": nombre, "latitud": LAT + dlat, "longitud": LON, "radio_metros": radio}


def a(hora, minuto=0, dia=15):
    """Momento a la hora LOCAL (UTC-5) indicada."""
    return datetime(2026, 10, dia, hora, minuto, tzinfo=LOCAL)


# ------------------------------------------------------------ utilidades
def test_distancia_conocida():
    assert r.distancia_m(LAT, LON, LAT, LON) == 0
    assert r.distancia_m(LAT, LON, LAT + 0.001, LON) == pytest.approx(111.2, abs=0.5)
    assert r.distancia_m(LAT, LON, LAT, LON + 0.001) == pytest.approx(111.2 * 0.99944, abs=0.5)  # cos(2.15°)


def test_el_dia_es_el_local_no_el_utc():
    # 21:30 hora de Ecuador es 02:30 UTC del día siguiente: sigue siendo el mismo día local.
    inicio, fin = r.limites_del_dia(datetime(2026, 10, 16, 2, 30, tzinfo=UTC))
    assert inicio == a(0, dia=15) and fin == a(0, dia=16)
    # 00:10 local del 16 es 05:10 UTC del 16.
    inicio, _ = r.limites_del_dia(datetime(2026, 10, 16, 5, 10, tzinfo=UTC))
    assert inicio == a(0, dia=16)


def test_parsear_hora_acepta_texto_y_objeto():
    assert r.parsear_hora("08:00:00") == time(8, 0)
    assert r.parsear_hora(time(17, 30)) == time(17, 30)


# ------------------------------------------------------------ secuencia
def test_secuencia_de_las_cuatro_marcaciones():
    assert r.siguiente_tipo([]) == "ingreso"
    assert r.siguiente_tipo([{}]) == "salida_almuerzo"
    assert r.siguiente_tipo([{}, {}]) == "entrada_almuerzo"
    assert r.siguiente_tipo([{}, {}, {}]) == "salida"
    assert r.siguiente_tipo([{}, {}, {}, {}]) is None


# ------------------------------------------------------------ zona
def test_sin_bloques_se_valida_contra_la_sede():
    assert r.evaluar_zona(LAT, LON, SEDE, []).dentro
    assert r.evaluar_zona(LAT + 0.003, LON, SEDE, []).dentro          # ~333 m < 400 m
    fuera = r.evaluar_zona(LAT + 0.005, LON, SEDE, [])                 # ~556 m > 400 m
    assert not fuera.dentro and fuera.bloque_id is None
    assert "400" in fuera.descripcion


def test_con_bloques_solo_valen_los_bloques():
    bloques = [bloque("b1", "Bloque M", dlat=0.0)]
    # Dentro de la sede (333 m) pero fuera del bloque (radio 60 m): no vale.
    assert not r.evaluar_zona(LAT + 0.003, LON, SEDE, bloques).dentro
    z = r.evaluar_zona(LAT, LON, SEDE, bloques)
    assert z.dentro and z.bloque_id == "b1"


def test_bloques_traslapados_elige_el_de_centro_mas_cercano():
    bloques = [bloque("lejos", "A", dlat=0.0006, radio=100), bloque("cerca", "B", dlat=-0.0002, radio=100)]
    # El punto (en LAT) está a ~67 m de «lejos» y ~22 m de «cerca»: ambos lo contienen.
    assert r.evaluar_zona(LAT, LON, SEDE, bloques).bloque_id == "cerca"


def test_el_borde_del_radio_cuenta_como_dentro():
    punto = LAT + 60 / 111_195  # ≈ 60 m al norte
    assert r.evaluar_zona(punto - 1e-7, LON, SEDE, [bloque("b1", "M", radio=60)]).dentro


def test_justo_en_el_radio_exacto_cuenta_como_dentro(monkeypatch):
    # Con la distancia exactamente igual al radio (se fuerza, porque con coordenadas reales casi nunca coincide).
    monkeypatch.setattr(r, "distancia_m", lambda *a: 400.0)
    assert r.evaluar_zona(LAT, LON, SEDE, []).dentro
    monkeypatch.setattr(r, "distancia_m", lambda *a: 60.0)
    assert r.evaluar_zona(LAT, LON, SEDE, [bloque("b1", "M", radio=60)]).dentro
    monkeypatch.setattr(r, "distancia_m", lambda *a: 400.01)
    assert not r.evaluar_zona(LAT, LON, SEDE, []).dentro


def test_fuera_describe_el_bloque_mas_cercano_a_su_borde():
    bloques = [bloque("grande", "Grande", dlat=0.002, radio=200), bloque("chico", "Chico", dlat=0.0015, radio=20)]
    # Desde LAT: Grande está a ~222 m (borde a 22 m); Chico a ~167 m (borde a 147 m).
    z = r.evaluar_zona(LAT, LON, SEDE, bloques)
    assert not z.dentro and "Grande" in z.descripcion


# ------------------------------------------------------------ horario
@pytest.mark.parametrize(
    "tipo, momento, esperado",
    [
        ("ingreso", a(8, 0), False),
        ("ingreso", a(8, 10), False),   # justo en el límite (08:00 + 10)
        ("ingreso", a(8, 11), True),
        ("ingreso", a(7, 30), False),   # llegar temprano no es anomalía
        ("salida", a(17, 0), False),
        ("salida", a(16, 50), False),   # justo en el límite (17:00 - 10)
        ("salida", a(16, 49), True),
        ("salida", a(18, 30), False),   # salir tarde no es anomalía
        ("salida_almuerzo", a(23, 0), False),  # solo ingreso y salida se miden contra la jornada
        ("entrada_almuerzo", a(3, 0), False),
    ],
)
def test_horario(tipo, momento, esperado):
    h = r.evaluar_horario(tipo, momento, time(8, 0), time(17, 0), 10)
    assert (h is not None) is esperado
    if h:
        assert h.tipo == "fuera_horario"


def test_horario_describe_lo_medido():
    assert "08:25" in r.evaluar_horario("ingreso", a(8, 25), time(8, 0), time(17, 0), 10).descripcion
    assert "08:10" in r.evaluar_horario("ingreso", a(8, 25), time(8, 0), time(17, 0), 10).descripcion


def test_horario_usa_la_hora_local_no_la_utc():
    # 13:30 UTC = 08:30 en Ecuador: tarde. Si se leyera en UTC (13:30) también lo sería, así que
    # se prueba el caso inverso: 12:55 UTC = 07:55 local → a tiempo (en UTC parecería tarde).
    assert r.evaluar_horario("ingreso", datetime(2026, 10, 15, 12, 55, tzinfo=UTC), time(8, 0), time(17, 0), 10) is None
    assert r.evaluar_horario("ingreso", datetime(2026, 10, 15, 13, 30, tzinfo=UTC), time(8, 0), time(17, 0), 10)


# ------------------------------------------------------------ almuerzo
@pytest.mark.parametrize("minutos, excede", [(30, False), (60, False), (70, False), (71, True), (120, True)])
def test_almuerzo_maximo_mas_tolerancia(minutos, excede):
    salida = a(12, 0)
    h = r.evaluar_almuerzo(salida, salida + timedelta(minutes=minutos), 60, 10)
    assert (h is not None) is excede
    if h:
        assert h.tipo == "almuerzo_excedido"


def test_almuerzo_sin_salida_registrada_no_evalua():
    assert r.evaluar_almuerzo(None, a(13, 0), 60, 10) is None


# ------------------------------------------------------------ desplazamiento
def previa(dlat, hora, minuto=0):
    return {"latitud": LAT + dlat, "longitud": LON, "fecha_hora": a(hora, minuto).isoformat()}


def test_desplazamiento_normal_y_excesivo():
    # ~111 m en 30 min: lentísimo.
    assert r.evaluar_desplazamiento(previa(0.001, 8), LAT, LON, a(8, 30), 120) is None
    # ~111 km (1° de latitud) en 30 min = 222 km/h > 120.
    h = r.evaluar_desplazamiento(previa(1.0, 8), LAT, LON, a(8, 30), 120)
    assert h and h.tipo == "desplazamiento_inusual" and "120" in h.descripcion
    # ~111 km en 2 h = 55 km/h: normal.
    assert r.evaluar_desplazamiento(previa(1.0, 8), LAT, LON, a(10, 0), 120) is None


def test_desplazamiento_sin_marcacion_previa_o_sin_tiempo_transcurrido():
    assert r.evaluar_desplazamiento(None, LAT, LON, a(8), 120) is None
    assert r.evaluar_desplazamiento(previa(1.0, 8), LAT, LON, a(8), 120) is None  # mismo instante: no se divide por 0


# ------------------------------------------------------------ uso web
@pytest.mark.parametrize("previas, anomalia", [(0, False), (2, False), (3, True), (10, True)])
def test_uso_recurrente_web_supera_el_maximo(previas, anomalia):
    # Con max = 3: la 4.ª marcación web (3 previas + esta) ya es «recurrente».
    h = r.evaluar_uso_web(previas, 3)
    assert (h is not None) is anomalia
    if h:
        assert h.tipo == "uso_recurrente_web"


# ------------------------------------------------------------ día laborable
LUN_A_VIE = [1, 2, 3, 4, 5]


@pytest.mark.parametrize(
    "dias, texto",
    [
        ([1, 2, 3, 4, 5], "lunes a viernes"),
        ([1, 2, 3, 4, 5, 6, 7], "lunes a domingo"),
        ([1, 3, 5], "lunes, miércoles, viernes"),
        ([6, 7], "sábado, domingo"),
        ([5, 1, 3, 2, 4], "lunes a viernes"),   # llegan en cualquier orden
        ([2], "martes"),
    ],
)
def test_texto_dias(dias, texto):
    assert r.texto_dias(dias) == texto


@pytest.mark.parametrize("dia, laborable", [(12, True), (13, True), (16, True), (17, False), (18, False), (19, True)])
def test_dias_de_la_semana(dia, laborable):
    # Octubre 2026: el 12 es lunes, el 16 viernes, el 17 sábado, el 18 domingo.
    h = r.evaluar_dia_laborable(a(9, dia=dia), LUN_A_VIE, None)
    assert (h is None) is laborable
    if h:
        assert h.tipo == "dia_no_laborable"


def test_un_feriado_gana_sobre_un_dia_laborable():
    h = r.evaluar_dia_laborable(a(9, dia=15), LUN_A_VIE, {"nombre": "Día X"})
    assert h and "Día X" in h.descripcion


def test_el_dia_de_la_semana_se_lee_en_hora_local():
    # Sábado 22:00 local = domingo 03:00 UTC: debe decir «sábado».
    h = r.evaluar_dia_laborable(datetime(2026, 10, 18, 3, 0, tzinfo=UTC), LUN_A_VIE, None)
    assert h and "sábado" in h.descripcion
    # Viernes 23:30 local = sábado 04:30 UTC: sigue siendo viernes, laborable.
    assert r.evaluar_dia_laborable(datetime(2026, 10, 17, 4, 30, tzinfo=UTC), LUN_A_VIE, None) is None
