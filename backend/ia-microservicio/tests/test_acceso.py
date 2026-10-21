"""Sesión vencida y cuenta desactivada: las respuestas llevan un `codigo` para que las apps vuelvan al login."""
from tests.conftest import ADMIN_ID, admin_headers

USUARIO = "u-acceso"


def con_token(fake, token, **fila):
    fake.tokens[token] = USUARIO
    fake.filas[USUARIO] = {"id": USUARIO, "rol": "usuario", "activo": True, "email": "a@x.com", **fila}
    return {"Authorization": f"Bearer {token}"}


def test_sin_token_es_401_con_codigo_de_sesion_vencida(client):
    r = client.get("/marcaciones/hoy")
    assert r.status_code == 401
    assert r.json()["codigo"] == "sesion_vencida" and "sesión terminó" in r.json()["detail"]


def test_un_token_que_supabase_ya_no_reconoce_es_401_con_codigo(client):
    r = client.get("/marcaciones/hoy", headers={"Authorization": "Bearer ya-no-sirve"})
    assert r.status_code == 401 and r.json()["codigo"] == "sesion_vencida"


def test_una_cuenta_desactivada_recibe_403_con_codigo_aunque_el_token_sirva(client, fake):
    h = con_token(fake, "t-off", activo=False)
    r = client.get("/marcaciones/hoy", headers=h)
    assert r.status_code == 403
    assert r.json()["codigo"] == "cuenta_inhabilitada" and "desactivada" in r.json()["detail"]


def test_un_administrador_desactivado_tambien(client, fake):
    fake.filas[ADMIN_ID]["activo"] = False
    r = client.post("/feriados/9f1c8e0a-0000-4000-8000-000000000000/desactivar", headers=admin_headers())
    assert r.status_code == 403 and r.json()["codigo"] == "cuenta_inhabilitada"


def test_una_cuenta_sin_fila_en_usuarios_tambien(client, fake):
    fake.tokens["t-huerfano"] = "no-existe"
    r = client.get("/marcaciones/hoy", headers={"Authorization": "Bearer t-huerfano"})
    assert r.status_code == 403 and r.json()["codigo"] == "cuenta_inhabilitada"


def test_el_rol_equivocado_sigue_siendo_403_sin_codigo(client, fake):
    """No debe cerrar la sesión: la persona sí tiene sesión y cuenta, solo no le toca esa pantalla."""
    h = con_token(fake, "t-ok")
    r = client.post("/feriados/9f1c8e0a-0000-4000-8000-000000000000/desactivar", headers=h)   # acción de administrador
    assert r.status_code == 403 and "codigo" not in r.json()
    r = client.get("/marcaciones/hoy", headers=admin_headers())   # un administrador no marca
    assert r.status_code == 403 and "codigo" not in r.json()
