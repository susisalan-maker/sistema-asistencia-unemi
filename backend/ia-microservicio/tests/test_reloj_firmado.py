"""Hora del servidor firmada: detecta el reloj atrasado en una marcación sin conexión (app/reloj.py).

La cota es «hora firmada por el servidor + tiempo que el celular estuvo encendido»: la hora real de la marcación no
puede ser anterior. Si el reloj del celular dice algo anterior (más la tolerancia), estaba atrasado.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app import reloj
from app.verificacion import ResultadoVerificacion
from tests.test_marcacion_sin_conexion import hora, llega, sin_conexion, guardada  # noqa: F401
from tests.test_marcaciones import H, MARCA_ID, con_verificador, usuario_marcador  # noqa: F401

CLAVE = reloj.clave_de("k")   # la clave de servicio que usan las pruebas (ver conftest)
MIN = 60_000


@pytest.fixture(autouse=True)
def verificacion_buena(client):
    return con_verificador(client, ResultadoVerificacion("verificada", 0.9))


def prueba(ancla="07:50", encendido_min=10, usuario=MARCA_ID, **cambios):
    """La prueba que mandaría la app: recibió la hora `ancla` del servidor y, al marcar, llevaba `encendido_min` minutos
    más de celular encendido."""
    t = hora(ancla)
    p = {
        "servidor_t": t.isoformat(), "firma": reloj.firmar(CLAVE, usuario, t),
        "arranque_ancla_ms": 5_000_000, "arranque_marca_ms": 5_000_000 + encendido_min * MIN,
    }
    p.update(cambios)
    return p


# ---------------------------------------------------------------- la firma
def test_la_firma_es_estable_y_esta_ligada_a_la_persona_y_a_la_hora():
    t = datetime(2026, 10, 15, 12, 0, tzinfo=timezone.utc)
    f = reloj.firmar(CLAVE, "u-1", t)
    assert len(f) == 64 and f == reloj.firmar(CLAVE, "u-1", t)
    assert reloj.firma_valida(CLAVE, "u-1", t, f)
    assert not reloj.firma_valida(CLAVE, "u-2", t, f)                        # de otra persona
    assert not reloj.firma_valida(CLAVE, "u-1", t + timedelta(minutes=1), f)  # otra hora
    assert not reloj.firma_valida(reloj.clave_de("otra"), "u-1", t, f)        # otra clave del servidor


def test_la_misma_hora_en_otra_zona_horaria_firma_igual():
    ecuador = datetime.fromisoformat("2026-10-15T07:50:00-05:00")
    utc = datetime.fromisoformat("2026-10-15T12:50:00+00:00")
    assert reloj.firmar(CLAVE, "u-1", ecuador) == reloj.firmar(CLAVE, "u-1", utc)


def test_la_hora_entregada_va_en_milisegundos_y_se_puede_verificar():
    ahora = datetime(2026, 10, 15, 12, 0, 0, 123456, tzinfo=timezone.utc)
    h = reloj.hora_servidor(CLAVE, "u-1", ahora)
    t = datetime.fromisoformat(h["t"])
    assert t.microsecond == 123000
    assert reloj.firma_valida(CLAVE, "u-1", t, h["firma"])


def test_hoy_entrega_la_hora_firmada_de_quien_pregunta(client, fake):
    j = client.get("/marcaciones/hoy", headers=H).json()
    t = datetime.fromisoformat(j["hora_servidor"]["t"])
    assert reloj.firma_valida(CLAVE, MARCA_ID, t, j["hora_servidor"]["firma"])
    assert abs((datetime.now(timezone.utc) - t).total_seconds()) < 60


# ---------------------------------------------------------------- quien tiene el reloj bien nunca es rechazado
def test_con_el_reloj_bien_se_acepta(client, fake):
    # Recibió la hora a las 07:50, marcó 10 minutos después (celular encendido), a las 08:00.
    r = llega(client, sin_conexion(marco="08:00", reloj=prueba("07:50", 10)), a="09:00")
    assert r.status_code == 201
    assert datetime.fromisoformat(guardada(fake)["fecha_hora"]) == hora("08:00")


def test_si_el_celular_durmio_la_cota_es_mas_baja_y_se_acepta(client, fake):
    # Pasó más de una hora desde que recibió la hora, pero el celular solo estuvo encendido 5 minutos (reposo).
    r = llega(client, sin_conexion(marco="08:00", reloj=prueba("06:50", 5)), a="09:00")
    assert r.status_code == 201


def test_un_reloj_algo_desajustado_dentro_de_la_tolerancia_se_acepta(client, fake):
    # La cota es 08:00 y la hora del celular es 07:57: 3 minutos de diferencia, dentro de los 5 que se toleran.
    r = llega(client, sin_conexion(marco="07:57", reloj=prueba("07:50", 10)), a="09:00")
    assert r.status_code == 201


# ---------------------------------------------------------------- el reloj atrasado se rechaza
def test_con_el_reloj_atrasado_se_rechaza_y_no_se_guarda(client, fake):
    # Recibió la hora a las 07:50 y marcó 10 minutos después, pero el reloj del celular decía 07:20.
    r = llega(client, sin_conexion(marco="07:20", reloj=prueba("07:50", 10)), a="09:00")
    assert r.status_code == 422
    assert r.json()["codigo"] == "hora_invalida" and "atrasada" in r.json()["detail"]
    assert fake.marcaciones == {}


def test_atrasar_mucho_el_reloj_tambien_se_rechaza(client, fake):
    r = llega(client, sin_conexion(marco="06:00", reloj=prueba("07:50", 10)), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "hora_invalida"


# ---------------------------------------------------------------- la prueba no se puede inventar
def test_una_firma_incorrecta_se_rechaza(client, fake):
    r = llega(client, sin_conexion(marco="08:00", reloj=prueba(firma="0" * 64)), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "hora_invalida"
    assert "No pudimos comprobar" in r.json()["detail"]
    assert fake.marcaciones == {}


def test_no_sirve_la_hora_firmada_para_otra_persona(client, fake):
    r = llega(client, sin_conexion(marco="08:00", reloj=prueba(usuario="otra-persona")), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "hora_invalida"


def test_cambiar_la_hora_firmada_para_aflojar_la_cota_invalida_la_firma(client, fake):
    # La firma es de las 07:50; quien la quiera usar como si fuera de las 06:00 para poder atrasar el reloj no puede.
    buena = prueba("07:50", 10)
    r = llega(client, sin_conexion(marco="06:30", reloj={**buena, "servidor_t": hora("06:00").isoformat()}), a="09:00")
    assert r.status_code == 422 and "No pudimos comprobar" in r.json()["detail"]


def test_un_tiempo_encendido_imposible_se_rechaza(client, fake):
    # Dice que estuvo encendido 40 minutos desde las 08:20, pero el servidor la recibe a las 08:30.
    r = llega(client, sin_conexion(marco="08:25", reloj=prueba("08:20", 40)), a="08:30")
    assert r.status_code == 422 and "No pudimos comprobar" in r.json()["detail"]


# ---------------------------------------------------------------- sin prueba, todo sigue igual
def test_sin_prueba_se_usa_la_hora_del_celular_como_antes(client, fake):
    r = llega(client, sin_conexion(marco="08:00"), a="09:00")
    assert r.status_code == 201


# ---------------------------------------------------------------- formato de lo que manda la app
def test_la_prueba_solo_va_en_una_marcacion_sin_conexion(client, fake):
    datos = sin_conexion(marco="08:00", reloj=prueba())
    datos["sin_conexion"] = False
    assert llega(client, datos, a="08:00").status_code == 422


def test_el_contador_de_arranque_no_puede_retroceder(client, fake):
    r = llega(client, sin_conexion(marco="08:00", reloj=prueba(arranque_ancla_ms=9_000_000, arranque_marca_ms=1_000)), a="09:00")
    assert r.status_code == 422


# ---------------------------------------------------------------- de punta a punta: lo que entrega /hoy lo acepta el POST
def test_la_hora_que_entrega_hoy_es_exactamente_la_que_acepta_la_marcacion(client, fake):
    j = client.get("/marcaciones/hoy", headers=H).json()["hora_servidor"]
    t = datetime.fromisoformat(j["t"])
    marcada = (t + timedelta(minutes=1)).astimezone(timezone(timedelta(hours=-5)))
    datos = sin_conexion(marco="08:00", reloj={
        "servidor_t": j["t"], "firma": j["firma"], "arranque_ancla_ms": 1_000, "arranque_marca_ms": 61_000,
    })
    datos["fecha_hora"] = marcada.isoformat()
    # Con el reloj del servidor dos minutos después de que entregó la hora, la marcación (un minuto después) es creíble.
    from tests.test_marcaciones import enviar
    r = enviar(client, datos, reloj=t + timedelta(minutes=2))
    assert r.status_code == 201, r.text
    # Y con el reloj atrasado diez minutos respecto de lo que el celular encendido prueba, no.
    datos2 = sin_conexion(tipo="salida_almuerzo", marco="08:00", reloj=datos["reloj"])
    datos2["fecha_hora"] = (t - timedelta(minutes=9)).astimezone(timezone(timedelta(hours=-5))).isoformat()
    r2 = enviar(client, datos2, reloj=t + timedelta(minutes=2))
    assert r2.status_code == 422 and r2.json()["codigo"] == "hora_invalida"
