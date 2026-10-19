from tests.conftest import ADMIN_ID, BLOQUE_ID, SEDE_ID, admin_headers

SEDE = {"nombre": "  Santo Domingo  ", "latitud": -0.25, "longitud": -79.17, "radio_metros": 300}
BLOQUE = {"sede_id": SEDE_ID, "nombre": "Bloque P", "latitud": -2.14, "longitud": -79.6, "radio_metros": 50}


# ---------------------------------------------------------------- acceso
def test_sin_token_rechaza_todo(client):
    assert client.post("/sedes", json=SEDE).status_code == 401
    assert client.post("/bloques", json=BLOQUE).status_code == 401
    assert client.patch(f"/sedes/{SEDE_ID}", json={"nombre": "X1"}).status_code == 401
    assert client.post(f"/bloques/{BLOQUE_ID}/desactivar").status_code == 401


def test_un_usuario_normal_no_puede(client):
    h = {"Authorization": "Bearer token-usuario"}
    assert client.post("/sedes", json=SEDE, headers=h).status_code == 403
    assert client.post("/bloques", json=BLOQUE, headers=h).status_code == 403
    assert client.post(f"/sedes/{SEDE_ID}/desactivar", headers=h).status_code == 403


# ----------------------------------------------------------------- sedes
def test_crear_sede_limpia_el_nombre_y_registra_autor(client, fake):
    r = client.post("/sedes", json=SEDE, headers=admin_headers())
    assert r.status_code == 201, r.text
    datos = next(c for c in fake.llamadas if c[0] == "insertar_sede")[1]
    assert datos["nombre"] == "Santo Domingo"
    assert datos["created_by"] == ADMIN_ID
    assert datos["permite_fuera_geocerca"] is False


def test_sede_con_valores_fuera_de_rango(client):
    for malo in ({"latitud": 91}, {"latitud": -91}, {"longitud": 181}, {"radio_metros": 49},
                 {"radio_metros": 1001}, {"nombre": " a "}):
        r = client.post("/sedes", json={**SEDE, **malo}, headers=admin_headers())
        assert r.status_code == 422, malo


def test_sede_acepta_los_limites(client):
    r = client.post("/sedes", json={**SEDE, "latitud": 90, "longitud": -180, "radio_metros": 50}, headers=admin_headers())
    assert r.status_code == 201
    r = client.post("/sedes", json={**SEDE, "radio_metros": 1000}, headers=admin_headers())
    assert r.status_code == 201


def test_sede_nombre_repetido_da_409(client, fake):
    fake.nombre_duplicado = True
    r = client.post("/sedes", json=SEDE, headers=admin_headers())
    assert r.status_code == 409 and "nombre" in r.json()["detail"]


def test_editar_sede_solo_cambia_lo_enviado_y_registra_autor(client, fake):
    r = client.patch(f"/sedes/{SEDE_ID}", json={"radio_metros": 500}, headers=admin_headers())
    assert r.status_code == 200, r.text
    assert fake.llamadas[-1] == ("actualizar_sede", SEDE_ID, {"radio_metros": 500, "updated_by": ADMIN_ID})


def test_editar_sede_sin_campos_o_con_nulos_es_invalido(client):
    assert client.patch(f"/sedes/{SEDE_ID}", json={}, headers=admin_headers()).status_code == 422
    assert client.patch(f"/sedes/{SEDE_ID}", json={"nombre": None}, headers=admin_headers()).status_code == 422


def test_editar_sede_inexistente_da_404(client):
    assert client.patch("/sedes/no-existe", json={"nombre": "Otra"}, headers=admin_headers()).status_code == 404


def test_editar_sede_con_nombre_repetido_da_409(client, fake):
    fake.nombre_duplicado = True
    r = client.patch(f"/sedes/{SEDE_ID}", json={"nombre": "Quito"}, headers=admin_headers())
    assert r.status_code == 409


def test_no_se_desactiva_una_sede_con_usuarios_activos(client, fake):
    fake.filas["u-1"]["sede_id"] = SEDE_ID
    r = client.post(f"/sedes/{SEDE_ID}/desactivar", headers=admin_headers())
    assert r.status_code == 409 and "1 usuario" in r.json()["detail"]
    assert fake.sedes[SEDE_ID]["activa"] is True


def test_desactivar_y_activar_sede(client, fake):
    assert client.post(f"/sedes/{SEDE_ID}/desactivar", headers=admin_headers()).status_code == 200
    assert fake.sedes[SEDE_ID]["activa"] is False
    assert fake.llamadas[-1][2]["updated_by"] == ADMIN_ID
    assert client.post(f"/sedes/{SEDE_ID}/activar", headers=admin_headers()).status_code == 200
    assert fake.sedes[SEDE_ID]["activa"] is True


def test_un_usuario_inactivo_no_impide_desactivar_la_sede(client, fake):
    fake.filas["u-1"].update({"sede_id": SEDE_ID, "activo": False})
    assert client.post(f"/sedes/{SEDE_ID}/desactivar", headers=admin_headers()).status_code == 200


def test_desactivar_sede_ya_inactiva_no_hace_cambios(client, fake):
    fake.sedes[SEDE_ID]["activa"] = False
    n = len(fake.llamadas)
    assert client.post(f"/sedes/{SEDE_ID}/desactivar", headers=admin_headers()).status_code == 200
    assert len(fake.llamadas) == n


# --------------------------------------------------------------- bloques
def test_crear_bloque(client, fake):
    r = client.post("/bloques", json=BLOQUE, headers=admin_headers())
    assert r.status_code == 201, r.text
    datos = next(c for c in fake.llamadas if c[0] == "insertar_bloque")[1]
    assert datos["sede_id"] == SEDE_ID and datos["created_by"] == ADMIN_ID


def test_bloque_con_valores_fuera_de_rango(client):
    for malo in ({"radio_metros": 19}, {"radio_metros": 201}, {"latitud": 100}, {"longitud": -200},
                 {"nombre": ""}, {"sede_id": "no-es-uuid"}):
        r = client.post("/bloques", json={**BLOQUE, **malo}, headers=admin_headers())
        assert r.status_code == 422, malo


def test_bloque_acepta_los_limites(client):
    assert client.post("/bloques", json={**BLOQUE, "radio_metros": 20}, headers=admin_headers()).status_code == 201
    assert client.post("/bloques", json={**BLOQUE, "radio_metros": 200}, headers=admin_headers()).status_code == 201


def test_bloque_de_sede_inexistente_da_404(client):
    r = client.post("/bloques", json={**BLOQUE, "sede_id": "99999999-9999-9999-9999-999999999999"}, headers=admin_headers())
    assert r.status_code == 404


def test_bloque_en_sede_inactiva_da_409(client, fake):
    fake.sedes[SEDE_ID]["activa"] = False
    assert client.post("/bloques", json=BLOQUE, headers=admin_headers()).status_code == 409


def test_bloque_nombre_repetido_en_la_sede_da_409(client, fake):
    fake.nombre_duplicado = True
    r = client.post("/bloques", json=BLOQUE, headers=admin_headers())
    assert r.status_code == 409 and "bloque" in r.json()["detail"]


def test_editar_bloque_no_permite_cambiar_de_sede(client, fake):
    r = client.patch(f"/bloques/{BLOQUE_ID}", json={"sede_id": "otra", "radio_metros": 80}, headers=admin_headers())
    assert r.status_code == 200
    assert fake.llamadas[-1] == ("actualizar_bloque", BLOQUE_ID, {"radio_metros": 80, "updated_by": ADMIN_ID})


def test_editar_bloque_sin_campos_validos(client):
    assert client.patch(f"/bloques/{BLOQUE_ID}", json={}, headers=admin_headers()).status_code == 422
    assert client.patch(f"/bloques/{BLOQUE_ID}", json={"sede_id": "otra"}, headers=admin_headers()).status_code == 422


def test_editar_bloque_inexistente_da_404(client):
    assert client.patch("/bloques/no-existe", json={"nombre": "Otro"}, headers=admin_headers()).status_code == 404


def test_desactivar_el_ultimo_bloque_avisa_que_se_usa_el_circulo_de_la_sede(client, fake):
    r = client.post(f"/bloques/{BLOQUE_ID}/desactivar", headers=admin_headers())
    assert r.status_code == 200 and "círculo de la sede" in r.json()["mensaje"]
    assert fake.bloques[BLOQUE_ID]["activo"] is False


def test_desactivar_un_bloque_si_quedan_otros_no_avisa(client, fake):
    fake.bloques["b-2"] = {"id": "b-2", "sede_id": SEDE_ID, "nombre": "Bloque V", "activo": True}
    r = client.post(f"/bloques/{BLOQUE_ID}/desactivar", headers=admin_headers())
    assert "círculo" not in r.json()["mensaje"]


def test_activar_bloque_exige_sede_activa(client, fake):
    fake.bloques[BLOQUE_ID]["activo"] = False
    fake.sedes[SEDE_ID]["activa"] = False
    assert client.post(f"/bloques/{BLOQUE_ID}/activar", headers=admin_headers()).status_code == 409
    fake.sedes[SEDE_ID]["activa"] = True
    assert client.post(f"/bloques/{BLOQUE_ID}/activar", headers=admin_headers()).status_code == 200
    assert fake.bloques[BLOQUE_ID]["activo"] is True
