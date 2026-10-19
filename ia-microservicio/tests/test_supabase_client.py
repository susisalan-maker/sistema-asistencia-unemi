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
