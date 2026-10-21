"""Chat de justificación con IA: reglas (`chat_ia`), cliente del modelo (`ia`) y el endpoint completo."""
import asyncio
import json

import httpx
import pytest

from app import chat_ia
from app.chat_ia import CIERRE_FUERA_DE_TEMA, CIERRE_SIN_RESPUESTA, RESPUESTA_FUERA_DE_TEMA, planificar
from app.config import Settings
from app.ia import (
    ClienteGemini, ClienteIA, Evaluacion, IAError, MODELO_ANTHROPIC, MODELO_GEMINI, armar_mensajes, crear_cliente, instrucciones,
    leer_evaluacion,
)
from tests.test_anomalias import H, OTRO, TEXTO, UID, anomalia, justificar  # noqa: F401  (fixture `personas`)
from tests.test_anomalias import personas  # noqa: F401

PREGUNTA = "¿A qué hora ocurrió y avisaste a tu jefe?"


def ev(accion="cerrar", respuesta="Gracias, enviaré tu explicación a Talento Humano.", fuera=False,
       clasificacion="aceptable", confianza=0.95, resumen="La persona dice que se cayó el internet."):
    return Evaluacion(fuera, accion, respuesta, clasificacion, confianza, resumen)


def msgs(*pares):
    return [{"emisor": e, "contenido": c, "created_at": f"t{i}"} for i, (e, c) in enumerate(pares)]


def plan(evaluacion, mensajes, tipo="sin_salida", **kw):
    base = dict(max_mensajes=3, max_preguntas=1, autoaprobar=True, umbral=0.9)
    return planificar(evaluacion, mensajes, tipo, **{**base, **kw})


# ------------------------------------------------------------------ reglas
class TestReglas:
    def test_primera_explicacion_ambigua_se_repregunta(self):
        p = plan(ev("preguntar", PREGUNTA, clasificacion=None, confianza=None, resumen=None), msgs(("usuario", TEXTO)))
        assert p.accion == "preguntar" and p.respuesta == PREGUNTA and not p.auto_aprobar

    def test_solo_una_repregunta_aunque_el_modelo_insista(self):
        m = msgs(("usuario", TEXTO), ("asistente", PREGUNTA), ("usuario", "A las ocho, sí avisé"))
        p = plan(ev("preguntar", "¿Y quién te autorizó?"), m)
        assert p.accion == "cerrar" and p.clasificacion == "aceptable"

    def test_a_los_tres_mensajes_se_cierra_siempre(self):
        m = msgs(("usuario", "uno uno uno uno"), ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", "dos"),
                 ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", "tres"))
        assert plan(ev("preguntar", "otra cosa más"), m).accion == "cerrar"

    def test_sin_texto_de_respuesta_cierra_con_el_aviso_de_siempre(self):
        p = plan(ev("preguntar", ""), msgs(("usuario", TEXTO)))
        assert p.accion == "cerrar" and p.respuesta == CIERRE_SIN_RESPUESTA

    def test_fuera_de_tema_responde_siempre_el_aviso_fijo_y_no_lo_que_diga_el_modelo(self):
        p = plan(ev("preguntar", "¡1 + 1 es 2!", fuera=True), msgs(("usuario", "¿cuánto es 1+1?")))
        assert p.accion == "preguntar" and p.respuesta == RESPUESTA_FUERA_DE_TEMA and p.clasificacion is None

    def test_dos_veces_fuera_de_tema_seguidas_cierran_el_chat(self):
        m = msgs(("usuario", "¿cuánto es 1+1?"), ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", "cuéntame un chiste"))
        p = plan(ev(fuera=True), m)
        assert p.accion == "cerrar" and p.respuesta == CIERRE_FUERA_DE_TEMA and not p.auto_aprobar

    def test_un_tema_ajeno_suelto_no_cierra_y_luego_se_puede_seguir(self):
        m = msgs(("usuario", "¿cuánto es 1+1?"), ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", TEXTO))
        assert avisos(m) == 1
        assert plan(ev("preguntar", PREGUNTA), m).accion == "preguntar"

    def test_el_conteo_de_avisos_seguidos_se_reinicia_con_una_respuesta_normal(self):
        m = msgs(("usuario", "x"), ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", TEXTO), ("asistente", PREGUNTA),
                 ("usuario", "otra cosa"))
        assert avisos(m) == 0
        assert plan(ev(fuera=True), m, max_mensajes=5).accion == "preguntar"     # solo el segundo aviso seguido cierra

    def test_los_tres_mensajes_tambien_cuentan_los_de_fuera_de_tema(self):
        m = msgs(("usuario", TEXTO), ("asistente", PREGUNTA), ("usuario", "hola"), ("asistente", RESPUESTA_FUERA_DE_TEMA),
                 ("usuario", "chiste"))
        assert plan(ev(fuera=True), m).respuesta == CIERRE_FUERA_DE_TEMA


def avisos(m):
    return chat_ia.avisos_seguidos_fuera_de_tema(m)


class TestAutoaprobacion:
    M = msgs(("usuario", TEXTO))

    @pytest.mark.parametrize("tipo", sorted(chat_ia.TIPOS_AUTOAPROBABLES))
    def test_aprueba_sola_una_falta_menor_clara(self, tipo):
        assert plan(ev(), self.M, tipo=tipo).auto_aprobar is True

    @pytest.mark.parametrize("tipo", ["fuera_geocerca", "desplazamiento_inusual", "verificacion_fallida", "dia_no_laborable",
                                      "uso_recurrente_web", "duplicada", "sin_ingreso"])
    def test_las_faltas_de_mas_riesgo_siempre_las_revisa_una_persona(self, tipo):
        p = plan(ev(), self.M, tipo=tipo)
        assert p.accion == "cerrar" and p.auto_aprobar is False and p.clasificacion == "aceptable"

    @pytest.mark.parametrize("clasificacion", ["requiere_revision", "sospechosa", None])
    def test_solo_la_clasificacion_aceptable(self, clasificacion):
        assert plan(ev(clasificacion=clasificacion), self.M).auto_aprobar is False

    @pytest.mark.parametrize("confianza,esperado", [(0.89, False), (0.9, True), (1.0, True), (None, False)])
    def test_exige_confianza_minima(self, confianza, esperado):
        assert plan(ev(confianza=confianza), self.M).auto_aprobar is esperado

    def test_apagada_por_configuracion_nunca_aprueba(self):
        assert plan(ev(), self.M, autoaprobar=False).auto_aprobar is False

    def test_si_hubo_temas_ajenos_en_la_conversacion_no_se_aprueba_sola(self):
        m = msgs(("usuario", "¿cuánto es 1+1?"), ("asistente", RESPUESTA_FUERA_DE_TEMA), ("usuario", TEXTO))
        assert plan(ev(), m).auto_aprobar is False

    def test_el_umbral_es_el_de_la_configuracion(self):
        assert plan(ev(confianza=0.95), self.M, umbral=0.99).auto_aprobar is False


def test_sin_ia_o_si_falla_el_caso_pasa_a_revision_sin_clasificar():
    assert chat_ia.plan_sin_ia().accion == "cerrar" and chat_ia.plan_sin_ia().respuesta is None
    p = chat_ia.plan_por_fallo_de_ia()
    assert p.accion == "cerrar" and p.respuesta == CIERRE_SIN_RESPUESTA and not p.auto_aprobar and p.clasificacion is None


# ------------------------------------------------------------------ cliente del modelo
def cliente(manejador):
    return ClienteIA("sk-prueba", "modelo-x", transport=httpx.MockTransport(manejador))


def respuesta_api(entrada, **kw):
    return httpx.Response(200, json={"content": [{"type": "text", "text": "hola"}, {"type": "tool_use", "name": "evaluar_justificacion", "input": entrada}]}, **kw)


CASO = {"tipo": "sin_salida", "detalle": "Falta la salida del 19 oct", "fecha": "2026-10-19T22:00:00+00:00"}


def test_el_cliente_envia_la_conversacion_con_la_herramienta_forzada_y_lee_el_resultado():
    visto = {}

    def manejador(req: httpx.Request):
        visto["cabeceras"], visto["cuerpo"] = req.headers, json.loads(req.content)
        return respuesta_api({"fuera_de_tema": False, "accion": "cerrar", "respuesta": " Listo. ", "clasificacion": "aceptable",
                              "confianza": 0.93, "resumen": "Se cayó el internet."})

    r = asyncio.run(cliente(manejador).evaluar(CASO, msgs(("usuario", TEXTO)), ultima=False))
    assert r == Evaluacion(False, "cerrar", "Listo.", "aceptable", 0.93, "Se cayó el internet.")
    c = visto["cuerpo"]
    assert visto["cabeceras"]["x-api-key"] == "sk-prueba" and visto["cabeceras"]["anthropic-version"]
    assert c["model"] == "modelo-x" and c["tool_choice"] == {"type": "tool", "name": "evaluar_justificacion"}
    assert c["messages"] == [{"role": "user", "content": TEXTO}]
    # Lo que escribe la persona va como mensaje de usuario, nunca dentro de las instrucciones.
    assert TEXTO not in c["system"] and "Falta la salida del 19 oct" in c["system"]


def test_la_ultima_oportunidad_se_le_avisa_al_modelo():
    visto = []
    c = cliente(lambda req: (visto.append(json.loads(req.content)["system"]), respuesta_api({"fuera_de_tema": False, "accion": "cerrar", "respuesta": "ok"}))[1])
    asyncio.run(c.evaluar(CASO, msgs(("usuario", TEXTO)), ultima=True))
    asyncio.run(c.evaluar(CASO, msgs(("usuario", TEXTO)), ultima=False))
    assert "ÚLTIMA oportunidad" in visto[0] and "ÚLTIMA oportunidad" not in visto[1]


@pytest.mark.parametrize("respuesta", [
    httpx.Response(500, json={"error": "x"}), httpx.Response(429, text="límite"),
    httpx.Response(200, text="no es json"), httpx.Response(200, json={"content": [{"type": "text", "text": "hola"}]}),
    httpx.Response(200, json={"content": [{"type": "tool_use", "input": "texto"}]}),
    httpx.Response(200, json={"content": [{"type": "tool_use", "input": {"accion": "otra"}}]}),
])
def test_cualquier_respuesta_inutilizable_es_un_IAError(respuesta):
    with pytest.raises(IAError):
        asyncio.run(cliente(lambda req: respuesta).evaluar(CASO, msgs(("usuario", TEXTO)), ultima=False))


def test_si_no_hay_conexion_es_un_IAError_y_no_filtra_detalles():
    def cae(req):
        raise httpx.ConnectError("no hay red sk-prueba")
    with pytest.raises(IAError) as e:
        asyncio.run(cliente(cae).evaluar(CASO, msgs(("usuario", TEXTO)), ultima=False))
    assert "sk-prueba" not in str(e.value)


def test_leer_evaluacion_limpia_lo_que_diga_el_modelo():
    r = leer_evaluacion({"fuera_de_tema": "sí", "accion": "cerrar", "respuesta": "x" * 900, "clasificacion": "inventada",
                         "confianza": 7, "resumen": "   "})
    assert r.fuera_de_tema is False and len(r.respuesta) == 400
    assert r.clasificacion is None and r.confianza == 1.0 and r.resumen is None
    assert leer_evaluacion({"accion": "preguntar", "respuesta": "?", "confianza": True}).confianza is None
    assert leer_evaluacion({"accion": "cerrar", "respuesta": "", "confianza": -2}).confianza == 0.0


def test_armar_mensajes_alterna_roles_y_empieza_por_la_persona():
    m = msgs(("asistente", "hola"), ("usuario", "a"), ("usuario", "b"), ("asistente", "c"), ("usuario", "d"))
    assert armar_mensajes(m) == [{"role": "user", "content": "a\nb"}, {"role": "assistant", "content": "c"}, {"role": "user", "content": "d"}]


def test_las_instrucciones_fijan_los_limites():
    t = instrucciones(CASO, ultima=False)
    for frase in ("UNA sola pregunta", "fuera_de_tema=true", "Nunca prometas", "texto no confiable", "Ante la duda, requiere_revision"):
        assert frase in t
    assert "no disponible" in instrucciones({"tipo": "raro"}, False) and "sin detalle" in instrucciones({"tipo": "raro"}, False)


# ------------------------------------------------------------------ Gemini
def gemini(manejador):
    return ClienteGemini("AIza-prueba", "gemini-x", transport=httpx.MockTransport(manejador))


def respuesta_gemini(texto):
    return httpx.Response(200, json={"candidates": [{"content": {"role": "model", "parts": [{"text": texto}]}}]})


JSON_GEMINI = json.dumps({"fuera_de_tema": False, "accion": "cerrar", "respuesta": " Listo. ", "clasificacion": "aceptable",
                          "confianza": 0.93, "resumen": "Se cayó el internet."})


def test_gemini_envia_la_conversacion_con_la_llave_en_cabecera_y_lee_el_json():
    visto = {}

    def manejador(req: httpx.Request):
        visto["url"], visto["cabeceras"], visto["cuerpo"] = str(req.url), req.headers, json.loads(req.content)
        return respuesta_gemini(JSON_GEMINI)

    m = msgs(("usuario", TEXTO), ("asistente", PREGUNTA), ("usuario", "Sí avisé"))
    r = asyncio.run(gemini(manejador).evaluar(CASO, m, ultima=True))
    assert r == Evaluacion(False, "cerrar", "Listo.", "aceptable", 0.93, "Se cayó el internet.")
    assert visto["url"] == "https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent"
    assert "AIza-prueba" not in visto["url"] and visto["cabeceras"]["x-goog-api-key"] == "AIza-prueba"
    c = visto["cuerpo"]
    assert [t["role"] for t in c["contents"]] == ["user", "model", "user"]
    assert c["contents"][0]["parts"][0]["text"] == TEXTO
    assert c["generationConfig"]["responseMimeType"] == "application/json"
    sistema = c["systemInstruction"]["parts"][0]["text"]
    assert TEXTO not in sistema and "ÚLTIMA oportunidad" in sistema and "FORMATO DE LA RESPUESTA" in sistema


def test_gemini_tolera_que_el_json_venga_en_un_bloque_de_codigo():
    r = asyncio.run(gemini(lambda req: respuesta_gemini("```json\n" + JSON_GEMINI + "\n```")).evaluar(CASO, msgs(("usuario", TEXTO)), False))
    assert r.clasificacion == "aceptable" and r.respuesta == "Listo."


@pytest.mark.parametrize("respuesta", [
    httpx.Response(429, json={"error": {"message": "cuota"}}), httpx.Response(403, text="llave inválida"),
    httpx.Response(200, text="no es json"), httpx.Response(200, json={"candidates": []}),
    httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}}),
    respuesta_gemini("esto no es un objeto json"), respuesta_gemini("[1, 2]"),
    respuesta_gemini(json.dumps({"accion": "otra", "respuesta": "x"})),
])
def test_gemini_cualquier_respuesta_inutilizable_es_un_IAError(respuesta):
    with pytest.raises(IAError):
        asyncio.run(gemini(lambda req: respuesta).evaluar(CASO, msgs(("usuario", TEXTO)), False))


def test_gemini_sin_conexion_no_filtra_la_llave():
    def cae(req):
        raise httpx.ConnectError("sin red AIza-prueba")
    with pytest.raises(IAError) as e:
        asyncio.run(gemini(cae).evaluar(CASO, msgs(("usuario", TEXTO)), False))
    assert "AIza-prueba" not in str(e.value)


def test_el_formato_json_solo_se_pide_a_los_proveedores_sin_herramientas():
    assert "FORMATO DE LA RESPUESTA" not in instrucciones(CASO, False)
    assert "FORMATO DE LA RESPUESTA" in instrucciones(CASO, False, formato_json=True)


def ajustes(**kw):
    return Settings(supabase_url="http://sb", supabase_service_role_key="k", **kw)


def test_crear_cliente_segun_proveedor_y_llave():
    assert crear_cliente(ajustes()) is None                                              # anthropic sin llave
    assert crear_cliente(ajustes(ia_proveedor="gemini", anthropic_api_key="sk")) is None  # eligió gemini pero solo hay llave de la otra
    assert crear_cliente(ajustes(ia_proveedor="gemini", gemini_api_key="")) is None       # llave vacía del .env
    assert isinstance(crear_cliente(ajustes(anthropic_api_key="sk")), ClienteIA)
    g = crear_cliente(ajustes(ia_proveedor="gemini", gemini_api_key="AIza"))
    assert isinstance(g, ClienteGemini) and g._modelo == MODELO_GEMINI
    assert crear_cliente(ajustes(ia_proveedor="gemini", gemini_api_key="AIza", ia_modelo="gemini-otro"))._modelo == "gemini-otro"
    assert crear_cliente(ajustes(anthropic_api_key="sk", ia_modelo=""))._modelo == MODELO_ANTHROPIC   # IA_MODELO= vacío en el .env


# ------------------------------------------------------------------ endpoint
def mensajes_guardados(fake):
    return [(m["emisor"], m["contenido"]) for m in fake.mensajes]


class TestEndpoint:
    def test_sin_llave_de_ia_funciona_como_antes_un_mensaje_y_a_revision(self, client, fake):
        a = anomalia(fake, 1)
        d = justificar(client, a).json()
        assert d["estado"] == "en_revision" and d["puede_justificar"] is False and d["decision"] is None
        assert mensajes_guardados(fake) == [("usuario", TEXTO)]

    def test_con_ia_una_explicacion_ambigua_recibe_la_repregunta_y_el_caso_sigue_abierto(self, client, fake, ia):
        a = anomalia(fake, 1)
        ia.cola.append(ev("preguntar", PREGUNTA, clasificacion=None, confianza=None, resumen=None))
        d = justificar(client, a).json()
        assert d["estado"] == "pendiente" and d["puede_justificar"] is True
        assert [(m["emisor"], m["contenido"]) for m in d["mensajes"]] == [("usuario", TEXTO), ("asistente", PREGUNTA)]
        assert not any(c[0] == "cerrar" for c in fake.llamadas)
        assert ia.llamadas[0]["caso"]["tipo"] == "sin_salida" and ia.llamadas[0]["ultima"] is False

    def test_la_respuesta_a_la_repregunta_puede_ser_corta_y_cierra_el_caso_con_lo_que_concluyo_la_ia(self, client, fake, ia):
        a = anomalia(fake, 1, tipo="fuera_geocerca")
        ia.cola += [ev("preguntar", PREGUNTA, clasificacion=None, confianza=None, resumen=None), ev(clasificacion="requiere_revision", confianza=0.6)]
        justificar(client, a)
        d = justificar(client, a, "Sí, avisé").json()
        assert d["estado"] == "en_revision" and d["puede_justificar"] is False
        j = fake.justificaciones[a["id"]]
        assert (j["clasificacion_ia"], j["confianza_ia"]) == ("requiere_revision", 0.6) and j["resumen_ia"]
        assert ia.llamadas[1]["ultima"] is True                         # ya hubo una pregunta: es la última
        assert [m["emisor"] for m in d["mensajes"]] == ["usuario", "asistente", "usuario", "asistente"]

    def test_la_primera_explicacion_no_puede_ser_corta_pero_las_respuestas_si(self, client, fake, ia):
        a = anomalia(fake, 1)
        assert justificar(client, a, "no pude").status_code == 422
        ia.cola.append(ev("preguntar", PREGUNTA))
        justificar(client, a)
        assert justificar(client, a, "x").status_code == 422 and "2 a 1000" in justificar(client, a, "x").json()["detail"]
        ia.cola.append(ev())
        assert justificar(client, a, "no").status_code == 200

    def test_aprobacion_automatica_de_una_falta_menor(self, client, fake, ia):
        a = anomalia(fake, 1, tipo="almuerzo_excedido")
        ia.cola.append(ev())
        d = justificar(client, a).json()
        assert d["estado"] == "justificada" and d["decision"] == "aprobada" and d["automatica"] is True
        assert d["puede_justificar"] is False
        assert fake.justificaciones[a["id"]]["revisado_por"] is None

    def test_una_falta_de_mas_riesgo_no_se_aprueba_sola_aunque_la_ia_este_segura(self, client, fake, ia):
        a = anomalia(fake, 1, tipo="fuera_geocerca")
        ia.cola.append(ev(clasificacion="aceptable", confianza=1.0))
        d = justificar(client, a).json()
        assert d["estado"] == "en_revision" and d["decision"] is None and d["automatica"] is False

    def test_fuera_de_tema_responde_el_aviso_fijo_y_dos_seguidos_cierran_el_chat(self, client, fake, ia):
        a = anomalia(fake, 1)
        ia.cola += [ev("preguntar", "es 2", fuera=True), ev("preguntar", "jaja", fuera=True)]
        d1 = justificar(client, a, "¿cuánto es 1 + 1?").json()
        assert d1["estado"] == "pendiente" and d1["mensajes"][-1]["contenido"] == RESPUESTA_FUERA_DE_TEMA
        d2 = justificar(client, a, "cuéntame un chiste").json()
        assert d2["estado"] == "en_revision" and d2["mensajes"][-1]["contenido"] == CIERRE_FUERA_DE_TEMA
        assert fake.justificaciones[a["id"]]["clasificacion_ia"] is None

    def test_maximo_de_tres_mensajes_de_la_persona(self, client, fake, ia):
        a = anomalia(fake, 1)
        ia.cola += [ev("preguntar", RESPUESTA_FUERA_DE_TEMA, fuera=True), ev("preguntar", PREGUNTA),
                    ev("preguntar", "¿algo más?")]
        justificar(client, a, "¿cuánto es 1 + 1?")
        justificar(client, a, "pues entonces sí me explico, se cayó el internet")
        d = justificar(client, a, "y además no había nadie para avisar").json()
        assert d["estado"] == "en_revision"                              # aunque el modelo quiso seguir preguntando
        assert sum(1 for m in d["mensajes"] if m["emisor"] == "usuario") == 3
        assert client.post(f"/anomalias/{a['id']}/justificacion", json={"texto": "cuarto mensaje"}, headers=H).status_code == 409

    def test_si_la_ia_falla_el_caso_pasa_a_revision_y_la_persona_no_pierde_su_explicacion(self, client, fake, ia):
        a = anomalia(fake, 1)
        ia.cola.append(IAError("caída"))
        d = justificar(client, a).json()
        assert d["estado"] == "en_revision"
        assert mensajes_guardados(fake) == [("usuario", TEXTO), ("asistente", CIERRE_SIN_RESPUESTA)]
        assert fake.justificaciones[a["id"]]["clasificacion_ia"] is None

    def test_si_ya_uso_sus_mensajes_y_el_caso_quedo_abierto_se_cierra_al_reintentar(self, client, fake, ia):
        a = anomalia(fake, 1)
        ia.cola += [ev("preguntar", PREGUNTA)] * 3
        justificar(client, a)
        # Simula una caída entre guardar el mensaje y cerrar: ya hay 3 mensajes de la persona y el caso sigue pendiente.
        j = fake.justificaciones[a["id"]]["id"]
        for t in ("uno", "dos"):
            fake.mensajes.append({"justificacion_id": j, "emisor": "usuario", "contenido": t, "created_at": "x"})
        d = client.post(f"/anomalias/{a['id']}/justificacion", json={"texto": "otro mensaje"}, headers=H)
        assert d.status_code == 200 and d.json()["estado"] == "en_revision"

    def test_la_persona_solo_justifica_lo_suyo_tambien_en_el_chat(self, client, fake, ia):
        a = anomalia(fake, 1, usuario=OTRO)
        assert justificar(client, a).status_code == 404 and ia.llamadas == []

    def test_no_se_llama_a_la_ia_si_el_caso_ya_no_admite_justificacion(self, client, fake, ia):
        a = anomalia(fake, 1, estado="en_revision")
        assert justificar(client, a).status_code == 409 and ia.llamadas == []

    def test_el_detalle_de_una_aprobacion_humana_no_es_automatica(self, client, fake):
        a = anomalia(fake, 1, estado="justificada")
        fake.justificaciones[a["id"]] = {"id": "j1", "decision_final": "aprobada", "comentario_admin": "ok",
                                         "fecha_decision": "x", "revisado_por": "admin-1"}
        d = client.get(f"/anomalias/{a['id']}", headers=H).json()
        assert d["decision"] == "aprobada" and d["automatica"] is False and d["comentario"] == "ok"
