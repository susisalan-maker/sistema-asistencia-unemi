"""Comprueba que el cliente arma bien las llamadas HTTP a Supabase (sin red)."""
import asyncio
import json

import httpx

from app.supabase_client import SupabaseClient, SupabaseError


def hacer(handler):
    return SupabaseClient("http://sb.test/", "SERVICE", transport=httpx.MockTransport(handler))


def test_invitar_usa_endpoint_y_redirect():
    vistos = []

    def handler(req: httpx.Request):
        vistos.append(req)
        return httpx.Response(200, json={"id": "abc"})

    r = asyncio.run(hacer(handler).invitar_por_correo("a@b.com", "http://panel/aceptar-invitacion"))
    req = vistos[0]
    assert r["id"] == "abc"
    assert req.method == "POST" and req.url.path == "/auth/v1/invite"
    assert req.url.params["redirect_to"] == "http://panel/aceptar-invitacion"
    assert json.loads(req.content) == {"email": "a@b.com"}
    assert req.headers["apikey"] == "SERVICE" and req.headers["authorization"] == "Bearer SERVICE"


def test_bloqueo_y_desbloqueo():
    cuerpos = []

    def handler(req):
        cuerpos.append((req.method, req.url.path, json.loads(req.content)))
        return httpx.Response(200, json={})

    sb = hacer(handler)
    asyncio.run(sb.bloquear_usuario_auth("u1", True))
    asyncio.run(sb.bloquear_usuario_auth("u1", False))
    assert cuerpos[0] == ("PUT", "/auth/v1/admin/users/u1", {"ban_duration": "876000h"})
    assert cuerpos[1][2] == {"ban_duration": "none"}


def test_cerrar_sesiones_llama_a_la_funcion_con_la_clave_de_servicio():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(204)

    asyncio.run(hacer(handler).cerrar_sesiones("u1"))
    req = vistos[0]
    assert req.method == "POST" and req.url.path == "/rest/v1/rpc/cerrar_sesiones_usuario"
    assert json.loads(req.content) == {"p_usuario": "u1"}
    assert req.headers["authorization"] == "Bearer SERVICE"


def test_token_invalido_devuelve_none_y_usa_el_token_del_usuario():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(401, json={"msg": "invalid JWT"})

    assert asyncio.run(hacer(handler).usuario_de_token("malo")) is None
    assert vistos[0].headers["authorization"] == "Bearer malo"  # no la service key


def test_error_de_supabase_se_convierte_en_excepcion():
    def handler(req):
        return httpx.Response(422, json={"msg": "User already registered"})

    try:
        asyncio.run(hacer(handler).invitar_por_correo("a@b.com", "x"))
        assert False, "debió fallar"
    except SupabaseError as e:
        assert e.status == 422 and "already" in e.message


def test_actualizar_usuario_inexistente():
    def handler(req):
        return httpx.Response(200, json=[])

    try:
        asyncio.run(hacer(handler).actualizar_usuario("x", {"activo": False}))
        assert False
    except SupabaseError as e:
        assert e.status == 404


def test_escrituras_de_sedes_envian_updated_by_siempre():
    """Sin sesión de usuario la base se fía de updated_by: nunca debe omitirse (ver asignar_auditoria)."""
    enviados = []

    def handler(req: httpx.Request):
        enviados.append(json.loads(req.content))
        return httpx.Response(200, json=[{"id": "x"}])

    sb = hacer(handler)
    asyncio.run(sb.actualizar_sede("x", {"nombre": "Otra"}))  # sin autor: "sistema", pero explícito
    asyncio.run(sb.actualizar_bloque("x", {"radio_metros": 80, "updated_by": "admin-1"}))
    assert enviados[0] == {"updated_by": None, "nombre": "Otra"}
    assert enviados[1] == {"updated_by": "admin-1", "radio_metros": 80}


def test_marcaciones_en_rango_envia_los_dos_limites_de_fecha():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=[{"id": "m1"}])

    r = asyncio.run(hacer(handler).marcaciones_en_rango("u1", "2026-10-15T05:00:00+00:00", "2026-10-16T05:00:00+00:00"))
    assert r == [{"id": "m1"}]
    p = vistos[0].url.params
    assert p["usuario_id"] == "eq.u1" and p["order"] == "fecha_hora.asc"
    assert p.get_list("fecha_hora") == ["gte.2026-10-15T05:00:00+00:00", "lt.2026-10-16T05:00:00+00:00"]


def test_marcacion_anterior_pide_solo_la_mas_reciente():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=[])

    assert asyncio.run(hacer(handler).marcacion_anterior("u1", "2026-10-15T13:00:00+00:00")) is None
    p = vistos[0].url.params
    assert p["fecha_hora"] == "lt.2026-10-15T13:00:00+00:00" and p["order"] == "fecha_hora.desc" and p["limit"] == "1"


def test_contar_marcaciones_web_filtra_origen_y_rango():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=[{"id": "a"}, {"id": "b"}])

    assert asyncio.run(hacer(handler).contar_marcaciones_web("u1", "2026-09-15T00:00:00+00:00", "2026-10-15T00:00:00+00:00")) == 2
    p = vistos[0].url.params
    assert p["origen"] == "eq.web" and len(p.get_list("fecha_hora")) == 2


def test_insertar_marcacion_y_anomalia_no_envian_campos_de_auditoria():
    cuerpos = []

    def handler(req):
        cuerpos.append((req.url.path, json.loads(req.content)))
        return httpx.Response(201, json=[{"id": "x"}])

    sb = hacer(handler)
    asyncio.run(sb.insertar_marcacion({"id": "m1", "tipo": "ingreso"}))
    asyncio.run(sb.insertar_anomalia({"usuario_id": "u1", "tipo": "duplicada"}))
    assert cuerpos[0] == ("/rest/v1/marcaciones", {"id": "m1", "tipo": "ingreso"})
    assert cuerpos[1] == ("/rest/v1/anomalias", {"usuario_id": "u1", "tipo": "duplicada"})


def test_vincular_dispositivo_solo_si_la_cuenta_no_tiene_uno():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=[{"id": "u1", "dispositivo_id": "cel-A"}])

    r = asyncio.run(hacer(handler).vincular_dispositivo("u1", "cel-A"))
    assert r["dispositivo_id"] == "cel-A"
    req = vistos[0]
    assert req.method == "PATCH" and req.url.path == "/rest/v1/usuarios"
    assert req.url.params["id"] == "eq.u1" and req.url.params["dispositivo_id"] == "is.null"
    assert json.loads(req.content) == {"dispositivo_id": "cel-A", "updated_by": "u1"}


def test_vincular_dispositivo_devuelve_none_si_ya_habia_otro():
    assert asyncio.run(hacer(lambda req: httpx.Response(200, json=[])).vincular_dispositivo("u1", "cel-B")) is None


def test_actualizar_correo_auth_usa_el_endpoint_de_administracion():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json={"id": "u1"})

    asyncio.run(hacer(handler).actualizar_correo_auth("u1", "nuevo@x.com"))
    req = vistos[0]
    assert req.method == "PUT" and req.url.path == "/auth/v1/admin/users/u1"
    assert json.loads(req.content) == {"email": "nuevo@x.com"}


def test_actualizar_correo_auth_repetido_lanza_error_con_el_estado():
    def handler(req):
        return httpx.Response(422, json={"msg": "A user with this email address has already been registered"})

    try:
        asyncio.run(hacer(handler).actualizar_correo_auth("u1", "ocupado@x.com"))
        assert False, "debía fallar"
    except SupabaseError as e:
        assert e.status == 422 and "already" in e.message


def test_las_funciones_del_chat_llaman_a_la_base_con_los_parametros_de_la_migracion_0004():
    vistos = []

    def manejador(req: httpx.Request):
        vistos.append((req.url.path, json.loads(req.content)))
        return httpx.Response(200, json="just-1" if req.url.path.endswith("registrar_mensaje_usuario")
                              else "en_revision" if req.url.path.endswith("cerrar_justificacion") else None)

    c = hacer(manejador)
    assert asyncio.run(c.registrar_mensaje_usuario("u1", "a1", "texto", 3)) == "just-1"
    asyncio.run(c.registrar_mensaje_asistente("just-1", "respuesta"))
    assert asyncio.run(c.cerrar_justificacion("a1", "aceptable", 0.9, "resumen", True)) == "en_revision"
    assert vistos == [
        ("/rest/v1/rpc/registrar_mensaje_usuario", {"p_usuario": "u1", "p_anomalia": "a1", "p_texto": "texto", "p_max": 3}),
        ("/rest/v1/rpc/registrar_mensaje_asistente", {"p_justificacion": "just-1", "p_contenido": "respuesta"}),
        ("/rest/v1/rpc/cerrar_justificacion", {"p_anomalia": "a1", "p_clasificacion": "aceptable", "p_confianza": 0.9,
                                               "p_resumen": "resumen", "p_auto_aprobar": True}),
    ]


def test_ids_con_invitacion_pendiente_pagina_y_filtra_los_activados():
    paginas = []

    def handler(req):
        pag = int(req.url.params["page"])
        paginas.append((pag, req.url.params["per_page"]))
        if pag == 1:
            return httpx.Response(200, json={"users": [{"id": f"a{i}", "email_confirmed_at": "2026-01-01"} for i in range(199)]
                                              + [{"id": "p1", "email_confirmed_at": None}]})
        return httpx.Response(200, json={"users": [{"id": "p2", "email_confirmed_at": None}, {"id": "ok", "confirmed_at": "x"}]})

    assert asyncio.run(hacer(handler).ids_con_invitacion_pendiente()) == ["p1", "p2"]
    assert paginas == [(1, "200"), (2, "200")]


def test_ausencias_de_jornada_filtra_por_persona_dia_y_tipo():
    vistos = []

    def handler(req):
        vistos.append(req)
        return httpx.Response(200, json=[{"id": "a1", "tipo": "sin_salida", "estado": "pendiente", "detalle": "x"}])

    filas = asyncio.run(hacer(handler).ausencias_de_jornada("u1", "2026-10-15"))
    p = vistos[0].url.params
    assert filas[0]["id"] == "a1"
    assert vistos[0].url.path == "/rest/v1/anomalias"
    assert (p["usuario_id"], p["fecha_jornada"]) == ("eq.u1", "eq.2026-10-15")
    assert p["tipo"] == "in.(sin_ingreso,sin_salida,sin_regreso_almuerzo)"


def test_anotar_anomalia_solo_cambia_el_detalle():
    vistos = []

    def handler(req):
        vistos.append((req.method, req.url.path, dict(req.url.params), json.loads(req.content)))
        return httpx.Response(204)

    asyncio.run(hacer(handler).anotar_anomalia("a1", "nuevo detalle"))
    assert vistos == [("PATCH", "/rest/v1/anomalias", {"id": "eq.a1"}, {"detalle": "nuevo detalle"})]
