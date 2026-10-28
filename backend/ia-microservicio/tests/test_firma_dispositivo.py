"""Firma de las marcaciones sin conexión con la clave del celular (app/firma_dispositivo.py).

Todo con criptografía real: `Celular` (tests/ayudas_firma.py) hace lo que el chip de seguridad del teléfono.
"""
import base64
import hashlib
from datetime import datetime, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec, rsa

from app import firma_dispositivo as firma
from tests.ayudas_firma import Celular, b64

UID = "11111111-1111-1111-1111-111111111111"


# ---------------------------------------------------------------- lo que se firma
def test_milisegundos_exactos_sin_pasar_por_decimales():
    assert firma.ms_epoch(datetime(1970, 1, 1, 0, 0, 1, 1000, tzinfo=timezone.utc)) == 1001
    assert firma.ms_epoch(datetime.fromisoformat("2026-10-15T08:00:00.123-05:00")) == 1792069200123
    # Una hora con milisegundos «difíciles» para los decimales: el entero no se queda en 122.
    assert firma.ms_epoch(datetime.fromisoformat("2026-10-15T13:00:00.123+00:00")) == 1792069200123


def test_el_mensaje_de_referencia_no_cambia():
    """Caso de referencia COMPARTIDO con la app (src/lib/firma/mensaje.test.ts): si uno cambia el formato, el otro falla."""
    m = firma.mensaje_de_marcacion(
        usuario_id="11111111-1111-1111-1111-111111111111", marcacion_id="22222222-2222-2222-2222-222222222222",
        tipo="ingreso", fecha_hora=datetime.fromisoformat("2026-10-15T08:00:00.123-05:00"),
        latitud=-2.14, longitud=-79.6, dispositivo_id="android:abc123", selfie_b64="AAAA",
    )
    assert m.decode() == (
        "asistencia-unemi/marca/v1\n"
        "11111111-1111-1111-1111-111111111111\n"
        "22222222-2222-2222-2222-222222222222\n"
        "ingreso\n"
        "1792069200123\n"
        "-2.140000\n"
        "-79.600000\n"
        "android:abc123\n"
        "63c1dd951ffedf6f7fd968ad4efa39b8ed584f162f46e715114ee184f8de9201"
    )
    assert hashlib.sha256(b"AAAA").hexdigest() == "63c1dd951ffedf6f7fd968ad4efa39b8ed584f162f46e715114ee184f8de9201"


def test_la_misma_hora_en_otra_zona_horaria_da_el_mismo_mensaje():
    base = dict(usuario_id=UID, marcacion_id="m", tipo="salida", latitud=1.0, longitud=2.0, dispositivo_id="d", selfie_b64="x")
    a = firma.mensaje_de_marcacion(fecha_hora=datetime.fromisoformat("2026-10-15T08:00:00-05:00"), **base)
    b = firma.mensaje_de_marcacion(fecha_hora=datetime.fromisoformat("2026-10-15T13:00:00+00:00"), **base)
    assert a == b


def test_el_desafio_es_estable_y_propio_de_cada_cuenta_y_celular():
    assert firma.desafio_de_clave("u-1", "cel-A") == firma.desafio_de_clave("u-1", "cel-A")
    assert len(firma.desafio_de_clave("u-1", "cel-A")) == 32
    assert firma.desafio_de_clave("u-1", "cel-A") != firma.desafio_de_clave("u-2", "cel-A")
    assert firma.desafio_de_clave("u-1", "cel-A") != firma.desafio_de_clave("u-1", "cel-B")


# ---------------------------------------------------------------- claves y firmas
def test_una_firma_buena_se_acepta_y_cualquier_cambio_la_invalida():
    c = Celular()
    mensaje = b"asistencia"
    f = c.firmar(mensaje)
    assert firma.firma_valida(c.publica_b64, mensaje, f)
    assert not firma.firma_valida(c.publica_b64, b"asistencia ", f)
    assert not firma.firma_valida(Celular().publica_b64, mensaje, f)            # la firmó otro celular
    assert not firma.firma_valida(c.publica_b64, mensaje, "AAAA")               # basura
    assert not firma.firma_valida(c.publica_b64, mensaje, "no es base64!!")
    assert not firma.firma_valida("no es una clave", mensaje, f)


def _spki(clave) -> str:
    return b64(clave.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo))


@pytest.mark.parametrize("clave", [
    "no es base64!!",
    "AAAA",
    _spki(rsa.generate_private_key(65537, 2048).public_key()),
    _spki(ec.generate_private_key(ec.SECP384R1()).public_key()),
])
def test_solo_se_aceptan_claves_p256(clave):
    with pytest.raises(firma.ClaveInvalida):
        firma.cargar_clave_publica(clave)


def test_la_clave_se_guarda_en_forma_canonica():
    c = Celular()
    assert firma.clave_a_b64(firma.cargar_clave_publica(c.publica_b64)) == c.publica_b64


# ---------------------------------------------------------------- prueba de hardware (Android)
DESAFIO = firma.desafio_de_clave(UID, "android:abc")


def test_cadena_buena_en_strongbox_con_arranque_verificado():
    c = Celular()
    cadena, huella = c.cadena(DESAFIO, nivel=2, estado_arranque=0)
    e = firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)
    assert e == {"plataforma": "android", "nivel": "strongbox", "arranque_verificado": True, "raiz_anclada": False}
    assert firma.esta_en_hardware(e)


def test_cadena_en_tee():
    c = Celular()
    cadena, _ = c.cadena(DESAFIO, nivel=1)
    assert firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)["nivel"] == "tee"


def test_clave_en_software_no_cuenta_como_hardware():
    c = Celular()
    cadena, _ = c.cadena(DESAFIO, nivel=0)
    e = firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)
    assert e["nivel"] == "software" and not firma.esta_en_hardware(e)


@pytest.mark.parametrize("estado,esperado", [(0, True), (1, False), (2, False), (3, False), (None, None)])
def test_se_lee_si_el_celular_arranco_con_el_sistema_original(estado, esperado):
    c = Celular()
    cadena, _ = c.cadena(DESAFIO, estado_arranque=estado)
    assert firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)["arranque_verificado"] is esperado


def test_con_la_huella_de_la_raiz_la_cadena_queda_anclada():
    c = Celular()
    cadena, huella = c.cadena(DESAFIO)
    e = firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO, frozenset({huella}))
    assert e["raiz_anclada"] is True


def test_una_raiz_que_no_es_la_esperada_se_rechaza():
    c = Celular()
    cadena, _ = c.cadena(DESAFIO)
    with pytest.raises(firma.AtestacionInvalida, match="raíz"):
        firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO, frozenset({"0" * 64}))


def test_la_prueba_con_otro_desafio_se_rechaza():
    c = Celular()
    cadena, _ = c.cadena(firma.desafio_de_clave("otra-cuenta", "android:abc"))
    with pytest.raises(firma.AtestacionInvalida, match="cuenta"):
        firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)


def test_la_prueba_de_otra_clave_se_rechaza():
    c, otro = Celular(), Celular()
    cadena, _ = otro.cadena(DESAFIO)
    with pytest.raises(firma.AtestacionInvalida, match="otra clave"):
        firma.evaluar_atestacion(cadena, c.publica_b64, DESAFIO)


def test_una_cadena_incoherente_se_rechaza():
    c = Celular()
    with pytest.raises(firma.AtestacionInvalida, match="coherente"):
        firma.evaluar_atestacion(c.cadena_mal_firmada(DESAFIO), c.publica_b64, DESAFIO)


def test_un_certificado_sin_la_prueba_de_hardware_se_rechaza():
    c = Celular()
    with pytest.raises(firma.AtestacionInvalida, match="prueba de hardware"):
        firma.evaluar_atestacion(c.cadena_sin_extension(), c.publica_b64, DESAFIO)


def test_cadena_vacia_o_con_basura_se_rechaza():
    c = Celular()
    with pytest.raises(firma.AtestacionInvalida):
        firma.evaluar_atestacion([], c.publica_b64, DESAFIO)
    with pytest.raises(firma.AtestacionInvalida):
        firma.evaluar_atestacion([b64(b"no soy un certificado")], c.publica_b64, DESAFIO)
    with pytest.raises(firma.AtestacionInvalida):
        firma.evaluar_atestacion(["***"], c.publica_b64, DESAFIO)


@pytest.mark.parametrize("extension", [
    b"\x30\x82\x01",                              # largo que promete más de lo que hay
    b"\x02\x01\x05",                              # no es una secuencia
    b"\x30\x03\x02\x01\x05",                      # secuencia con muy pocos campos
    b"",                                           # vacía
])
def test_una_extension_danada_termina_en_rechazo_y_no_en_error_interno(extension):
    c = Celular()
    with pytest.raises(firma.AtestacionInvalida):
        firma.evaluar_atestacion(c.cadena_con_extension(extension), c.publica_b64, DESAFIO)


def test_el_lector_de_der_rechaza_lo_incompleto():
    for datos in (b"", b"\x30", b"\x30\x05\x01", b"\xbf\x85", b"\x30\x85\x00\x00\x00\x00\x01\x00"):
        with pytest.raises(firma.AtestacionInvalida):
            firma._leer_tlv(datos, 0)
