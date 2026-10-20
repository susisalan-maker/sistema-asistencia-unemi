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
