from app.supabase_client import SupabaseError
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


def test_reenviar_a_cuenta_activa_se_rechaza_y_no_manda_correo(client, fake):
    fake.auth_users["u-1"]["email_confirmed_at"] = "2026-02-02"
    antes = len(fake.llamadas)
    r = client.post("/usuarios/u-1/reenviar-invitacion", headers=admin_headers())
    assert r.status_code == 409 and "Restablecer contraseña" in r.json()["detail"]
    assert len(fake.llamadas) == antes


def test_restablecer_a_cuenta_activa_manda_el_enlace(client, fake):
    fake.auth_users["u-1"]["email_confirmed_at"] = "2026-02-02"
    r = client.post("/usuarios/u-1/restablecer-contrasena", headers=admin_headers())
    assert r.status_code == 200 and "restablecer" in r.json()["mensaje"]
    assert fake.llamadas[-1] == ("recuperar", "u1@x.com", "http://panel.test/restablecer-contrasena")


def test_restablecer_a_quien_no_acepto_se_rechaza_y_no_manda_correo(client, fake):
    antes = len(fake.llamadas)
    r = client.post("/usuarios/u-1/restablecer-contrasena", headers=admin_headers())
    assert r.status_code == 409 and "invitación" in r.json()["detail"]
    assert len(fake.llamadas) == antes


def test_restablecer_usuario_inexistente(client):
    assert client.post("/usuarios/no-existe/restablecer-contrasena", headers=admin_headers()).status_code == 404


def test_error_de_correo_al_restablecer_es_502(client, fake):
    fake.auth_users["u-1"]["email_confirmed_at"] = "2026-02-02"

    async def falla(email, redirect_to):
        raise SupabaseError(500, "Error sending recovery email")
    fake.enviar_recuperacion = falla
    r = client.post("/usuarios/u-1/restablecer-contrasena", headers=admin_headers())
    assert r.status_code == 502 and "Error sending recovery email" in r.json()["detail"]


def test_invitaciones_pendientes_lista_solo_a_quienes_no_aceptaron(client, fake):
    fake.auth_users["u-1"]["email_confirmed_at"] = "2026-02-02"
    fake.auth_users["u-2"] = {"id": "u-2", "email_confirmed_at": None}
    r = client.post("/usuarios/u-1/reenviar-invitacion", headers=admin_headers())  # no debe alterar nada
    assert r.status_code == 409
    r = client.get("/usuarios/invitaciones-pendientes", headers=admin_headers())
    assert r.status_code == 200 and r.json() == {"ids": ["u-2"]}


def test_invitaciones_pendientes_solo_para_administradores(client):
    assert client.get("/usuarios/invitaciones-pendientes").status_code in (401, 403)


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


# ---------------------------------------------------------------- editar usuario (sede, rol, horario)
OTRA_SEDE = "77777777-7777-7777-7777-777777777777"
H_USUARIO = {"Authorization": "Bearer token-usuario"}


def _editable(fake):
    _con_jornada(fake)
    fake.filas["u-1"].update({"sede_id": SEDE_ID, "nombres": "Ana", "dispositivo_id": None})
    fake.sedes[OTRA_SEDE] = {"id": OTRA_SEDE, "nombre": "Instituto Bolivariano", "latitud": -2.17, "longitud": -79.9,
                             "radio_metros": 300, "permite_fuera_geocerca": False, "activa": True}


def _escrituras(fake):
    return [c for c in fake.llamadas if c[0] == "actualizar"]


def test_editar_exige_administrador(client, fake):
    _editable(fake)
    assert client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE}).status_code == 401
    assert client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE}, headers=H_USUARIO).status_code == 403
    assert _escrituras(fake) == []


def test_cambiar_la_sede_registra_autor(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE}, headers=admin_headers())
    assert r.status_code == 200, r.text
    assert _escrituras(fake)[0][2] == {"sede_id": OTRA_SEDE, "updated_by": ADMIN_ID}
    assert fake.filas["u-1"]["sede_id"] == OTRA_SEDE


def test_la_sede_debe_existir_y_estar_activa(client, fake):
    _editable(fake)
    assert client.patch("/usuarios/u-1", json={"sede_id": "88888888-8888-8888-8888-888888888888"}, headers=admin_headers()).status_code == 422
    fake.sedes[OTRA_SEDE]["activa"] = False
    r = client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE}, headers=admin_headers())
    assert r.status_code == 422 and "inactiva" in r.json()["detail"]
    assert _escrituras(fake) == []


def test_sede_y_horario_en_una_sola_escritura(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE, "jornada_fin": "16:00", "dias_laborables": [1, 2]}, headers=admin_headers())
    assert r.status_code == 200
    assert len(_escrituras(fake)) == 1
    assert _escrituras(fake)[0][2] == {"sede_id": OTRA_SEDE, "jornada_fin": "16:00:00", "dias_laborables": [1, 2], "updated_by": ADMIN_ID}


def test_si_el_horario_es_invalido_no_cambia_nada(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE, "jornada_fin": "07:00"}, headers=admin_headers())
    assert r.status_code == 422
    assert _escrituras(fake) == [] and fake.filas["u-1"]["sede_id"] == SEDE_ID


def test_editar_sin_datos_o_con_datos_invalidos(client, fake):
    _editable(fake)
    for malo in ({}, {"sede_id": None}, {"rol": "dueño"}, {"sede_id": "no-es-uuid"}):
        assert client.patch("/usuarios/u-1", json=malo, headers=admin_headers()).status_code == 422, malo
    assert client.patch("/usuarios/no-existe", json={"rol": "usuario"}, headers=admin_headers()).status_code == 404


def test_repetir_el_mismo_rol_no_escribe(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"rol": "usuario"}, headers=admin_headers())
    assert r.status_code == 200
    assert _escrituras(fake) == []


def test_un_usuario_puede_pasar_a_administrador(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"rol": "administrador"}, headers=admin_headers())
    assert r.status_code == 200
    assert fake.filas["u-1"]["rol"] == "administrador"
    assert _escrituras(fake)[0][2] == {"rol": "administrador", "updated_by": ADMIN_ID}


def test_no_puedes_cambiar_tu_propio_rol(client, fake):
    r = client.patch(f"/usuarios/{ADMIN_ID}", json={"rol": "usuario", "sede_id": SEDE_ID}, headers=admin_headers())
    assert r.status_code == 409 and "propio rol" in r.json()["detail"]


def test_se_puede_degradar_a_otro_administrador_porque_tu_sigues_siendo_uno(client, fake):
    fake.filas["u-2"] = {"id": "u-2", "rol": "administrador", "activo": True, "email": "o@x.com"}
    r = client.patch("/usuarios/u-2", json={"rol": "usuario", "sede_id": SEDE_ID}, headers=admin_headers())
    assert r.status_code == 200
    assert fake.filas["u-2"]["rol"] == "usuario"
    assert fake.filas[ADMIN_ID]["rol"] == "administrador"


def test_pasar_de_administrador_a_usuario_requiere_sede(client, fake):
    fake.filas["u-2"] = {"id": "u-2", "rol": "administrador", "activo": True, "email": "o@x.com", "sede_id": None}
    r = client.patch("/usuarios/u-2", json={"rol": "usuario"}, headers=admin_headers())
    assert r.status_code == 422 and "sede" in r.json()["detail"]
    assert _escrituras(fake) == []
    r = client.patch("/usuarios/u-2", json={"rol": "usuario", "sede_id": SEDE_ID}, headers=admin_headers())
    assert r.status_code == 200
    assert fake.filas["u-2"]["rol"] == "usuario" and fake.filas["u-2"]["sede_id"] == SEDE_ID


def test_si_la_base_falla_se_avisa(client, fake):
    _editable(fake)

    async def falla(uid, datos):
        raise SupabaseError(400, "violación de restricción")

    fake.actualizar_usuario = falla
    r = client.patch("/usuarios/u-1", json={"sede_id": OTRA_SEDE}, headers=admin_headers())
    assert r.status_code == 502 and "No se pudo actualizar el usuario" in r.json()["detail"]


# ---------------------------------------------------------------- reiniciar el celular vinculado
def test_reiniciar_celular_exige_administrador(client, fake):
    _editable(fake)
    fake.filas["u-1"]["dispositivo_id"] = "cel-A"
    assert client.post("/usuarios/u-1/reiniciar-dispositivo").status_code == 401
    assert client.post("/usuarios/u-1/reiniciar-dispositivo", headers=H_USUARIO).status_code == 403
    assert fake.filas["u-1"]["dispositivo_id"] == "cel-A"


def test_reiniciar_celular_lo_quita_y_registra_autor(client, fake):
    _editable(fake)
    fake.filas["u-1"]["dispositivo_id"] = "cel-A"
    r = client.post("/usuarios/u-1/reiniciar-dispositivo", headers=admin_headers())
    assert r.status_code == 200
    assert fake.filas["u-1"]["dispositivo_id"] is None
    assert _escrituras(fake)[0][2] == {"dispositivo_id": None, "updated_by": ADMIN_ID}


def test_reiniciar_celular_sin_celular_no_escribe(client, fake):
    _editable(fake)
    r = client.post("/usuarios/u-1/reiniciar-dispositivo", headers=admin_headers())
    assert r.status_code == 200 and "no tenía" in r.json()["mensaje"]
    assert _escrituras(fake) == []


def test_reiniciar_celular_de_usuario_inexistente(client):
    assert client.post("/usuarios/no-existe/reiniciar-dispositivo", headers=admin_headers()).status_code == 404


def test_tras_reiniciar_se_puede_vincular_otro_celular(client, fake):
    """El circuito completo: vinculado → el administrador lo reinicia → la persona vincula otro."""
    _editable(fake)
    fake.tokens["token-u1"] = "u-1"
    fake.filas["u-1"]["dispositivo_id"] = "cel-A"
    h = {"Authorization": "Bearer token-u1"}
    assert client.post("/dispositivo/vincular", json={"dispositivo_id": "cel-B"}, headers=h).status_code == 409
    client.post("/usuarios/u-1/reiniciar-dispositivo", headers=admin_headers())
    assert client.post("/dispositivo/vincular", json={"dispositivo_id": "cel-B"}, headers=h).status_code == 200
    assert fake.filas["u-1"]["dispositivo_id"] == "cel-B"


# ---------------------------------------------------------------- nombres y correo
def _confirmada(fake, uid="u-1"):
    fake.auth_users[uid]["email_confirmed_at"] = "2026-01-01"


def _llamadas(fake, nombre):
    return [c for c in fake.llamadas if c[0] == nombre]


def test_cambiar_nombres_los_limpia_y_registra_autor(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"nombres": "  Ana María ", "apellidos": "Pérez Loor"}, headers=admin_headers())
    assert r.status_code == 200, r.text
    assert _escrituras(fake)[0][2] == {"nombres": "Ana María", "apellidos": "Pérez Loor", "updated_by": ADMIN_ID}
    assert _llamadas(fake, "auth_correo") == []          # los nombres no tocan Supabase Auth
    assert r.json()["mensaje"] is None


def test_los_nombres_deben_tener_al_menos_dos_letras(client, fake):
    _editable(fake)
    for malo in ({"nombres": "A"}, {"nombres": "   "}, {"apellidos": ""}, {"nombres": "x" * 81}):
        assert client.patch("/usuarios/u-1", json=malo, headers=admin_headers()).status_code == 422, malo
    assert _escrituras(fake) == []


def test_cambiar_correo_actualiza_auth_y_tabla(client, fake):
    _editable(fake)
    _confirmada(fake)
    r = client.patch("/usuarios/u-1", json={"email": "Nuevo@Correo.COM"}, headers=admin_headers())
    assert r.status_code == 200, r.text
    assert _llamadas(fake, "auth_correo") == [("auth_correo", "u-1", "nuevo@correo.com")]
    assert _escrituras(fake)[0][2] == {"email": "nuevo@correo.com", "updated_by": ADMIN_ID}
    orden = [c[0] for c in fake.llamadas if c[0] in ("auth_correo", "actualizar")]
    assert orden == ["auth_correo", "actualizar"]         # primero Auth, luego la tabla
    assert "iniciar sesión con el correo nuevo" in r.json()["mensaje"]
    assert _llamadas(fake, "invitar") == []              # ya activó la cuenta: no se reenvía invitación


def test_repetir_el_correo_actual_no_escribe_nada(client, fake):
    _editable(fake)
    r = client.patch("/usuarios/u-1", json={"email": "U1@X.com"}, headers=admin_headers())   # es u1@x.com
    assert r.status_code == 200
    assert _escrituras(fake) == [] and _llamadas(fake, "auth_correo") == []


def test_correo_invalido(client, fake):
    _editable(fake)
    for malo in ("no-es-correo", "a@", ""):
        assert client.patch("/usuarios/u-1", json={"email": malo}, headers=admin_headers()).status_code == 422, malo


def test_correo_ya_usado_por_otra_cuenta_no_cambia_nada(client, fake):
    _editable(fake)
    _confirmada(fake)
    fake.auth_correo_existente = True
    r = client.patch("/usuarios/u-1", json={"email": "ocupado@x.com", "nombres": "Ana"}, headers=admin_headers())
    assert r.status_code == 409 and "Ya existe un usuario con ese correo" in r.json()["detail"]
    assert _escrituras(fake) == []                         # ni siquiera los nombres: todo o nada


def test_si_falla_la_tabla_se_devuelve_el_correo_de_acceso_al_anterior(client, fake):
    _editable(fake)
    _confirmada(fake)

    async def falla(uid, datos):
        raise SupabaseError(400, "violación de restricción")

    fake.actualizar_usuario = falla
    r = client.patch("/usuarios/u-1", json={"email": "nuevo@x.com"}, headers=admin_headers())
    assert r.status_code == 502
    assert [c[2] for c in _llamadas(fake, "auth_correo")] == ["nuevo@x.com", "u1@x.com"]   # cambió y se revirtió
    assert fake.auth_users["u-1"]["email"] == "u1@x.com"


def test_correo_repetido_en_la_tabla_se_explica_y_se_revierte(client, fake):
    _editable(fake)
    _confirmada(fake)

    async def choca(uid, datos):
        raise SupabaseError(409, 'duplicate key value violates unique constraint "usuarios_email_key"')

    fake.actualizar_usuario = choca
    r = client.patch("/usuarios/u-1", json={"email": "nuevo@x.com"}, headers=admin_headers())
    assert r.status_code == 409 and "Ya existe un usuario con ese correo" in r.json()["detail"]
    assert fake.auth_users["u-1"]["email"] == "u1@x.com"


def test_si_no_se_puede_revertir_el_correo_se_avisa(client, fake):
    _editable(fake)
    _confirmada(fake)
    llamadas = {"n": 0}
    original = fake.actualizar_correo_auth

    async def falla_la_segunda(uid, email):
        llamadas["n"] += 1
        if llamadas["n"] == 2:
            raise SupabaseError(500, "caído")
        return await original(uid, email)

    async def falla(uid, datos):
        raise SupabaseError(400, "x")

    fake.actualizar_correo_auth = falla_la_segunda
    fake.actualizar_usuario = falla
    r = client.patch("/usuarios/u-1", json={"email": "nuevo@x.com"}, headers=admin_headers())
    assert r.status_code == 502 and "no se pudo devolver el correo de acceso" in r.json()["detail"]


def test_si_aun_no_acepto_la_invitacion_se_envia_una_nueva_al_correo_nuevo(client, fake):
    _editable(fake)          # u-1 tiene email_confirmed_at = None
    r = client.patch("/usuarios/u-1", json={"email": "nuevo@x.com"}, headers=admin_headers())
    assert r.status_code == 200
    invitar = _llamadas(fake, "invitar")
    assert invitar == [("invitar", "nuevo@x.com", "http://panel.test/aceptar-invitacion")]
    assert "Se envió la invitación" in r.json()["mensaje"]


def test_si_falla_el_envio_de_la_invitacion_el_cambio_igual_queda(client, fake):
    _editable(fake)

    async def sin_correo(email, redirect):
        raise SupabaseError(429, "rate limit")

    fake.invitar_por_correo = sin_correo
    r = client.patch("/usuarios/u-1", json={"email": "nuevo@x.com"}, headers=admin_headers())
    assert r.status_code == 200
    assert fake.filas["u-1"]["email"] == "nuevo@x.com"
    assert "no se pudo enviar la invitación" in r.json()["mensaje"]


def test_no_puedes_cambiar_tu_propio_correo(client, fake):
    r = client.patch(f"/usuarios/{ADMIN_ID}", json={"email": "otro@x.com"}, headers=admin_headers())
    assert r.status_code == 409 and "propio correo" in r.json()["detail"]
    assert _llamadas(fake, "auth_correo") == []


def test_tus_nombres_si_puedes_cambiarlos(client, fake):
    r = client.patch(f"/usuarios/{ADMIN_ID}", json={"nombres": "Susana"}, headers=admin_headers())
    assert r.status_code == 200
    assert _escrituras(fake)[0][2] == {"nombres": "Susana", "updated_by": ADMIN_ID}
