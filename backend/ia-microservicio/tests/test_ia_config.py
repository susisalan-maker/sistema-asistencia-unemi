"""Claves de IA desde el panel: alta, edición, activación (una sola activa), llaves cifradas, prueba de conexión y
elección dinámica del cliente."""
import asyncio

import httpx
import pytest

from app import cifrado
from app.config import Settings, get_settings
from app.ia import (
    ClienteGemini, ClienteIA, ClienteOpenAI, IAError, MODELO_ANTHROPIC, MODELO_GEMINI, MODELO_OPENAI, crear_cliente_de,
    get_ia, llave_de_clave, llave_de_entorno,
)
from app.supabase_client import SupabaseError
from tests.conftest import ADMIN_ID, admin_headers
from tests.test_anomalias import TEXTO, anomalia, justificar, personas  # noqa: F401  (fixture `personas`)

CLAVE = "ab" * 32
LLAVE = "AIzaSyEjemplo1234567890abcdWXYZ"
LLAVE_B = "sk-ant-" + "y" * 30 + "9876"
H = admin_headers


def ajustes(**kw):
    return Settings(supabase_url="http://sb", supabase_service_role_key="k", url_panel_web="http://panel.test",
                    verificacion_facial="simulada", **kw)


@pytest.fixture
def cliente(client):
    client.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes=CLAVE)
    return client


def crear(c, proveedor="gemini", nombre="Producción", llave=LLAVE, **kw):
    r = c.post("/ia/claves", json={"proveedor": proveedor, "nombre": nombre, "llave": llave, **kw}, headers=H())
    assert r.status_code == 201, r.text
    return r.json()


def correr(c):
    return asyncio.run(c)


# ------------------------------------------------------------------ cifrado de textos
def test_el_texto_cifrado_se_abre_solo_con_su_clave_y_su_contexto():
    clave = cifrado.clave_desde_texto(CLAVE)
    c = cifrado.cifrar_texto(LLAVE, clave, "gemini")
    assert LLAVE.encode() not in c
    assert cifrado.descifrar_texto(c, clave, "gemini") == LLAVE
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_texto(c, clave, "anthropic")                      # copiado a otro proveedor
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_texto(c, cifrado.clave_desde_texto("cd" * 32), "gemini")
    assert cifrado.cifrar_texto(LLAVE, clave, "gemini") != c                # nonce distinto cada vez


# ------------------------------------------------------------------ crear
class TestCrear:
    def test_guarda_cifrada_y_responde_solo_con_los_ultimos_4(self, cliente, fake):
        r = cliente.post("/ia/claves", json={"proveedor": "gemini", "nombre": "  Producción ", "llave": LLAVE}, headers=H())
        assert r.status_code == 201
        d = r.json()
        assert d["nombre"] == "Producción" and d["proveedor"] == "gemini" and d["ultimos_4"] == "WXYZ" and d["activa"] is False
        assert d["modelo"] is None and d["modelo_predeterminado"] == MODELO_GEMINI
        assert LLAVE not in r.text and "llave_cifrada" not in d
        fila = fake.ia_claves[d["id"]]
        assert LLAVE not in str(fila) and fila["created_by"] == ADMIN_ID
        clave = cifrado.clave_desde_texto(CLAVE)
        assert cifrado.descifrar_texto(cifrado.bytea_desde_postgrest(fila["llave_cifrada"]), clave, "gemini") == LLAVE

    def test_modelo_vacio_es_el_recomendado_y_uno_escrito_se_guarda(self, cliente, fake):
        a = crear(cliente, nombre="A", modelo="  ")
        b = crear(cliente, nombre="B", modelo="gemini-2.5-pro")
        assert a["modelo"] is None and b["modelo"] == "gemini-2.5-pro"

    def test_con_activar_pasa_a_ser_la_unica_activa(self, cliente, fake):
        a = crear(cliente, nombre="A", activar=True)
        assert a["activa"] is True
        b = crear(cliente, "anthropic", "B", LLAVE_B, activar=True)
        assert b["activa"] is True
        assert [f["activa"] for f in fake.ia_claves.values()] == [False, True]
        assert [x["evento"] for x in fake.bitacora if x["campo"] == "activa"] == ["activar", "desactivar", "activar"]

    def test_sin_activar_no_toca_la_activa(self, cliente, fake):
        a = crear(cliente, nombre="A", activar=True)
        crear(cliente, "openai", "B", "sk-" + "z" * 30)
        assert fake.ia_claves[a["id"]]["activa"] is True and sum(f["activa"] for f in fake.ia_claves.values()) == 1

    def test_deja_constancia_en_la_bitacora_sin_la_llave(self, cliente, fake):
        d = crear(cliente, motivo="Clave de producción")
        b = fake.bitacora[0]
        assert (b["evento"], b["entidad"], b["entidad_id"], b["usuario_id"]) == ("crear", "ia_claves", d["id"], ADMIN_ID)
        assert b["valor_nuevo"] == "Producción (gemini) …WXYZ" and b["motivo"] == "Clave de producción"
        assert LLAVE not in str(fake.bitacora)

    def test_nombre_repetido_es_409_sin_distinguir_mayusculas(self, cliente, fake):
        crear(cliente, nombre="Producción")
        r = cliente.post("/ia/claves", json={"proveedor": "openai", "nombre": " producción ", "llave": "sk-" + "z" * 30}, headers=H())
        assert r.status_code == 409 and "ese nombre" in r.json()["detail"] and len(fake.ia_claves) == 1

    def test_duplicado_detectado_por_la_base_tambien_es_409(self, cliente, fake):
        async def duplicado(datos):
            raise SupabaseError(409, 'duplicate key value violates unique constraint "ia_claves_nombre_unico"')
        fake.insertar_clave_ia = duplicado
        r = cliente.post("/ia/claves", json={"proveedor": "gemini", "nombre": "X", "llave": LLAVE}, headers=H())
        assert r.status_code == 409

    @pytest.mark.parametrize("cuerpo", [
        {"llave": "corta"}, {"llave": "con espacios " * 4}, {"llave": "ñ" * 30}, {"llave": " " * 40}, {"llave": "a" * 401},
        {"nombre": "  "}, {"nombre": "n" * 61}, {"proveedor": "otro"}, {"modelo": "m" * 81}, {"motivo": "m" * 201},
    ])
    def test_datos_invalidos_se_rechazan(self, cliente, fake, cuerpo):
        base = {"proveedor": "gemini", "nombre": "N", "llave": LLAVE}
        assert cliente.post("/ia/claves", json={**base, **cuerpo}, headers=H()).status_code == 422
        assert fake.ia_claves == {}

    def test_sin_clave_de_cifrado_en_el_servidor_no_guarda(self, client, fake):
        r = client.post("/ia/claves", json={"proveedor": "gemini", "nombre": "N", "llave": LLAVE}, headers=H())
        assert r.status_code == 503 and "ROSTRO_CLAVE_AES" in r.json()["detail"] and fake.ia_claves == {}

    def test_solo_administradores(self, cliente):
        cuerpo = {"proveedor": "gemini", "nombre": "N", "llave": LLAVE}
        usuario = {"Authorization": "Bearer token-usuario"}
        assert cliente.post("/ia/claves", json=cuerpo).status_code in (401, 403)
        assert cliente.post("/ia/claves", json=cuerpo, headers=usuario).status_code == 403
        assert cliente.get("/ia/claves", headers=usuario).status_code == 403
        assert cliente.patch("/ia/claves/x", json={"nombre": "Y"}, headers=usuario).status_code == 403
        assert cliente.delete("/ia/claves/x", headers=usuario).status_code == 403
        assert cliente.post("/ia/claves/x/probar", json={}, headers=usuario).status_code == 403

    def test_error_de_base_es_502_sin_filtrar_la_llave(self, cliente, fake):
        async def falla(datos):
            raise SupabaseError(500, "boom")
        fake.insertar_clave_ia = falla
        r = cliente.post("/ia/claves", json={"proveedor": "gemini", "nombre": "N", "llave": LLAVE}, headers=H())
        assert r.status_code == 502 and LLAVE not in r.text

    def test_si_falla_la_activacion_la_clave_queda_guardada_inactiva_y_lo_dice(self, cliente, fake):
        async def falla(clave_id, usuario_id):
            raise SupabaseError(500, "boom")
        fake.activar_clave_ia = falla
        r = cliente.post("/ia/claves", json={"proveedor": "gemini", "nombre": "N", "llave": LLAVE, "activar": True}, headers=H())
        assert r.status_code == 502 and "quedó guardada, pero inactiva" in r.json()["detail"]
        assert len(fake.ia_claves) == 1 and not any(f["activa"] for f in fake.ia_claves.values())


# ------------------------------------------------------------------ listar
class TestListar:
    def test_lista_con_la_activa_primero_y_sin_mostrar_llaves(self, cliente, fake):
        crear(cliente, nombre="Pruebas")
        b = crear(cliente, "anthropic", "Producción", LLAVE_B, activar=True)
        d = cliente.get("/ia/claves", headers=H()).json()
        assert d["puede_guardar_llaves"] is True and d["activa_ilegible"] is False
        assert [c["nombre"] for c in d["claves"]] == ["Producción", "Pruebas"] and d["claves"][0]["activa"] is True
        assert [p["id"] for p in d["proveedores"]] == ["gemini", "anthropic", "openai"]
        assert d["en_uso"] == {"origen": "panel", "nombre": "Producción", "proveedor": "anthropic", "proveedor_nombre": "Claude (Anthropic)",
                               "modelo": MODELO_ANTHROPIC}
        assert b["id"] == d["claves"][0]["id"]
        assert LLAVE not in str(d) and LLAVE_B not in str(d) and "llave_cifrada" not in str(d)

    def test_en_uso_muestra_el_modelo_guardado(self, cliente):
        crear(cliente, "openai", "BOT", "sk-" + "z" * 30, modelo="gpt-x", activar=True)
        assert cliente.get("/ia/claves", headers=H()).json()["en_uso"]["modelo"] == "gpt-x"

    def test_sin_activa_se_usa_la_del_servidor_y_se_dice(self, client):
        client.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes=CLAVE, ia_proveedor="gemini", gemini_api_key="env", ia_modelo="gm")
        d = client.get("/ia/claves", headers=H()).json()
        assert d["claves"] == [] and d["en_uso"] == {"origen": "servidor", "nombre": None, "proveedor": "gemini",
                                                     "proveedor_nombre": "Gemini (Google)", "modelo": "gm"}

    def test_sin_nada_no_hay_ia_en_uso(self, client):
        d = client.get("/ia/claves", headers=H()).json()
        assert d["en_uso"] is None and d["puede_guardar_llaves"] is False and d["claves"] == []

    def test_clave_activa_que_no_abre_avisa_y_cae_al_servidor(self, cliente, fake):
        crear(cliente, nombre="A", activar=True)
        cliente.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes="cd" * 32)
        d = cliente.get("/ia/claves", headers=H()).json()
        assert d["activa_ilegible"] is True and d["en_uso"] is None
        cliente.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes="cd" * 32, anthropic_api_key="sk-env")
        d = cliente.get("/ia/claves", headers=H()).json()
        assert d["activa_ilegible"] is True and d["en_uso"]["origen"] == "servidor"

    def test_error_de_base_es_502(self, cliente, fake):
        async def falla():
            raise SupabaseError(500, "boom")
        fake.claves_ia = falla
        assert cliente.get("/ia/claves", headers=H()).status_code == 502


# ------------------------------------------------------------------ editar
class TestEditar:
    def test_cambia_nombre_y_modelo_y_lo_anota(self, cliente, fake):
        d = crear(cliente)
        r = cliente.patch(f"/ia/claves/{d['id']}", json={"nombre": "BOT", "modelo": "gemini-2.5-pro", "motivo": "ajuste"}, headers=H())
        assert r.status_code == 200 and r.json()["clave"]["nombre"] == "BOT" and r.json()["clave"]["modelo"] == "gemini-2.5-pro"
        cambios = [(b["campo"], b["valor_anterior"], b["valor_nuevo"], b["motivo"]) for b in fake.bitacora if b["evento"] == "actualizar"]
        assert cambios == [("nombre", "Producción", "BOT", "ajuste"), ("modelo", None, "gemini-2.5-pro", "ajuste")]
        assert fake.ia_claves[d["id"]]["updated_by"] == ADMIN_ID

    def test_modelo_vacio_o_nulo_vuelve_al_recomendado_y_si_no_se_envia_no_cambia(self, cliente, fake):
        d = crear(cliente, modelo="gemini-2.5-pro")
        cliente.patch(f"/ia/claves/{d['id']}", json={"nombre": "Otro"}, headers=H())
        assert fake.ia_claves[d["id"]]["modelo"] == "gemini-2.5-pro"
        cliente.patch(f"/ia/claves/{d['id']}", json={"modelo": ""}, headers=H())
        assert fake.ia_claves[d["id"]]["modelo"] is None
        cliente.patch(f"/ia/claves/{d['id']}", json={"modelo": "x"}, headers=H())
        cliente.patch(f"/ia/claves/{d['id']}", json={"modelo": None}, headers=H())
        assert fake.ia_claves[d["id"]]["modelo"] is None

    def test_rotar_la_llave_la_cifra_y_anota_solo_los_ultimos_4(self, cliente, fake):
        d = crear(cliente)
        r = cliente.patch(f"/ia/claves/{d['id']}", json={"llave": "n" * 30 + "4321"}, headers=H())
        assert r.json()["clave"]["ultimos_4"] == "4321" and "n" * 30 not in r.text
        fila = fake.ia_claves[d["id"]]
        assert llave_de_clave(fila, ajustes(rostro_clave_aes=CLAVE)) == "n" * 30 + "4321"
        assert (fake.bitacora[-1]["campo"], fake.bitacora[-1]["valor_anterior"], fake.bitacora[-1]["valor_nuevo"]) == ("llave", "…WXYZ", "…4321")
        assert "n" * 30 not in str(fake.bitacora)

    def test_sin_llave_en_el_cuerpo_se_conserva(self, cliente, fake):
        d = crear(cliente)
        antes = fake.ia_claves[d["id"]]["llave_cifrada"]
        cliente.patch(f"/ia/claves/{d['id']}", json={"nombre": "Otro"}, headers=H())
        assert fake.ia_claves[d["id"]]["llave_cifrada"] == antes

    def test_activar_desactiva_la_anterior(self, cliente, fake):
        a = crear(cliente, nombre="A", activar=True)
        b = crear(cliente, "openai", "B", "sk-" + "z" * 30)
        r = cliente.patch(f"/ia/claves/{b['id']}", json={"activa": True, "motivo": "cambio de proveedor"}, headers=H())
        assert r.status_code == 200 and r.json()["clave"]["activa"] is True
        assert fake.ia_claves[a["id"]]["activa"] is False and fake.ia_claves[b["id"]]["activa"] is True
        ev = [(x["evento"], x["entidad_id"], x["motivo"]) for x in fake.bitacora[-2:]]
        assert ev == [("desactivar", a["id"], "Reemplazada por «B»"), ("activar", b["id"], "cambio de proveedor")]

    def test_no_se_puede_desactivar_la_unica_activa(self, cliente, fake):
        a = crear(cliente, activar=True)
        r = cliente.patch(f"/ia/claves/{a['id']}", json={"activa": False}, headers=H())
        assert r.status_code == 409 and "activa otra" in r.json()["detail"] and fake.ia_claves[a["id"]]["activa"] is True

    def test_activar_la_que_ya_esta_activa_no_hace_nada(self, cliente, fake):
        a = crear(cliente, activar=True)
        n = len(fake.bitacora)
        r = cliente.patch(f"/ia/claves/{a['id']}", json={"activa": True}, headers=H())
        assert r.json()["mensaje"] == "Sin cambios" and len(fake.bitacora) == n

    def test_el_proveedor_no_cambia(self, cliente, fake):
        d = crear(cliente)
        cliente.patch(f"/ia/claves/{d['id']}", json={"proveedor": "openai", "nombre": "X"}, headers=H())
        assert fake.ia_claves[d["id"]]["proveedor"] == "gemini"

    def test_nombre_repetido_es_409_pero_el_propio_se_puede_repetir(self, cliente, fake):
        a = crear(cliente, nombre="A")
        b = crear(cliente, "openai", "B", "sk-" + "z" * 30)
        assert cliente.patch(f"/ia/claves/{b['id']}", json={"nombre": "a"}, headers=H()).status_code == 409
        assert cliente.patch(f"/ia/claves/{a['id']}", json={"nombre": "A"}, headers=H()).json()["mensaje"] == "Sin cambios"

    def test_sin_cambios(self, cliente, fake):
        d = crear(cliente)
        n = len(fake.bitacora)
        assert cliente.patch(f"/ia/claves/{d['id']}", json={}, headers=H()).json()["mensaje"] == "Sin cambios"
        assert len(fake.bitacora) == n

    def test_clave_inexistente_es_404(self, cliente):
        assert cliente.patch("/ia/claves/no-existe", json={"nombre": "X"}, headers=H()).status_code == 404

    @pytest.mark.parametrize("cuerpo", [{"llave": "corta"}, {"nombre": ""}, {"modelo": "m" * 81}])
    def test_datos_invalidos_son_422(self, cliente, cuerpo):
        d = crear(cliente)
        assert cliente.patch(f"/ia/claves/{d['id']}", json=cuerpo, headers=H()).status_code == 422

    def test_sin_clave_de_cifrado_no_rota_la_llave(self, client, fake):
        d = crear_con(client, fake)
        client.app.dependency_overrides[get_settings] = lambda: ajustes()
        assert client.patch(f"/ia/claves/{d}", json={"llave": LLAVE_B}, headers=H()).status_code == 503

    def test_error_de_base_es_502(self, cliente, fake):
        d = crear(cliente)

        async def falla(clave_id, datos):
            raise SupabaseError(500, "boom")
        fake.actualizar_clave_ia = falla
        assert cliente.patch(f"/ia/claves/{d['id']}", json={"nombre": "X"}, headers=H()).status_code == 502


def crear_con(client, fake):
    client.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes=CLAVE)
    return crear(client)["id"]


# ------------------------------------------------------------------ eliminar
class TestEliminar:
    def test_elimina_una_inactiva_y_lo_anota(self, cliente, fake):
        crear(cliente, nombre="A", activar=True)
        b = crear(cliente, "openai", "B", "sk-" + "z" * 30)
        r = cliente.delete(f"/ia/claves/{b['id']}", headers=H())
        assert r.status_code == 200 and "«B»" in r.json()["mensaje"] and b["id"] not in fake.ia_claves
        assert fake.bitacora[-1]["motivo"] == "Clave eliminada" and fake.bitacora[-1]["valor_nuevo"] is None
        assert fake.bitacora[-1]["valor_anterior"] == "B (openai) …zzzz" and "z" * 30 not in str(fake.bitacora)

    def test_la_activa_no_se_elimina(self, cliente, fake):
        a = crear(cliente, activar=True)
        r = cliente.delete(f"/ia/claves/{a['id']}", headers=H())
        assert r.status_code == 409 and "activa otra" in r.json()["detail"] and a["id"] in fake.ia_claves

    def test_inexistente_es_404(self, cliente):
        assert cliente.delete("/ia/claves/no-existe", headers=H()).status_code == 404


# ------------------------------------------------------------------ qué cliente se usa
def test_llave_de_clave_abre_la_llave_solo_con_su_clave_de_cifrado(cliente, fake):
    d = crear(cliente)
    fila = fake.ia_claves[d["id"]]
    assert llave_de_clave(fila, ajustes(rostro_clave_aes=CLAVE)) == LLAVE
    assert llave_de_clave(fila, ajustes(rostro_clave_aes="cd" * 32)) is None
    assert llave_de_clave(fila, ajustes()) is None
    assert llave_de_clave({"proveedor": "gemini"}, ajustes(rostro_clave_aes=CLAVE)) is None
    assert llave_de_clave({**fila, "proveedor": "openai"}, ajustes(rostro_clave_aes=CLAVE)) is None     # otro contexto


def test_llaves_de_entorno_por_proveedor():
    cfg = ajustes(gemini_api_key="g", anthropic_api_key="a", openai_api_key="o")
    assert [llave_de_entorno(cfg, p) for p in ("gemini", "anthropic", "openai", "otro")] == ["g", "a", "o", None]
    assert llave_de_entorno(ajustes(openai_api_key=""), "openai") is None


def test_crear_cliente_de_elige_la_clase_y_el_modelo():
    assert crear_cliente_de("gemini", None, None, 20) is None
    assert crear_cliente_de("otro", "k", None, 20) is None
    g = crear_cliente_de("gemini", "k", "  ", 20)
    assert isinstance(g, ClienteGemini) and g._modelo == MODELO_GEMINI
    a = crear_cliente_de("anthropic", "k", "claude-x", 20)
    assert isinstance(a, ClienteIA) and a._modelo == "claude-x"
    o = crear_cliente_de("openai", "k", None, 20)
    assert isinstance(o, ClienteOpenAI) and o._modelo == MODELO_OPENAI


def _cliente_de_get_ia(fake, cfg):
    async def usar():
        gen = get_ia(fake, cfg)
        c = await gen.__anext__()
        cerrado = None
        if c is not None:
            await gen.aclose()
            cerrado = c._http.is_closed
        return c, cerrado
    return correr(usar())


def test_get_ia_usa_la_clave_activa_con_su_proveedor_modelo_y_llave(cliente, fake):
    crear(cliente, nombre="A", activar=True)
    b = crear(cliente, "anthropic", "B", LLAVE_B, modelo="claude-x", activar=True)
    c, cerrado = _cliente_de_get_ia(fake, ajustes(rostro_clave_aes=CLAVE, gemini_api_key="env"))
    assert isinstance(c, ClienteIA) and c._modelo == "claude-x" and c._headers["x-api-key"] == LLAVE_B and cerrado is True
    assert b["activa"] is True


def test_get_ia_sin_activa_usa_el_env_y_sin_nada_no_hay_ia(cliente, fake):
    crear(cliente, nombre="A")                                                 # guardada pero inactiva: no cuenta
    c, _ = _cliente_de_get_ia(fake, ajustes(rostro_clave_aes=CLAVE, ia_proveedor="gemini", gemini_api_key="env"))
    assert isinstance(c, ClienteGemini) and c._headers["x-goog-api-key"] == "env"
    assert _cliente_de_get_ia(fake, ajustes(rostro_clave_aes=CLAVE))[0] is None


def test_get_ia_con_la_activa_ilegible_cae_al_env(cliente, fake):
    crear(cliente, nombre="A", activar=True)
    c, _ = _cliente_de_get_ia(fake, ajustes(rostro_clave_aes="cd" * 32, ia_proveedor="anthropic", anthropic_api_key="sk-env"))
    assert isinstance(c, ClienteIA) and c._headers["x-api-key"] == "sk-env"


def test_get_ia_si_la_base_falla_usa_el_env(fake):
    async def cae():
        raise SupabaseError(500, "caído")
    fake.clave_ia_activa = cae
    c, _ = _cliente_de_get_ia(fake, ajustes(ia_proveedor="gemini", gemini_api_key="env"))
    assert isinstance(c, ClienteGemini)


# ------------------------------------------------------------------ probar conexión
def _con_transporte(monkeypatch, handler):
    """Hace que los clientes que crea la ruta usen un transporte simulado."""
    import app.ia as ia
    originales = (ia.ClienteGemini.__init__, ia.ClienteIA.__init__, ia.ClienteOpenAI.__init__)

    def envolver(init):
        def nuevo(self, api_key, modelo, timeout=20, transport=None):
            init(self, api_key, modelo, timeout, httpx.MockTransport(handler))
        return nuevo
    monkeypatch.setattr(ia.ClienteGemini, "__init__", envolver(originales[0]))
    monkeypatch.setattr(ia.ClienteIA, "__init__", envolver(originales[1]))
    monkeypatch.setattr(ia.ClienteOpenAI, "__init__", envolver(originales[2]))


OK_GEMINI = {"candidates": [{"content": {"parts": [{"text": '{"fuera_de_tema": false, "accion": "cerrar", "respuesta": "Gracias.", '
                                                              '"clasificacion": "aceptable", "confianza": 0.9, "resumen": "Tráfico."}'}]}}]}


OK_OPENAI = {"choices": [{"message": {"content": '{"fuera_de_tema": false, "accion": "cerrar", "respuesta": "Gracias.", '
                                                 '"clasificacion": "aceptable", "confianza": 0.9, "resumen": "Tráfico."}'}}]}


class TestClienteOpenAI:
    CASO = {"tipo": "fuera_horario", "detalle": "d", "fecha": None}
    MSG = [{"emisor": "usuario", "contenido": "Llegué tarde por el tráfico."}]

    def _evaluar(self, handler):
        async def go():
            c = ClienteOpenAI("sk-prueba", "gpt-x", transport=httpx.MockTransport(handler))
            try:
                return await c.evaluar(self.CASO, self.MSG, True)
            finally:
                await c.aclose()
        return correr(go())

    def test_envia_modo_json_sin_temperature_y_lee_la_evaluacion(self):
        vistos = []

        def handler(req):
            vistos.append(req)
            return httpx.Response(200, json=OK_OPENAI)
        ev = self._evaluar(handler)
        assert ev.accion == "cerrar" and ev.clasificacion == "aceptable" and ev.confianza == 0.9
        cuerpo = __import__("json").loads(vistos[0].content)
        assert vistos[0].url.host == "api.openai.com" and vistos[0].headers["authorization"] == "Bearer sk-prueba"
        assert cuerpo["model"] == "gpt-x" and cuerpo["response_format"] == {"type": "json_object"}
        assert "temperature" not in cuerpo and cuerpo["max_completion_tokens"] >= 1000
        assert cuerpo["messages"][0]["role"] == "system" and "JSON" in cuerpo["messages"][0]["content"]
        assert cuerpo["messages"][1] == {"role": "user", "content": "Llegué tarde por el tráfico."}

    @pytest.mark.parametrize("codigo", [401, 404, 429, 500])
    def test_errores_http_llevan_el_codigo_sin_el_cuerpo(self, codigo):
        with pytest.raises(IAError) as e:
            self._evaluar(lambda req: httpx.Response(codigo, json={"error": {"message": "secreto-sk-prueba"}}))
        assert e.value.status == codigo and "secreto" not in str(e.value)

    @pytest.mark.parametrize("cuerpo", [{"choices": []}, {"choices": [{"message": {"content": None}}]}, {"x": 1},
                                        {"choices": [{"message": {"content": "no es json"}}]}])
    def test_respuestas_inutilizables_son_ia_error(self, cuerpo):
        with pytest.raises(IAError):
            self._evaluar(lambda req: httpx.Response(200, json=cuerpo))

    def test_sin_conexion_es_ia_error(self):
        def cae(req):
            raise httpx.ConnectError("sin red")
        with pytest.raises(IAError, match="No se pudo contactar"):
            self._evaluar(cae)


class TestProbar:
    def test_prueba_con_la_llave_y_el_modelo_guardados(self, cliente, monkeypatch):
        vistos = []

        def handler(req):
            vistos.append(req)
            return httpx.Response(200, json=OK_GEMINI)
        _con_transporte(monkeypatch, handler)
        d = crear(cliente, modelo="gemini-guardado")
        r = cliente.post(f"/ia/claves/{d['id']}/probar", json={}, headers=H())
        assert r.json() == {"ok": True, "mensaje": "Conexión correcta con Gemini (Google) (modelo gemini-guardado)."}
        assert vistos[0].url.path.endswith("/models/gemini-guardado:generateContent") and vistos[0].headers["x-goog-api-key"] == LLAVE

    def test_un_modelo_escrito_manda_sobre_el_guardado_sin_guardarlo(self, cliente, fake, monkeypatch):
        _con_transporte(monkeypatch, lambda req: httpx.Response(200, json=OK_GEMINI))
        d = crear(cliente, modelo="gemini-guardado")
        m = cliente.post(f"/ia/claves/{d['id']}/probar", json={"modelo": "gemini-2.5-pro"}, headers=H()).json()["mensaje"]
        assert "gemini-2.5-pro" in m and fake.ia_claves[d["id"]]["modelo"] == "gemini-guardado"

    def test_sin_modelo_usa_el_recomendado_del_proveedor(self, cliente, monkeypatch):
        _con_transporte(monkeypatch, lambda req: httpx.Response(200, json=OK_GEMINI))
        d = crear(cliente)
        assert MODELO_GEMINI in cliente.post(f"/ia/claves/{d['id']}/probar", json={}, headers=H()).json()["mensaje"]

    def test_prueba_openai_con_su_llave_y_su_modelo(self, cliente, monkeypatch):
        vistos = []

        def handler(req):
            vistos.append(req)
            return httpx.Response(200, json=OK_OPENAI)
        _con_transporte(monkeypatch, handler)
        d = crear(cliente, "openai", "BOT", "sk-" + "x" * 30, modelo="gpt-x")
        r = cliente.post(f"/ia/claves/{d['id']}/probar", json={}, headers=H()).json()
        assert r == {"ok": True, "mensaje": "Conexión correcta con OpenAI (modelo gpt-x)."}
        assert vistos[0].headers["authorization"] == "Bearer sk-" + "x" * 30

    @pytest.mark.parametrize("codigo,texto", [(401, "llave no es válida"), (403, "llave no es válida"), (404, "modelo no existe"),
                                              (400, "modelo no existe"), (429, "límite")])
    def test_errores_del_proveedor_se_explican_sin_filtrar_la_llave(self, cliente, monkeypatch, codigo, texto):
        _con_transporte(monkeypatch, lambda req: httpx.Response(codigo, json={"error": {"message": f"detalle con {LLAVE}"}}))
        d = crear(cliente)
        r = cliente.post(f"/ia/claves/{d['id']}/probar", json={}, headers=H())
        assert r.status_code == 200 and r.json()["ok"] is False and texto in r.json()["mensaje"] and LLAVE not in r.text

    def test_llave_que_no_abre_lo_dice(self, cliente):
        d = crear(cliente)
        cliente.app.dependency_overrides[get_settings] = lambda: ajustes(rostro_clave_aes="cd" * 32)
        r = cliente.post(f"/ia/claves/{d['id']}/probar", json={}, headers=H()).json()
        assert r["ok"] is False and "ROSTRO_CLAVE_AES" in r["mensaje"]

    def test_clave_inexistente_es_404_y_modelo_largo_422(self, cliente):
        assert cliente.post("/ia/claves/no-existe/probar", json={}, headers=H()).status_code == 404
        d = crear(cliente)
        assert cliente.post(f"/ia/claves/{d['id']}/probar", json={"modelo": "m" * 81}, headers=H()).status_code == 422


# ------------------------------------------------------------------ de punta a punta: el chat usa la clave activa
def test_el_chat_usa_el_proveedor_el_modelo_y_la_llave_de_la_clave_activa(cliente, fake, monkeypatch, personas):
    cliente.app.dependency_overrides.pop(get_ia)                 # sin el reemplazo de las pruebas: se arma de verdad
    crear(cliente, nombre="Gemini", modelo="gemini-del-panel", activar=True)
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=OK_GEMINI)
    _con_transporte(monkeypatch, handler)
    r = justificar(cliente, anomalia(fake, 1))
    assert r.status_code == 200
    assert len(vistos) == 1 and vistos[0].url.path.endswith("/models/gemini-del-panel:generateContent")
    assert vistos[0].headers["x-goog-api-key"] == LLAVE


def test_al_activar_otra_clave_el_chat_cambia_de_proveedor(cliente, fake, monkeypatch, personas):
    cliente.app.dependency_overrides.pop(get_ia)
    a = crear(cliente, nombre="Gemini", activar=True)
    b = crear(cliente, "openai", "BOT", "sk-" + "x" * 30, modelo="gpt-x")
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=OK_GEMINI if "googleapis" in str(req.url) else OK_OPENAI)
    _con_transporte(monkeypatch, handler)
    justificar(cliente, anomalia(fake, 1))
    cliente.patch(f"/ia/claves/{b['id']}", json={"activa": True}, headers=H())
    justificar(cliente, anomalia(fake, 2))
    assert [v.url.host for v in vistos] == ["generativelanguage.googleapis.com", "api.openai.com"]
    assert a["id"] != b["id"] and vistos[1].headers["authorization"] == "Bearer sk-" + "x" * 30
