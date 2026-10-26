"""POST /dispositivo/vincular y GET /marcaciones/hoy."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.routers import marcaciones as router_marcaciones
from app.supabase_client import SupabaseError
from tests.conftest import BLOQUE_ID, SEDE_ID

UID = "55555555-5555-5555-5555-555555555555"
OTRO = "66666666-6666-6666-6666-666666666666"
H = {"Authorization": "Bearer token-dev"}


@pytest.fixture(autouse=True)
def usuarios_de_prueba(fake):
    fake.tokens["token-dev"] = UID
    fake.filas[UID] = {
        "id": UID, "rol": "usuario", "activo": True, "email": "d@x.com", "sede_id": SEDE_ID, "dispositivo_id": None,
    }
    fake.tokens["token-otro"] = OTRO
    fake.filas[OTRO] = {
        "id": OTRO, "rol": "usuario", "activo": True, "email": "o@x.com", "sede_id": SEDE_ID, "dispositivo_id": None,
    }


def vincular(client, dispositivo="cel-A", headers=H):
    return client.post("/dispositivo/vincular", json={"dispositivo_id": dispositivo}, headers=headers)


# ---------------------------------------------------------------- vincular
def test_exige_sesion_y_rol_usuario(client):
    assert client.post("/dispositivo/vincular", json={"dispositivo_id": "x"}).status_code == 401
    r = client.post("/dispositivo/vincular", json={"dispositivo_id": "x"}, headers={"Authorization": "Bearer token-admin"})
    assert r.status_code == 403


def test_vincula_el_primer_dispositivo(client, fake):
    r = vincular(client)
    assert r.status_code == 200
    assert r.json()["dispositivo"] == "este"
    assert fake.filas[UID]["dispositivo_id"] == "cel-A"


def test_repetir_con_el_mismo_dispositivo_no_falla(client, fake):
    vincular(client)
    fake.llamadas.clear()
    r = vincular(client)
    assert r.status_code == 200
    assert "ya estaba vinculado" in r.json()["mensaje"]
    assert fake.llamadas == []   # no vuelve a escribir


def test_no_cambia_de_celular_solo(client, fake):
    vincular(client, "cel-A")
    r = vincular(client, "cel-B")
    assert r.status_code == 409
    assert "otro celular" in r.json()["detail"]
    assert fake.filas[UID]["dispositivo_id"] == "cel-A"


def test_dos_celulares_a_la_vez_gana_el_primero(client, fake):
    """La fila que leyó el servidor decía «sin celular», pero otro se vinculó antes de escribir."""
    fake.filas[UID]["dispositivo_id"] = None
    original = fake.usuario_fila

    async def lee_vieja(uid):
        fila = dict(await original(uid))
        fila["dispositivo_id"] = None
        return fila

    fake.usuario_fila = lee_vieja
    fake.filas[UID]["dispositivo_id"] = "cel-A"          # ya lo ganó el otro celular
    r = vincular(client, "cel-B")
    assert r.status_code == 409
    assert fake.filas[UID]["dispositivo_id"] == "cel-A"


def test_un_celular_no_puede_estar_en_dos_cuentas(client, fake):
    fake.dispositivo_choca = True
    r = vincular(client)
    assert r.status_code == 409
    assert "otra cuenta" in r.json()["detail"]


def test_rechaza_identificador_vacio(client):
    assert vincular(client, "   ").status_code == 422
    assert client.post("/dispositivo/vincular", json={}, headers=H).status_code == 422


# ---------------------------------------------------------------- marcaciones de hoy
class RelojFijo(datetime):
    @classmethod
    def now(cls, tz=None):
        return cls(2026, 10, 15, 14, 0, tzinfo=timezone.utc)   # 09:00 en Ecuador


@pytest.fixture
def hoy_fijo(monkeypatch):
    monkeypatch.setattr(router_marcaciones, "datetime", RelojFijo)


def marca(fake, tipo, hora, dia="2026-10-15", usuario=UID):
    mid = str(uuid4())
    fake.marcaciones[mid] = {
        "id": mid, "usuario_id": usuario, "tipo": tipo, "fecha_hora": f"{dia}T{hora}:00-05:00",
        "sede_id": SEDE_ID, "bloque_id": None, "origen": "app", "verificacion": "verificada",
    }


def hoy(client, dispositivo=None, headers=H):
    extra = {"X-Dispositivo-Id": dispositivo} if dispositivo else {}
    return client.get("/marcaciones/hoy", headers={**headers, **extra})


def test_hoy_exige_sesion(client):
    assert client.get("/marcaciones/hoy").status_code == 401
    assert client.get("/marcaciones/hoy", headers={"Authorization": "Bearer token-admin"}).status_code == 403


def test_hoy_sin_marcaciones_toca_ingreso(client, hoy_fijo):
    r = hoy(client)
    assert r.status_code == 200
    assert r.json() == {
        "fecha": "2026-10-15", "marcaciones": [], "siguiente": "ingreso", "ultima": None, "jornada": None,
        "dia_laborable": True, "motivo_no_laborable": None, "dias_laborables": [1, 2, 3, 4, 5],
        "dispositivo": "sin_vincular", "rostro_registrado": False, "rostro_requerido": False,
    }


def test_hoy_informa_si_el_rostro_esta_registrado(client, fake, hoy_fijo):
    fake.filas[UID]["fecha_registro_rostro"] = "2026-10-10T10:00:00+00:00"
    assert hoy(client).json()["rostro_registrado"] is True


def test_hoy_indica_cual_toca_y_solo_cuenta_las_de_hoy(client, fake, hoy_fijo):
    marca(fake, "salida", "17:00", dia="2026-10-14")          # ayer: no cuenta
    marca(fake, "ingreso", "08:00")
    marca(fake, "salida_almuerzo", "08:30")
    marca(fake, "ingreso", "08:00", usuario=OTRO)             # de otra persona: no cuenta
    j = hoy(client).json()
    assert [m["tipo"] for m in j["marcaciones"]] == ["ingreso", "salida_almuerzo"]
    assert j["siguiente"] == "entrada_almuerzo"


def test_hoy_con_las_cuatro_ya_no_toca_nada(client, fake, hoy_fijo):
    for tipo, hora in [("ingreso", "07:00"), ("salida_almuerzo", "07:30"), ("entrada_almuerzo", "08:00"), ("salida", "08:30")]:
        marca(fake, tipo, hora)
    assert hoy(client).json()["siguiente"] is None


def test_hoy_usa_el_dia_local_no_el_utc(client, fake, monkeypatch):
    """A las 22:00 en Ecuador ya es el día siguiente en UTC; sigue contando el día local."""
    class Noche(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 10, 16, 3, 0, tzinfo=timezone.utc)   # 22:00 del 15 en Ecuador

    monkeypatch.setattr(router_marcaciones, "datetime", Noche)
    marca(fake, "ingreso", "08:00")                                # 15 de octubre, hora local
    j = hoy(client).json()
    assert j["fecha"] == "2026-10-15"
    assert j["siguiente"] == "salida_almuerzo"


def test_hoy_distingue_el_dispositivo(client, fake, hoy_fijo):
    assert hoy(client, "cel-A").json()["dispositivo"] == "sin_vincular"
    fake.filas[UID]["dispositivo_id"] = "cel-A"
    assert hoy(client, "cel-A").json()["dispositivo"] == "este"
    assert hoy(client, "cel-B").json()["dispositivo"] == "otro"
    assert hoy(client).json()["dispositivo"] == "otro"             # sin decir cuál es, no se asume


# ------------------------------------------------------------------ historial
def historial(client, dias=None, headers=H):
    return client.get("/marcaciones/historial" + (f"?dias={dias}" if dias is not None else ""), headers=headers)


def test_historial_exige_sesion_y_rol_usuario(client):
    assert client.get("/marcaciones/historial").status_code == 401
    assert historial(client, headers={"Authorization": "Bearer token-admin"}).status_code == 403


def test_historial_agrupa_por_dia_del_mas_reciente_al_mas_antiguo(client, fake, hoy_fijo):
    marca(fake, "ingreso", "08:11")
    marca(fake, "salida", "17:04", dia="2026-10-14")
    marca(fake, "ingreso", "07:56", dia="2026-10-14")
    marca(fake, "ingreso", "08:00", usuario=OTRO)                       # de otra persona: no aparece
    j = historial(client).json()
    assert [d["fecha"] for d in j["dias"]] == ["2026-10-15", "2026-10-14"]
    assert [m["tipo"] for m in j["dias"][1]["marcaciones"]] == ["ingreso", "salida"]      # dentro del día, en orden
    assert j["total"] == 3


def test_historial_respeta_los_dias_pedidos(client, fake, hoy_fijo):
    marca(fake, "ingreso", "08:00", dia="2026-10-13")
    marca(fake, "ingreso", "08:00", dia="2026-10-15")
    assert historial(client, dias=1).json()["total"] == 1
    assert historial(client, dias=3).json()["total"] == 2
    assert historial(client, dias=0).status_code == 422 and historial(client, dias=60).status_code == 422


def test_historial_incluye_el_lugar_y_la_anomalia(client, fake, hoy_fijo):
    marca(fake, "ingreso", "08:11")
    marca(fake, "salida", "17:04")
    ids = list(fake.marcaciones)
    fake.marcaciones[ids[1]]["bloque_id"] = BLOQUE_ID
    fake.anomalias.append({"id": "an-1", "numero": 1, "usuario_id": UID, "tipo": "fuera_horario", "estado": "justificada",
                           "marcacion_id": ids[1], "detalle": "x", "created_at": "2026-10-15T20:00:00+00:00",
                           "fecha_vencimiento": "2026-10-17T20:00:00+00:00"})
    m = historial(client).json()["dias"][0]["marcaciones"]
    assert m[0]["lugar"] == "Matriz Milagro" and m[0]["anomalia"] is None          # sin bloque: la sede
    assert m[1]["lugar"] == "Bloque M" and m[1]["anomalia"] == {"tipo": "fuera_horario", "estado": "justificada"}


def test_historial_vacio(client, hoy_fijo):
    assert historial(client).json() == {"dias": [], "total": 0}


def test_hoy_trae_la_ultima_marcacion_aunque_sea_de_otro_dia_y_la_jornada(client, fake, hoy_fijo):
    fake.filas[UID].update({"jornada_inicio": "08:00:00", "jornada_fin": "17:00:00"})
    marca(fake, "ingreso", "07:50", dia="2026-10-13")
    marca(fake, "salida", "17:04", dia="2026-10-14")
    marca(fake, "salida", "17:04", usuario=OTRO, dia="2026-10-14")
    j = hoy(client).json()
    assert j["marcaciones"] == [] and j["ultima"]["tipo"] == "salida" and j["ultima"]["fecha_hora"].startswith("2026-10-14T17:04")
    assert j["jornada"] == {"inicio": "08:00", "fin": "17:00"}
    marca(fake, "ingreso", "08:02")
    assert hoy(client).json()["ultima"]["tipo"] == "ingreso"          # ahora la última es la de hoy


# ------------------------------------------------------------------ día no laborable (la app deshabilita el botón)
def _hoy_en(monkeypatch, y, m, d, hora=14):
    class Reloj(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(y, m, d, hora, 0, tzinfo=timezone.utc)   # hora - 5 en Ecuador

    monkeypatch.setattr(router_marcaciones, "datetime", Reloj)


def test_hoy_en_dia_laborable_no_trae_motivo(client, hoy_fijo):
    j = hoy(client).json()                                       # jueves 15
    assert j["dia_laborable"] is True and j["motivo_no_laborable"] is None


def test_hoy_un_sabado_no_es_laborable_para_quien_trabaja_de_lunes_a_viernes(client, monkeypatch):
    _hoy_en(monkeypatch, 2026, 10, 17)                           # sábado
    j = hoy(client).json()
    assert j["dia_laborable"] is False
    assert j["motivo_no_laborable"] == "Hoy sábado no es un día laborable para ti. Tus días laborables son lunes a viernes."
    assert j["dias_laborables"] == [1, 2, 3, 4, 5]


def test_si_el_administrador_habilita_el_sabado_ya_es_laborable(client, fake, monkeypatch):
    _hoy_en(monkeypatch, 2026, 10, 17)
    fake.filas[UID]["dias_laborables"] = [1, 2, 3, 4, 5, 6]
    j = hoy(client).json()
    assert j["dia_laborable"] is True and j["motivo_no_laborable"] is None
    assert j["dias_laborables"] == [1, 2, 3, 4, 5, 6]


def test_hoy_un_feriado_no_es_laborable_aunque_sea_dia_de_trabajo(client, fake, hoy_fijo):
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-15", "fecha_fin": "2026-10-15", "nombre": "Día de prueba", "activo": True}
    j = hoy(client).json()
    assert j["dia_laborable"] is False
    assert j["motivo_no_laborable"] == "Hoy es feriado: Día de prueba."


def test_el_dia_no_laborable_se_mide_en_hora_local(client, monkeypatch):
    # 22:00 del viernes en Ecuador ya es sábado en UTC: sigue siendo viernes, laborable.
    _hoy_en(monkeypatch, 2026, 10, 17, hora=3)
    assert hoy(client).json()["dia_laborable"] is True


def test_si_fallan_los_feriados_no_se_bloquea_a_nadie(client, fake, hoy_fijo):
    async def roto(fecha):
        raise SupabaseError(500, "caído")

    fake.feriado_activo = roto
    j = hoy(client)
    assert j.status_code == 200 and j.json()["dia_laborable"] is True
