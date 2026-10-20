"""POST /dispositivo/vincular y GET /marcaciones/hoy."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.routers import marcaciones as router_marcaciones
from tests.conftest import SEDE_ID

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
        "fecha": "2026-10-15", "marcaciones": [], "siguiente": "ingreso", "dispositivo": "sin_vincular",
        "rostro_registrado": False, "rostro_requerido": False,
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
