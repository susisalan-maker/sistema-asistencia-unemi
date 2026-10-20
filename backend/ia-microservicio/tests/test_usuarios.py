from tests.conftest import ADMIN_ID, NUEVO_ID, SEDE_ID, admin_headers

NUEVO = {"nombres": "Ana María", "apellidos": "Pérez Loor", "email": "Ana@Correo.com", "rol": "usuario", "sede_id": SEDE_ID}


def test_sin_token_rechaza(client):
    assert client.post("/usuarios", json=NUEVO).status_code == 401


def test_token_invalido_rechaza(client):
    r = client.post("/usuarios", json=NUEVO, headers={"Authorization": "Bearer malo"})
    assert r.status_code == 401


def test_un_usuario_normal_no_puede_crear(client):
    r = client.post("/usuarios", json=NUEVO, headers={"Authorization": "Bearer token-usuario"})
    assert r.status_code == 403


def test_admin_desactivado_no_puede(client, fake):
    fake.filas[ADMIN_ID]["activo"] = False
    assert client.post("/usuarios", json=NUEVO, headers=admin_headers()).status_code == 403


def test_alta_correcta_invita_y_guarda(client, fake):
    r = client.post("/usuarios", json=NUEVO, headers=admin_headers())
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "ana@correo.com"  # normaliza a minúsculas
    invitar = next(c for c in fake.llamadas if c[0] == "invitar")
    assert invitar[2] == "http://panel.test/aceptar-invitacion"
    insertar = next(c for c in fake.llamadas if c[0] == "insertar")[1]
    assert insertar["id"] == NUEVO_ID and insertar["created_by"] == ADMIN_ID
    assert "password" not in str(insertar).lower()  # el admin nunca define contraseña


def test_si_falla_el_guardado_se_deshace_la_cuenta_auth(client, fake):
    fake.fallar_insert = True
    r = client.post("/usuarios", json=NUEVO, headers=admin_headers())
    assert r.status_code == 502
    assert ("eliminar_auth", NUEVO_ID) in fake.llamadas
    assert NUEVO_ID not in fake.auth_users


def test_correo_repetido_da_409(client, fake):
    fake.correo_existente = True
    assert client.post("/usuarios", json=NUEVO, headers=admin_headers()).status_code == 409


def test_usuario_sin_sede_es_invalido(client):
    r = client.post("/usuarios", json={**NUEVO, "sede_id": None}, headers=admin_headers())
    assert r.status_code == 422


def test_administrador_no_necesita_sede(client):
    r = client.post("/usuarios", json={**NUEVO, "rol": "administrador", "sede_id": None}, headers=admin_headers())
    assert r.status_code == 201


def test_jornada_invalida(client):
    r = client.post("/usuarios", json={**NUEVO, "jornada_inicio": "17:00", "jornada_fin": "08:00"}, headers=admin_headers())
    assert r.status_code == 422


def test_reenviar_invitacion_si_no_activo(client, fake):
    r = client.post("/usuarios/u-1/reenviar-invitacion", headers=admin_headers())
    assert r.status_code == 200 and "reenviada" in r.json()["mensaje"]
    assert fake.llamadas[-1][0] == "invitar"


def test_reenviar_a_cuenta_activa_manda_recuperacion(client, fake):
    fake.auth_users["u-1"]["email_confirmed_at"] = "2026-02-02"
    client.post("/usuarios/u-1/reenviar-invitacion", headers=admin_headers())
    assert fake.llamadas[-1] == ("recuperar", "u1@x.com", "http://panel.test/restablecer-contrasena")


def test_desactivar_bloquea_en_auth(client, fake):
    r = client.post("/usuarios/u-1/desactivar", headers=admin_headers())
    assert r.status_code == 200
    assert ("bloquear", "u-1", True) in fake.llamadas
    assert fake.filas["u-1"]["activo"] is False


def test_activar_levanta_el_bloqueo(client, fake):
    fake.filas["u-1"]["activo"] = False
    client.post("/usuarios/u-1/activar", headers=admin_headers())
    assert ("bloquear", "u-1", False) in fake.llamadas


def test_no_se_desactiva_a_si_mismo(client):
    assert client.post(f"/usuarios/{ADMIN_ID}/desactivar", headers=admin_headers()).status_code == 409


def test_no_se_desactiva_al_ultimo_administrador(client, fake):
    fake.filas["u-1"].update(rol="administrador")  # segundo admin
    fake.filas[ADMIN_ID]["activo"] = True
    fake.filas["u-1"]["activo"] = True
    # desactivar a u-1 está permitido (queda ADMIN_ID)...
    assert client.post("/usuarios/u-1/desactivar", headers=admin_headers()).status_code == 200
    # ...pero ahora ADMIN_ID es el último y además es quien llama
    assert client.post(f"/usuarios/{ADMIN_ID}/desactivar", headers=admin_headers()).status_code == 409


def test_usuario_inexistente_404(client):
    assert client.post("/usuarios/no-existe/desactivar", headers=admin_headers()).status_code == 404


# ---------------------------------------------------------------- días laborables y horario
def test_alta_por_defecto_trabaja_de_lunes_a_viernes(client, fake):
    client.post("/usuarios", json=NUEVO, headers=admin_headers())
    insertar = next(c for c in fake.llamadas if c[0] == "insertar")[1]
    assert insertar["dias_laborables"] == [1, 2, 3, 4, 5]


def test_alta_con_dias_propios_los_ordena(client, fake):
    client.post("/usuarios", json={**NUEVO, "dias_laborables": [6, 1, 3]}, headers=admin_headers())
    assert next(c for c in fake.llamadas if c[0] == "insertar")[1]["dias_laborables"] == [1, 3, 6]


def test_dias_invalidos_en_el_alta(client):
    for malo in ([], [0], [8], [1, 1], [1, "x"]):
        r = client.post("/usuarios", json={**NUEVO, "dias_laborables": malo}, headers=admin_headers())
        assert r.status_code == 422, malo


def _con_jornada(fake):
    fake.filas["u-1"].update({"jornada_inicio": "08:00:00", "jornada_fin": "17:00:00", "dias_laborables": [1, 2, 3, 4, 5]})


def test_cambiar_horario_exige_administrador(client, fake):
    _con_jornada(fake)
    assert client.patch("/usuarios/u-1/horario", json={"dias_laborables": [1]}).status_code == 401
    r = client.patch("/usuarios/u-1/horario", json={"dias_laborables": [1]}, headers={"Authorization": "Bearer token-usuario"})
    assert r.status_code == 403


def test_cambiar_dias_registra_autor(client, fake):
    _con_jornada(fake)
    r = client.patch("/usuarios/u-1/horario", json={"dias_laborables": [3, 1, 2]}, headers=admin_headers())
    assert r.status_code == 200, r.text
    assert next(c for c in fake.llamadas if c[0] == "actualizar")[2] == {"dias_laborables": [1, 2, 3], "updated_by": ADMIN_ID}


def test_cambiar_solo_la_hora_de_salida(client, fake):
    _con_jornada(fake)
    r = client.patch("/usuarios/u-1/horario", json={"jornada_fin": "16:00"}, headers=admin_headers())
    assert r.status_code == 200
    assert next(c for c in fake.llamadas if c[0] == "actualizar")[2]["jornada_fin"] == "16:00:00"


def test_la_jornada_se_valida_contra_la_actual(client, fake):
    _con_jornada(fake)  # 08:00 - 17:00
    assert client.patch("/usuarios/u-1/horario", json={"jornada_inicio": "17:30"}, headers=admin_headers()).status_code == 422
    assert client.patch("/usuarios/u-1/horario", json={"jornada_fin": "07:00"}, headers=admin_headers()).status_code == 422
    assert client.patch("/usuarios/u-1/horario", json={"jornada_inicio": "17:30", "jornada_fin": "20:00"}, headers=admin_headers()).status_code == 200


def test_cambiar_horario_sin_datos_o_inexistente(client, fake):
    _con_jornada(fake)
    assert client.patch("/usuarios/u-1/horario", json={}, headers=admin_headers()).status_code == 422
    assert client.patch("/usuarios/u-1/horario", json={"dias_laborables": None}, headers=admin_headers()).status_code == 422
    assert client.patch("/usuarios/u-1/horario", json={"dias_laborables": [9]}, headers=admin_headers()).status_code == 422
    assert client.patch("/usuarios/no-existe/horario", json={"dias_laborables": [1]}, headers=admin_headers()).status_code == 404
