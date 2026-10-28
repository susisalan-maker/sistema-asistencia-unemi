"""Una marcación sin conexión llega firmada con la clave del celular: se comprueba antes de aceptarla.

La firma cubre el id, el tipo, la hora, el lugar, el dispositivo y la selfie. Quien abre la base del celular (root, modo
desarrollador) y cambia cualquiera de esos datos antes de que se envíe, invalida la firma, y el servidor rechaza la marcación.
"""
import base64
from datetime import datetime
from uuid import uuid4

import pytest

from app.config import Settings, get_settings
from app.verificacion import ResultadoVerificacion
from tests.ayudas_firma import Celular
from tests.test_firma_registro import con_ajustes
from tests.test_marcacion_sin_conexion import guardada, hora, llega, sin_conexion  # noqa: F401
from tests.test_marcaciones import H, MARCA_ID, con_verificador, enviar, usuario_marcador  # noqa: F401
from tests.test_reloj_firmado import prueba

DISPOSITIVO = "cel-1"   # el que usa `sin_conexion()` de las pruebas


@pytest.fixture(autouse=True)
def verificacion_buena(client):
    return con_verificador(client, ResultadoVerificacion("verificada", 0.9))


@pytest.fixture
def celular(fake):
    """La cuenta de pruebas con el celular vinculado y su clave registrada."""
    c = Celular()
    fake.filas[MARCA_ID].update({"dispositivo_id": DISPOSITIVO, "clave_publica": c.publica_b64})
    return c


def firmada(celular, **cambios):
    """Una marcación sin conexión firmada como lo haría la app; `cambios` se aplican ANTES de firmar."""
    datos = sin_conexion(**cambios)
    datos["firma"] = celular.firmar_marcacion(datos, MARCA_ID)
    return datos


def alterar(datos, **cambios):
    """Lo que haría quien modifica la base del celular: cambia datos DESPUÉS de firmar (la firma se queda igual)."""
    return {**datos, **cambios}


# ---------------------------------------------------------------- camino feliz
def test_una_marcacion_bien_firmada_se_acepta_y_queda_como_firmada(client, fake, celular):
    datos = firmada(celular)
    r = llega(client, datos, a="09:00")
    assert r.status_code == 201, r.text
    m = guardada(fake)
    assert m["firmada"] is True and m["firma"] == datos["firma"] and m["sin_conexion"] is True


def test_firma_y_prueba_del_reloj_juntas(client, fake, celular):
    datos = firmada(celular, marco="08:00", reloj=prueba("07:50", 10))
    assert llega(client, datos, a="09:00").status_code == 201


def test_la_hora_con_otra_zona_horaria_firma_igual(client, fake, celular):
    datos = sin_conexion(marco="08:00")
    datos["fecha_hora"] = datetime.fromisoformat(datos["fecha_hora"]).astimezone().isoformat()   # misma hora, otro formato
    datos["firma"] = celular.firmar_marcacion(datos, MARCA_ID)
    assert llega(client, datos, a="09:00").status_code == 201


def test_ya_enviada_no_se_vuelve_a_comprobar_el_reintento(client, fake, celular):
    datos = firmada(celular)
    assert llega(client, datos, a="09:00").status_code == 201
    r = llega(client, datos, a="09:05")
    assert r.status_code == 200 and r.json()["reintento"] is True


# ---------------------------------------------------------------- lo alterado se rechaza
@pytest.mark.parametrize("cambio", [
    {"fecha_hora": hora("07:00").isoformat()},                  # adelantar la entrada: «llegué antes»
    {"fecha_hora": hora("08:01").isoformat()},                  # un minuto basta
    {"latitud": -2.1401},                                        # moverse un poco
    {"longitud": -79.5999},
    {"latitud": -1.0, "longitud": -78.0},                       # otro lugar
    {"dispositivo_id": "otro-cel"},                             # (también lo frena la comprobación del vínculo)
    {"selfie_b64": "BBBB"},                                      # cambiar la foto por la de otra persona
    {"id": str(uuid4())},                                        # reusar la firma en otra marcación
], ids=["hora_7", "hora_801", "lat", "lon", "otro_lugar", "dispositivo", "selfie", "id"])
def test_cualquier_cambio_a_lo_firmado_se_rechaza(client, fake, celular, cambio):
    datos = firmada(celular)
    r = llega(client, alterar(datos, **cambio), a="09:00")
    assert r.status_code in (403, 422), r.text
    assert fake.marcaciones == {}
    if r.status_code == 422:
        assert r.json()["codigo"] == "firma_invalida"


def test_cambiar_el_tipo_se_rechaza(client, fake, celular):
    datos = firmada(celular, tipo="ingreso")
    r = llega(client, alterar(datos, tipo="salida_almuerzo"), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "firma_invalida"
    assert fake.marcaciones == {}


def test_el_rechazo_dice_que_se_explique_desde_avisos(client, fake, celular):
    r = llega(client, alterar(firmada(celular), latitud=-1.0), a="09:00")
    assert "Avisos" in r.json()["detail"] and "alter" in r.json()["detail"]


# ---------------------------------------------------------------- quitar o falsificar la firma
def test_con_clave_registrada_quitar_la_firma_no_sirve(client, fake, celular):
    """Quien modifica los datos no puede firmar; lo único que le queda es no mandar firma: por eso es obligatoria."""
    datos = sin_conexion()
    r = llega(client, datos, a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "firma_invalida"
    assert fake.marcaciones == {}


def test_la_firma_de_otro_celular_se_rechaza(client, fake, celular):
    datos = sin_conexion()
    datos["firma"] = Celular().firmar_marcacion(datos, MARCA_ID)
    r = llega(client, datos, a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "firma_invalida"


def test_la_firma_hecha_para_otra_persona_no_sirve(client, fake, celular):
    datos = sin_conexion()
    datos["firma"] = celular.firmar_marcacion(datos, "otra-persona")
    assert llega(client, datos, a="09:00").json()["codigo"] == "firma_invalida"


def test_una_firma_basura_se_rechaza(client, fake, celular):
    datos = sin_conexion(firma="A" * 96)
    r = llega(client, datos, a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "firma_invalida"


def test_la_marcacion_rechazada_por_firma_no_deja_rastro_ni_anomalias(client, fake, celular):
    llega(client, alterar(firmada(celular), latitud=-1.0), a="09:00")
    assert fake.marcaciones == {} and fake.anomalias == []


# ---------------------------------------------------------------- cuentas sin clave
def test_sin_clave_registrada_se_acepta_sin_firma_como_antes(client, fake):
    r = llega(client, sin_conexion(), a="09:00")
    assert r.status_code == 201
    assert guardada(fake)["firmada"] is False and guardada(fake)["firma"] is None


def test_sin_clave_registrada_una_firma_no_se_puede_comprobar_y_no_cuenta(client, fake):
    c = Celular()
    datos = sin_conexion()
    datos["firma"] = c.firmar_marcacion(datos, MARCA_ID)
    r = llega(client, datos, a="09:00")
    assert r.status_code == 201
    assert guardada(fake)["firmada"] is False and guardada(fake)["firma"] is None


def test_si_se_exige_la_firma_a_todos_la_cuenta_sin_clave_tampoco_puede_enviar_sin_firma(client, fake):
    con_ajustes(client, firma_obligatoria=True)
    r = llega(client, sin_conexion(), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "firma_invalida"
    assert fake.marcaciones == {}


# ---------------------------------------------------------------- en línea no hace falta
def test_marcar_en_linea_no_pide_firma_aunque_haya_clave(client, fake, celular):
    r = enviar(client, {"id": str(uuid4()), "tipo": "ingreso", "latitud": -2.14, "longitud": -79.6,
                        "origen": "app", "dispositivo_id": DISPOSITIVO}, reloj=hora("08:00"))
    assert r.status_code == 201, r.text
    assert guardada(fake)["firmada"] is False


def test_la_firma_solo_va_en_una_marcacion_sin_conexion(client, fake, celular):
    datos = firmada(celular)
    datos["sin_conexion"] = False
    assert llega(client, datos, a="08:00").status_code == 422


def test_el_formato_de_la_firma_se_valida(client, fake, celular):
    assert llega(client, sin_conexion(firma="corta"), a="09:00").status_code == 422
