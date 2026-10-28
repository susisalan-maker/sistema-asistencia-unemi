"""POST /dispositivo/clave: el celular vinculado registra la clave pública que creó en su chip de seguridad."""
import pytest

from app import firma_dispositivo as firma
from app.config import Settings, get_settings
from tests.ayudas_firma import Celular
from tests.test_dispositivo import H, OTRO, UID, usuarios_de_prueba, vincular  # noqa: F401

DISPOSITIVO = "cel-A"


def con_ajustes(client, **extra):
    client.app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="http://sb", supabase_service_role_key="k", url_panel_web="http://panel.test",
        verificacion_facial="simulada", **extra,
    )


def registrar(client, celular, plataforma="ios", cadena=None, dispositivo=DISPOSITIVO, headers=H):
    cuerpo = {"dispositivo_id": dispositivo, "clave_publica": celular.publica_b64, "plataforma": plataforma}
    if cadena is not None:
        cuerpo["cadena"] = cadena
    return client.post("/dispositivo/clave", json=cuerpo, headers=headers)


def cadena_android(celular, uid=UID, dispositivo=DISPOSITIVO, **kw):
    return celular.cadena(firma.desafio_de_clave(uid, dispositivo), **kw)


# ---------------------------------------------------------------- quién puede
def test_exige_sesion_de_usuario(client):
    c = Celular()
    assert client.post("/dispositivo/clave", json={"dispositivo_id": "x", "clave_publica": c.publica_b64, "plataforma": "ios"}).status_code == 401
    assert registrar(client, c, headers={"Authorization": "Bearer token-admin"}).status_code == 403


def test_primero_hay_que_vincular_el_celular(client, fake):
    r = registrar(client, Celular())
    assert r.status_code == 409 and "vincula" in r.json()["detail"]
    assert fake.filas[UID].get("clave_publica") is None


def test_solo_el_celular_vinculado_registra_su_clave(client, fake):
    vincular(client, "cel-A")
    r = registrar(client, Celular(), dispositivo="cel-B")
    assert r.status_code == 409 and "vincula" in r.json()["detail"]
    assert fake.filas[UID].get("clave_publica") is None


# ---------------------------------------------------------------- registro
def test_iphone_registra_la_clave_sin_prueba(client, fake):
    vincular(client)
    c = Celular()
    r = registrar(client, c, "ios")
    assert r.status_code == 200 and r.json()["clave"] == "registrada" and r.json()["nivel"] == "sin_prueba"
    assert fake.filas[UID]["clave_publica"] == c.publica_b64
    assert fake.filas[UID]["clave_evidencia"]["plataforma"] == "ios"
    assert fake.filas[UID]["clave_registrada_at"]


def test_android_registra_la_clave_con_su_prueba_de_hardware(client, fake):
    vincular(client)
    c = Celular()
    cadena, _ = cadena_android(c, nivel=2, estado_arranque=0)
    r = registrar(client, c, "android", cadena)
    assert r.status_code == 200 and r.json()["nivel"] == "strongbox"
    ev = fake.filas[UID]["clave_evidencia"]
    assert ev == {"plataforma": "android", "nivel": "strongbox", "arranque_verificado": True, "raiz_anclada": False}


def test_android_sin_cadena_se_registra_como_sin_prueba(client, fake):
    vincular(client)
    r = registrar(client, Celular(), "android")
    assert r.status_code == 200 and r.json()["nivel"] == "sin_prueba"


def test_repetir_la_misma_clave_no_vuelve_a_escribir(client, fake):
    vincular(client)
    c = Celular()
    registrar(client, c)
    fake.llamadas.clear()
    r = registrar(client, c)
    assert r.status_code == 200 and r.json()["clave"] == "ya_registrada"
    assert fake.llamadas == []


def test_una_clave_invalida_se_rechaza(client, fake):
    vincular(client)
    r = client.post("/dispositivo/clave", json={"dispositivo_id": DISPOSITIVO, "clave_publica": "A" * 120, "plataforma": "ios"}, headers=H)
    assert r.status_code == 422
    assert fake.filas[UID].get("clave_publica") is None


def test_la_cadena_solo_existe_en_android(client):
    vincular(client)
    c = Celular()
    cadena, _ = cadena_android(c)
    assert registrar(client, c, "ios", cadena).status_code == 422


# ---------------------------------------------------------------- la prueba de hardware debe ser verdadera
@pytest.mark.parametrize("hacer", [
    lambda c: c.cadena(firma.desafio_de_clave("otra-cuenta", DISPOSITIVO))[0],       # desafío de otra cuenta
    lambda c: c.cadena(firma.desafio_de_clave(UID, "otro-celular"))[0],              # desafío de otro celular
    lambda c: Celular().cadena(firma.desafio_de_clave(UID, DISPOSITIVO))[0],         # prueba de otra clave
    lambda c: c.cadena_mal_firmada(firma.desafio_de_clave(UID, DISPOSITIVO)),        # cadena incoherente
    lambda c: c.cadena_sin_extension(),                                              # sin prueba de hardware
])
def test_una_prueba_falsa_se_rechaza_y_no_se_guarda_nada(client, fake, hacer):
    vincular(client)
    c = Celular()
    r = registrar(client, c, "android", hacer(c))
    assert r.status_code == 422 and "chip de seguridad" in r.json()["detail"]
    assert fake.filas[UID].get("clave_publica") is None


def test_si_se_exige_hardware_una_clave_en_software_no_se_registra(client, fake):
    con_ajustes(client, firma_exige_hardware=True)
    vincular(client)
    c = Celular()
    cadena, _ = cadena_android(c, nivel=0)
    assert registrar(client, c, "android", cadena).status_code == 422
    assert registrar(client, c, "android").status_code == 422          # y sin prueba tampoco
    assert fake.filas[UID].get("clave_publica") is None
    cadena, _ = cadena_android(c, nivel=1)
    assert registrar(client, c, "android", cadena).status_code == 200


def test_si_se_exige_hardware_el_iphone_no_queda_bloqueado(client):
    con_ajustes(client, firma_exige_hardware=True)
    vincular(client)
    assert registrar(client, Celular(), "ios").status_code == 200


def test_la_raiz_configurada_se_exige(client, fake):
    c = Celular()
    cadena, huella = cadena_android(c)
    con_ajustes(client, atestacion_raices_sha256="ab:cd, " + "0" * 64)
    vincular(client)
    assert registrar(client, c, "android", cadena).status_code == 422
    con_ajustes(client, atestacion_raices_sha256=huella.upper())
    r = registrar(client, c, "android", cadena)
    assert r.status_code == 200 and fake.filas[UID]["clave_evidencia"]["raiz_anclada"] is True


# ---------------------------------------------------------------- cambiar de clave
def test_una_clave_distinta_no_reemplaza_a_la_registrada(client, fake):
    vincular(client)
    primera = Celular()
    registrar(client, primera)
    r = registrar(client, Celular())
    assert r.status_code == 409 and "Talento Humano" in r.json()["detail"]
    assert fake.filas[UID]["clave_publica"] == primera.publica_b64


def test_android_reinstalado_puede_reemplazar_si_demuestra_hardware_y_arranque_original(client, fake):
    primera = Celular()
    nueva = Celular()
    cadena, huella = cadena_android(nueva, nivel=2, estado_arranque=0)
    con_ajustes(client, atestacion_raices_sha256=huella)
    vincular(client)
    registrar(client, primera)
    r = registrar(client, nueva, "android", cadena)
    assert r.status_code == 200 and r.json()["clave"] == "reemplazada"
    assert fake.filas[UID]["clave_publica"] == nueva.publica_b64


@pytest.mark.parametrize("kw,por_que", [
    (dict(nivel=0), "clave en software"),
    (dict(estado_arranque=2), "celular con el cargador abierto o rooteado"),
    (dict(estado_arranque=None), "sin dato del arranque"),
])
def test_no_se_reemplaza_la_clave_si_la_prueba_no_es_buena(client, fake, kw, por_que):
    primera = Celular()
    nueva = Celular()
    cadena, huella = cadena_android(nueva, **kw)
    con_ajustes(client, atestacion_raices_sha256=huella)
    vincular(client)
    registrar(client, primera)
    r = registrar(client, nueva, "android", cadena)
    assert r.status_code == 409, por_que
    assert fake.filas[UID]["clave_publica"] == primera.publica_b64


def test_sin_raiz_configurada_nunca_se_reemplaza_sola(client, fake):
    """Sin anclar la cadena, cualquiera podría inventar una «que dice» ser de hardware: solo el Administrador reinicia."""
    primera, nueva = Celular(), Celular()
    cadena, _ = cadena_android(nueva)
    vincular(client)
    registrar(client, primera)
    assert registrar(client, nueva, "android", cadena).status_code == 409


def test_el_iphone_nunca_reemplaza_su_clave_solo(client, fake):
    vincular(client)
    registrar(client, Celular(), "ios")
    assert registrar(client, Celular(), "ios").status_code == 409


# ---------------------------------------------------------------- carreras y fallos de la base
def test_la_clave_de_otra_cuenta_no_se_acepta(client, fake):
    vincular(client)
    fake.clave_choca = True
    r = registrar(client, Celular())
    assert r.status_code == 409 and "otra cuenta" in r.json()["detail"]


def test_si_otra_solicitud_registro_una_clave_justo_antes_se_rechaza(client, fake, monkeypatch):
    vincular(client)
    c = Celular()
    original = fake.registrar_clave

    async def alguien_se_adelanto(uid, *a, **kw):
        fake.filas[uid]["clave_publica"] = Celular().publica_b64
        return await original(uid, *a, **kw)

    monkeypatch.setattr(fake, "registrar_clave", alguien_se_adelanto)
    assert registrar(client, c).status_code == 409


def test_un_fallo_de_la_base_es_502(client, fake, monkeypatch):
    vincular(client)

    async def falla(*a, **kw):
        from app.supabase_client import SupabaseError
        raise SupabaseError(500, "caída")

    monkeypatch.setattr(fake, "registrar_clave", falla)
    assert registrar(client, Celular()).status_code == 502
