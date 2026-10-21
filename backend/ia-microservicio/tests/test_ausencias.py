"""Proceso de ausencias: sin_ingreso, sin_salida y sin_regreso_almuerzo (POST /procesos/ausencias)."""
from datetime import datetime, timezone

import pytest

from app import reglas_ausencia as reglas
from app.config import Settings, get_settings
from app.routers.procesos import get_ahora
from tests.conftest import SEDE_ID

UID = "aaaaaaaa-0000-0000-0000-000000000001"
SECRETO = "secreto-de-prueba"
H = {"X-Proceso-Secreto": SECRETO}


def local(dia: str, hora: str) -> str:
    """'2026-10-15', '08:02' -> hora de Ecuador (UTC-5) como texto ISO."""
    return f"{dia}T{hora}:00-05:00"


def ahora_local(dia: str, hora: str) -> datetime:
    return datetime.fromisoformat(local(dia, hora)).astimezone(timezone.utc)


@pytest.fixture(autouse=True)
def persona(fake):
    fake.filas[UID] = {
        "id": UID, "rol": "usuario", "activo": True, "sede_id": SEDE_ID, "nombres": "Ana", "apellidos": "Pérez",
        "jornada_inicio": "08:00:00", "jornada_fin": "17:00:00", "dias_laborables": [1, 2, 3, 4, 5],
        "created_at": "2026-09-01T12:00:00+00:00",
    }


@pytest.fixture
def correr(client, fake):
    """Ejecuta el proceso «a esta hora local». Por defecto, jueves 15/10/2026 a las 20:00."""
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="x", supabase_service_role_key="k", procesos_secreto=SECRETO, verificacion_facial="simulada"
    )

    def _correr(dia="2026-10-15", hora="20:00", headers=H):
        client.app.dependency_overrides[get_ahora] = lambda: ahora_local(dia, hora)
        return client.post("/procesos/ausencias", headers=headers)

    return _correr


def marca(fake, tipo, dia, hora, usuario=UID):
    mid = f"m-{len(fake.marcaciones) + 1}"
    fake.marcaciones[mid] = {"id": mid, "usuario_id": usuario, "tipo": tipo, "fecha_hora": local(dia, hora)}
    return mid


def dia_completo(fake, dia, usuario=UID):
    for tipo, hora in (("ingreso", "08:00"), ("salida_almuerzo", "12:30"), ("entrada_almuerzo", "13:15"), ("salida", "17:05")):
        marca(fake, tipo, dia, hora, usuario)


def creadas(fake):
    return [(a["tipo"], a["fecha_jornada"]) for a in fake.anomalias]


# ------------------------------------------------------------------ seguridad
def test_sin_secreto_configurado_esta_apagado(client):
    client.app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="x", supabase_service_role_key="k")
    r = client.post("/procesos/ausencias", headers=H)
    assert r.status_code == 503 and "PROCESOS_SECRETO" in r.text


def test_secreto_incorrecto_o_ausente(correr, fake):
    assert correr(headers={}).status_code == 401
    assert correr(headers={"X-Proceso-Secreto": "otro"}).status_code == 401
    assert fake.anomalias == []


def test_un_token_de_administrador_no_sirve(correr):
    assert correr(headers={"Authorization": "Bearer token-admin"}).status_code == 401


# ------------------------------------------------------------------ qué se genera
def test_sin_ninguna_marcacion_es_sin_ingreso_cada_dia_laborable(correr, fake):
    r = correr()
    assert r.status_code == 200
    assert creadas(fake) == [("sin_ingreso", d) for d in ("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15")]
    assert r.json()["creadas"] == {"sin_ingreso": 4, "sin_salida": 0, "sin_regreso_almuerzo": 0}
    a = fake.anomalias[-1]
    assert a["detector"] == "regla" and a["marcacion_id"] is None
    assert a["detalle"] == "No marcó nada el jueves 15/10/2026 (jornada 08:00–17:00)"


def test_jornada_completa_no_genera_nada(correr, fake):
    for d in ("2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"):
        dia_completo(fake, d)
    r = correr()
    assert fake.anomalias == [] and r.json()["jornadas_revisadas"] == 4


def test_solo_ingreso_es_sin_salida_y_apunta_a_la_ultima_marcacion(correr, fake):
    for d in ("2026-10-12", "2026-10-13", "2026-10-14"):
        dia_completo(fake, d)
    mid = marca(fake, "ingreso", "2026-10-15", "08:02")
    correr()
    assert creadas(fake) == [("sin_salida", "2026-10-15")]
    a = fake.anomalias[0]
    assert a["marcacion_id"] == mid
    assert a["detalle"] == "No marcó la salida el jueves 15/10/2026; su última marcación fue «ingreso» a las 08:02"


def test_salio_a_almorzar_y_no_volvio_es_sin_regreso_y_no_tambien_sin_salida(correr, fake):
    for d in ("2026-10-12", "2026-10-13", "2026-10-14"):
        dia_completo(fake, d)
    marca(fake, "ingreso", "2026-10-15", "08:00")
    mid = marca(fake, "salida_almuerzo", "2026-10-15", "12:05")
    correr()
    assert creadas(fake) == [("sin_regreso_almuerzo", "2026-10-15")]
    assert fake.anomalias[0]["marcacion_id"] == mid
    assert "Salió a almorzar a las 12:05" in fake.anomalias[0]["detalle"]


def test_volvio_del_almuerzo_y_no_marco_salida_es_sin_salida(correr, fake):
    for d in ("2026-10-12", "2026-10-13", "2026-10-14"):
        dia_completo(fake, d)
    marca(fake, "ingreso", "2026-10-15", "08:00")
    marca(fake, "salida_almuerzo", "2026-10-15", "12:00")
    marca(fake, "entrada_almuerzo", "2026-10-15", "13:00")
    correr()
    assert creadas(fake) == [("sin_salida", "2026-10-15")]


def test_una_marcacion_de_la_noche_cuenta_para_su_dia_local(correr, fake):
    """23:30 de Ecuador ya es el día siguiente en UTC; debe contar para el día de Ecuador."""
    for d in ("2026-10-12", "2026-10-13", "2026-10-14"):
        dia_completo(fake, d)
    marca(fake, "ingreso", "2026-10-15", "08:00")
    marca(fake, "salida_almuerzo", "2026-10-15", "12:00")
    marca(fake, "entrada_almuerzo", "2026-10-15", "13:00")
    marca(fake, "salida", "2026-10-15", "23:30")
    correr(hora="23:50")
    assert fake.anomalias == []


def test_marcaciones_de_otra_persona_o_de_otro_dia_no_cuentan(correr, fake):
    otra = "aaaaaaaa-0000-0000-0000-000000000002"
    dia_completo(fake, "2026-10-15", usuario=otra)
    dia_completo(fake, "2026-10-14")
    correr()
    assert ("sin_ingreso", "2026-10-15") in creadas(fake) and ("sin_ingreso", "2026-10-14") not in creadas(fake)


# ------------------------------------------------------------------ cuándo se revisa
def test_no_se_revisa_el_dia_hasta_pasada_la_gracia(correr, fake):
    correr(hora="18:59")                       # 17:00 + 120 min = 19:00
    assert ("sin_ingreso", "2026-10-15") not in creadas(fake)
    correr(hora="19:00")
    assert ("sin_ingreso", "2026-10-15") in creadas(fake)


def test_la_gracia_es_configurable(client, fake, correr):
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="x", supabase_service_role_key="k", procesos_secreto=SECRETO, ausencias_gracia_min=0,
        ausencias_dias_atras=0)
    client.app.dependency_overrides[get_ahora] = lambda: ahora_local("2026-10-15", "17:00")
    client.post("/procesos/ausencias", headers=H)
    assert creadas(fake) == [("sin_ingreso", "2026-10-15")]


def test_fin_de_semana_y_dias_que_no_trabaja_no_generan_nada(correr, fake):
    correr(dia="2026-10-19", hora="20:00")      # lunes: revisa vie 16, sáb 17, dom 18 y lun 19
    assert [d for _, d in creadas(fake)] == ["2026-10-16", "2026-10-19"]


def test_dias_laborables_personalizados(correr, fake):
    fake.filas[UID]["dias_laborables"] = [1, 3, 5]           # lun, mié, vie
    correr()                                                  # jueves: revisa lun 12, mar 13, mié 14, jue 15
    assert [d for _, d in creadas(fake)] == ["2026-10-12", "2026-10-14"]


def test_feriado_no_genera_ausencia(correr, fake):
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-13", "fecha_fin": "2026-10-14", "nombre": "Feriado", "activo": True}
    correr()
    assert [d for _, d in creadas(fake)] == ["2026-10-12", "2026-10-15"]


def test_feriado_desactivado_si_cuenta(correr, fake):
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-13", "fecha_fin": "2026-10-13", "nombre": "X", "activo": False}
    correr()
    assert "2026-10-13" in [d for _, d in creadas(fake)]


def test_el_dia_en_que_se_creo_la_cuenta_y_los_anteriores_no_cuentan(correr, fake):
    fake.filas[UID]["created_at"] = "2026-10-14T15:00:00+00:00"      # creada el miércoles 14 a las 10:00 local
    correr()
    assert [d for _, d in creadas(fake)] == ["2026-10-15"]


def test_solo_revisa_los_dias_configurados_hacia_atras(client, fake, correr):
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="x", supabase_service_role_key="k", procesos_secreto=SECRETO, ausencias_dias_atras=1)
    client.app.dependency_overrides[get_ahora] = lambda: ahora_local("2026-10-15", "20:00")
    client.post("/procesos/ausencias", headers=H)
    assert [d for _, d in creadas(fake)] == ["2026-10-14", "2026-10-15"]


def test_quien_no_marca_no_se_revisa(correr, fake):
    fake.filas[UID]["activo"] = False
    fake.filas["sin-sede"] = {**fake.filas[UID], "id": "sin-sede", "activo": True, "sede_id": None}
    fake.filas["admin-2"] = {**fake.filas[UID], "id": "admin-2", "rol": "administrador"}
    r = correr()
    assert fake.anomalias == [] and r.json()["personas"] == 0


# ------------------------------------------------------------------ idempotencia
def test_repetir_el_proceso_no_duplica(correr, fake):
    correr()
    n = len(fake.anomalias)
    r = correr()
    assert len(fake.anomalias) == n
    assert r.json()["creadas"] == {"sin_ingreso": 0, "sin_salida": 0, "sin_regreso_almuerzo": 0}
    assert r.json()["ya_registradas"] == 4


def test_una_jornada_con_ausencia_ya_registrada_no_cambia_de_tipo(correr, fake):
    marca(fake, "ingreso", "2026-10-15", "08:00")
    correr()
    marca(fake, "salida_almuerzo", "2026-10-15", "20:30")     # marca tarde: la anomalía sigue siendo la del cierre
    correr()
    assert creadas(fake).count(("sin_salida", "2026-10-15")) == 1
    assert not any(t == "sin_regreso_almuerzo" for t, _ in creadas(fake))


def test_dos_procesos_a_la_vez_no_fallan_si_la_base_rechaza_el_duplicado(correr, fake, monkeypatch):
    correr()
    n = len(fake.anomalias)

    async def nada(desde, hasta):          # el segundo proceso aún no ve lo que creó el primero
        return []
    monkeypatch.setattr(fake, "ausencias_registradas", nada)
    r = correr()
    assert r.status_code == 200 and len(fake.anomalias) == n and r.json()["ya_registradas"] == 4


def test_pasa_a_sin_justificar_las_vencidas(correr, fake):
    fake.vencidas = 3
    r = correr()
    assert r.json()["pasaron_a_sin_justificar"] == 3 and ("marcar_sin_justificar",) in fake.llamadas


def test_el_plazo_para_justificar_lo_pone_la_base(correr, fake):
    correr()
    assert all("fecha_vencimiento" not in a for a in fake.anomalias)      # lo calcula el trigger de la base


# ------------------------------------------------------------------ reglas puras
def test_evaluar_jornada_directo():
    u = {"jornada_inicio": "07:30:00", "jornada_fin": "16:00:00"}
    from datetime import date

    h, mid = reglas.evaluar_jornada(date(2026, 10, 12), [], u)
    assert h.tipo == "sin_ingreso" and mid is None and "lunes 12/10/2026" in h.descripcion and "07:30–16:00" in h.descripcion
