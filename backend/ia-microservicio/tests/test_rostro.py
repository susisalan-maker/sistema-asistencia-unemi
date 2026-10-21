"""Registro de rostro (POST /rostro/registro) y verificador facial, con un motor falso (sin modelos)."""
import numpy as np
import pytest
from fastapi import HTTPException

from app import cifrado
from app.biometria import Analisis, ErrorRostro, get_motor
from app.config import Settings, get_settings
from app.verificacion import VerificadorFacial
from tests.conftest import SEDE_ID

UID = "55555555-5555-5555-5555-555555555555"
H = {"Authorization": "Bearer token-dev"}
CLAVE = bytes(range(32))


@pytest.fixture
def anyio_backend():
    return "asyncio"


def unitario(semilla, mezcla_con=None, peso=0.0):
    v = np.random.default_rng(semilla).normal(size=512).astype(np.float32)
    if mezcla_con is not None:
        v = (1 - peso) * v / np.linalg.norm(v) + peso * mezcla_con
    return v / np.linalg.norm(v)


class MotorFalso:
    """La «foto» es una palabra: «persona-A», «persona-A-leve», «persona-B», o un código de error."""

    def __init__(self):
        self.base = {"A": unitario(1), "B": unitario(2)}
        self.giros = []

    def analizar(self, foto, max_giro=0.4):
        self.giros.append(max_giro)
        if foto.startswith("error:"):
            raise ErrorRostro(foto[6:], f"mensaje {foto[6:]}")
        persona = foto.split("-")[1]
        v = self.base[persona]
        if foto.endswith("leve"):
            v = unitario(99, v, 0.9)   # misma persona, algo distinta (giro leve)
        return Analisis(v, 0.1, 120.0, 100.0, 150.0)


@pytest.fixture(autouse=True)
def usuario(fake):
    fake.tokens["token-dev"] = UID
    fake.filas[UID] = {"id": UID, "rol": "usuario", "activo": True, "email": "d@x.com", "sede_id": SEDE_ID,
                       "fecha_registro_rostro": None}


@pytest.fixture
def motor(client):
    m = MotorFalso()
    client.app.dependency_overrides[get_motor] = lambda: m
    cfg = Settings(supabase_url="http://sb", supabase_service_role_key="k", verificacion_facial="real",
                   rostro_clave_aes=CLAVE.hex())
    client.app.dependency_overrides[get_settings] = lambda: cfg
    return m


def registrar(client, fotos=("f-A", "f-A-leve", "f-A-leve"), consentimiento=True, headers=H):
    return client.post("/rostro/registro", json={"consentimiento": consentimiento, "fotos": list(fotos)}, headers=headers)


def test_exige_sesion_y_rol_usuario(client, motor):
    assert client.post("/rostro/registro", json={"consentimiento": True, "fotos": ["a"] * 3}).status_code == 401
    r = registrar(client, headers={"Authorization": "Bearer token-admin"})
    assert r.status_code == 403


def test_registro_guarda_vectores_cifrados_y_nada_mas(client, fake, motor):
    r = registrar(client)
    assert r.status_code == 201 and r.json()["rostro_registrado"] is True
    fila = fake.rostros[UID]
    assert fila["version_clave"] == 1
    claro = cifrado.descifrar_vectores(cifrado.bytea_desde_postgrest(fila["vectores_cifrados"]), CLAVE, UID)
    assert claro.shape == (3, 512)
    assert fake.filas[UID]["fecha_registro_rostro"] and fake.filas[UID]["fecha_consentimiento_biometrico"]
    assert "f-A" not in str(fake.rostros)            # la foto no se guarda


def test_la_primera_foto_es_de_frente_y_las_otras_toleran_giro(client, motor):
    registrar(client, ("f-A", "f-A-leve", "f-A-leve", "f-A-leve"))
    assert motor.giros == [0.30, 0.60, 0.60, 0.60]


def test_sin_consentimiento(client, fake, motor):
    r = registrar(client, consentimiento=False)
    assert r.status_code == 422 and "consentimiento" in r.text and fake.rostros == {}


@pytest.mark.parametrize("cantidad", [1, 2, 6])
def test_de_3_a_5_fotos(client, motor, cantidad):
    assert registrar(client, ("f-A",) * cantidad).status_code == 422


def test_foto_con_problema_dice_cual(client, fake, motor):
    r = registrar(client, ("f-A", "error:borrosa", "f-A-leve"))
    assert r.status_code == 422 and "Foto 2" in r.text and "borrosa" in r.text and fake.rostros == {}


def test_foto_de_pantalla_en_el_registro_se_rechaza(client, fake, motor):
    r = registrar(client, ("f-A", "f-A-leve", "error:no_es_real"))
    assert r.status_code == 422 and "Foto 3" in r.text and fake.rostros == {}


def test_fotos_de_personas_distintas(client, fake, motor):
    r = registrar(client, ("f-A", "f-B", "f-A-leve"))
    assert r.status_code == 422 and "misma persona" in r.text and fake.rostros == {}


def test_ya_registrado_no_registra_otro(client, fake, motor):
    fake.filas[UID]["fecha_registro_rostro"] = "2026-10-01T00:00:00+00:00"
    r = registrar(client)
    assert r.status_code == 409 and "reinicie" in r.text and fake.rostros == {}


def test_carrera_ya_tiene_rostro_en_la_base(client, fake, motor):
    fake.rostros[UID] = {"vectores_cifrados": "\\x00", "version_clave": 1}
    r = registrar(client)
    assert r.status_code == 409


def test_error_de_base_de_datos(client, fake, motor):
    fake.rostro_falla = "boom"
    r = registrar(client)
    assert r.status_code == 502


def test_sin_clave_configurada(client, motor):
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="http://sb", supabase_service_role_key="k", verificacion_facial="real")
    r = registrar(client)
    assert r.status_code == 503 and "ROSTRO_CLAVE_AES" in r.text


# ---------------------------------------------------------------- verificador
def verificador(fake, motor, umbral=0.40, version=1):
    return VerificadorFacial(fake, motor, CLAVE, umbral, version)


def con_rostro_registrado(fake, usuario_id=UID, fotos=("f-A", "f-A-leve", "f-A-leve")):
    m = MotorFalso()
    vecs = np.array([m.analizar(f).vector for f in fotos])
    fake.rostros[usuario_id] = {
        "vectores_cifrados": cifrado.bytea_para_postgrest(cifrado.cifrar_vectores(vecs, CLAVE, usuario_id)),
        "version_clave": 1,
    }
    fake.filas[usuario_id]["fecha_registro_rostro"] = "2026-10-01T00:00:00+00:00"


@pytest.mark.anyio
async def test_misma_persona_se_verifica(fake):
    con_rostro_registrado(fake)
    r = await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "f-A-leve")
    assert r.estado == "verificada" and 0.4 <= r.score <= 1


@pytest.mark.anyio
async def test_otra_persona_falla(fake):
    con_rostro_registrado(fake)
    r = await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "f-B")
    assert r.estado == "fallida" and r.score < 0.4 and "no coincide" in r.motivo


@pytest.mark.anyio
async def test_sin_rostro_registrado_no_se_puede_marcar(fake):
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "f-A")
    assert e.value.status_code == 409 and "registrar tu rostro" in e.value.detail


@pytest.mark.anyio
async def test_fechas_dicen_que_hay_rostro_pero_la_fila_no_existe(fake):
    fake.filas[UID]["fecha_registro_rostro"] = "2026-10-01T00:00:00+00:00"
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "f-A")
    assert e.value.status_code == 409


@pytest.mark.anyio
async def test_foto_de_pantalla_es_verificacion_fallida_con_motivo(fake):
    con_rostro_registrado(fake)
    r = await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "error:no_es_real")
    assert r.estado == "fallida" and r.score is None and "foto o una pantalla" in r.motivo


@pytest.mark.anyio
async def test_falta_la_selfie(fake):
    con_rostro_registrado(fake)
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso()).verificar(fake.filas[UID], None)
    assert e.value.status_code == 422


@pytest.mark.anyio
async def test_foto_mala_pide_repetir_sin_contar_como_fallo(fake):
    con_rostro_registrado(fake)
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso()).verificar(fake.filas[UID], "error:muy_oscura")
    assert e.value.status_code == 422 and "muy_oscura" in e.value.detail


@pytest.mark.anyio
async def test_clave_equivocada_da_503(fake):
    con_rostro_registrado(fake)
    v = VerificadorFacial(fake, MotorFalso(), bytes(32), 0.4, 1)
    with pytest.raises(HTTPException) as e:
        await v.verificar(fake.filas[UID], "f-A")
    assert e.value.status_code == 503


@pytest.mark.anyio
async def test_version_de_clave_distinta_da_503(fake):
    con_rostro_registrado(fake)
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso(), version=2).verificar(fake.filas[UID], "f-A")
    assert e.value.status_code == 503


@pytest.mark.anyio
async def test_el_cifrado_de_otro_usuario_no_sirve(fake):
    con_rostro_registrado(fake)
    otro = "99999999-9999-9999-9999-999999999999"
    fake.filas[otro] = {"id": otro, "fecha_registro_rostro": "2026-10-01T00:00:00+00:00"}
    fake.rostros[otro] = fake.rostros[UID]   # alguien copia el cifrado a otra cuenta
    with pytest.raises(HTTPException) as e:
        await verificador(fake, MotorFalso()).verificar(fake.filas[otro], "f-A")
    assert e.value.status_code == 503


@pytest.mark.anyio
async def test_umbral_configurable(fake):
    con_rostro_registrado(fake)
    r = await verificador(fake, MotorFalso(), umbral=1.01).verificar(fake.filas[UID], "f-A-leve")
    assert r.estado == "fallida"
