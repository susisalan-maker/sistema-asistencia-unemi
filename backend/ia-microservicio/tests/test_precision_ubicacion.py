"""Precisión mínima de la ubicación para marcar (migración 0013): `precision_max_app_m` / `precision_max_web_m`."""
import pytest

from app.routers.marcaciones import PRECISION_MAX_APP_DEFECTO, PRECISION_MAX_WEB_DEFECTO, _precision_max
from app.verificacion import ResultadoVerificacion
from tests.test_marcaciones import (  # noqa: F401  (usuario_marcador es un fixture autouse que se reutiliza)
    DENTRO, H, con_verificador, cuerpo, enviar, usuario_marcador,
)
from tests.test_marcacion_sin_conexion import llega, sin_conexion


@pytest.fixture(autouse=True)
def verificacion_buena(client):
    return con_verificador(client, ResultadoVerificacion("verificada", 0.9))


def test_los_valores_por_omision_son_50_m_en_la_app_y_200_m_en_la_web():
    assert (PRECISION_MAX_APP_DEFECTO, PRECISION_MAX_WEB_DEFECTO) == (50, 200)
    assert _precision_max({}, "app") == 50
    assert _precision_max({}, "web") == 200


def test_la_configuracion_manda_sobre_el_valor_por_omision():
    cfg = {"precision_max_app_m": 30, "precision_max_web_m": 500}
    assert _precision_max(cfg, "app") == 30
    assert _precision_max(cfg, "web") == 500


@pytest.mark.parametrize("valor", [None, 0, -5, "x"])
def test_un_valor_invalido_en_la_configuracion_usa_el_de_omision(valor):
    assert _precision_max({"precision_max_app_m": valor, "precision_max_web_m": valor}, "app") == 50
    assert _precision_max({"precision_max_app_m": valor, "precision_max_web_m": valor}, "web") == 200


def test_con_buena_precision_se_registra(client, fake):
    r = enviar(client, cuerpo(precision_m=12))
    assert r.status_code == 201


def test_justo_en_el_limite_se_acepta(client, fake):
    assert enviar(client, cuerpo(precision_m=50)).status_code == 201


def test_con_poca_precision_se_rechaza_con_codigo_y_no_se_guarda(client, fake):
    r = enviar(client, cuerpo(precision_m=80))
    assert r.status_code == 422
    assert r.json()["codigo"] == "precision_insuficiente"
    assert "±80 m" in r.json()["detail"] and "±50 m" in r.json()["detail"]
    assert fake.marcaciones == {}
    assert fake.anomalias == []          # no es una falta de la persona: no deja anomalía


def test_si_el_equipo_no_informa_la_precision_no_se_rechaza(client, fake):
    assert enviar(client, cuerpo()).status_code == 201


def test_la_web_tiene_su_propio_limite_mas_holgado(client, fake):
    web = dict(origen="web", motivo_contingencia="sin_bateria")
    assert enviar(client, cuerpo(precision_m=150, **web)).status_code == 201     # ≤ 200 m: pasa en la web
    fake.marcaciones.clear()
    r = enviar(client, cuerpo(precision_m=350, **web))
    assert r.status_code == 422 and r.json()["codigo"] == "precision_insuficiente"
    assert "±200 m" in r.json()["detail"]
    # y la app, con 150 m, no pasaría
    r = enviar(client, cuerpo(precision_m=150))
    assert r.status_code == 422


def test_el_limite_se_edita_desde_la_configuracion(client, fake):
    fake.config["precision_max_app_m"] = 100
    assert enviar(client, cuerpo(precision_m=80)).status_code == 201
    fake.marcaciones.clear()
    fake.config["precision_max_app_m"] = 20
    assert enviar(client, cuerpo(precision_m=30)).status_code == 422


def test_la_precision_se_revisa_antes_que_el_rostro(client, fake):
    falso = con_verificador(client, ResultadoVerificacion("fallida", 0.1, "no coincide"))
    r = enviar(client, cuerpo(precision_m=500))
    assert r.json()["codigo"] == "precision_insuficiente"
    assert not hasattr(falso, "criterios")           # ni siquiera se analizó la selfie
    assert fake.anomalias == []


def test_una_marcacion_sin_conexion_no_se_rechaza_por_precision(client, fake):
    r = llega(client, sin_conexion(precision_m=900))
    assert r.status_code == 201
    assert next(iter(fake.marcaciones.values()))["precision_m"] == 900


def zona(client, **extra):
    return client.get("/marcaciones/zona", params={"latitud": DENTRO["latitud"], "longitud": DENTRO["longitud"], **extra}, headers=H)


def test_la_zona_informa_el_limite_de_cada_canal(client, fake):
    assert zona(client).json()["precision_max_m"] == 50
    assert zona(client, origen="app").json()["precision_max_m"] == 50
    assert zona(client, origen="web").json()["precision_max_m"] == 200
    fake.config["precision_max_web_m"] = 400
    assert zona(client, origen="web").json()["precision_max_m"] == 400


def test_la_zona_rechaza_un_origen_desconocido(client):
    assert zona(client, origen="otro").status_code == 422
