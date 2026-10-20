"""Feriados: un solo registro por feriado, de `fecha_inicio` a `fecha_fin`."""
from tests.conftest import ADMIN_ID, admin_headers

NUEVO = {"fecha_inicio": "2026-11-02", "nombre": "  Día de Difuntos  "}
CARNAVAL = {"fecha_inicio": "2027-02-08", "fecha_fin": "2027-02-09", "nombre": "Carnaval"}


def crear(client, cuerpo):
    return client.post("/feriados", json=cuerpo, headers=admin_headers())


def test_exige_administrador(client):
    assert client.post("/feriados", json=NUEVO).status_code == 401
    assert client.post("/feriados", json=NUEVO, headers={"Authorization": "Bearer token-usuario"}).status_code == 403
    assert client.post("/feriados/x/desactivar", headers={"Authorization": "Bearer token-usuario"}).status_code == 403


# ---------------------------------------------------------------- crear
def test_un_dia_si_no_se_envia_fecha_fin(client, fake):
    r = crear(client, NUEVO)
    assert r.status_code == 201, r.text
    datos = next(c for c in fake.llamadas if c[0] == "insertar_feriado")[1]
    assert datos == {
        "fecha_inicio": "2026-11-02", "fecha_fin": "2026-11-02", "nombre": "Día de Difuntos", "created_by": ADMIN_ID,
    }


def test_varios_dias_son_un_solo_registro(client, fake):
    r = crear(client, CARNAVAL)
    assert r.status_code == 201, r.text
    assert len(fake.feriados) == 1
    fila = next(iter(fake.feriados.values()))
    assert (fila["fecha_inicio"], fila["fecha_fin"], fila["nombre"]) == ("2027-02-08", "2027-02-09", "Carnaval")


def test_no_se_cruzan_dos_feriados_activos(client):
    assert crear(client, CARNAVAL).status_code == 201
    for cruce in (
        {"fecha_inicio": "2027-02-09", "nombre": "Otro"},                              # toca el último día
        {"fecha_inicio": "2027-02-07", "fecha_fin": "2027-02-08", "nombre": "Otro"},   # toca el primero
        {"fecha_inicio": "2027-02-01", "fecha_fin": "2027-02-28", "nombre": "Otro"},   # lo envuelve
    ):
        r = crear(client, cruce)
        assert r.status_code == 409 and "se cruza" in r.text, cruce
    # pegados pero sin cruzarse sí se puede
    assert crear(client, {"fecha_inicio": "2027-02-10", "nombre": "Otro 2"}).status_code == 201
    assert crear(client, {"fecha_inicio": "2027-02-07", "nombre": "Otro 3"}).status_code == 201


def test_un_feriado_desactivado_no_bloquea_las_fechas(client, fake):
    fid = crear(client, CARNAVAL).json()["id"]
    client.post(f"/feriados/{fid}/desactivar", headers=admin_headers())
    assert crear(client, CARNAVAL).status_code == 201


def test_datos_invalidos(client, fake):
    malos = (
        {"fecha_inicio": "2026-13-45"}, {"fecha_inicio": "no"}, {"nombre": " a "}, {"nombre": ""},
        {"fecha_fin": "2026-11-01"},                       # fin antes del inicio
        {"fecha_fin": "2026-12-03"},                       # 32 días
        {"fecha_fin": "no"},
    )
    for malo in malos:
        assert crear(client, {**NUEVO, **malo}).status_code == 422, malo
    assert crear(client, {"nombre": "Sin fecha"}).status_code == 422
    assert not fake.feriados


def test_treinta_y_un_dias_es_el_maximo(client):
    assert crear(client, {**NUEVO, "fecha_fin": "2026-12-02"}).status_code == 201   # 2 nov a 2 dic = 31 días


# ---------------------------------------------------------------- editar
def test_editar_solo_lo_enviado_y_registra_autor(client, fake):
    fid = crear(client, NUEVO).json()["id"]
    r = client.patch(f"/feriados/{fid}", json={"nombre": "Difuntos"}, headers=admin_headers())
    assert r.status_code == 200
    assert next(c for c in fake.llamadas if c[0] == "actualizar_feriado")[2] == {"nombre": "Difuntos", "updated_by": ADMIN_ID}
    r = client.patch(f"/feriados/{fid}", json={"fecha_fin": "2026-11-04"}, headers=admin_headers())
    assert r.status_code == 200
    assert (fake.feriados[fid]["fecha_inicio"], fake.feriados[fid]["fecha_fin"]) == ("2026-11-02", "2026-11-04")


def test_editar_valida_el_rango_resultante_contra_la_fila_actual(client, fake):
    fid = crear(client, CARNAVAL).json()["id"]
    # solo el inicio, pero posterior al fin que ya tiene
    assert client.patch(f"/feriados/{fid}", json={"fecha_inicio": "2027-02-20"}, headers=admin_headers()).status_code == 422
    # solo el fin, anterior al inicio que ya tiene
    assert client.patch(f"/feriados/{fid}", json={"fecha_fin": "2027-02-01"}, headers=admin_headers()).status_code == 422
    # más de 31 días
    assert client.patch(f"/feriados/{fid}", json={"fecha_fin": "2027-04-01"}, headers=admin_headers()).status_code == 422
    assert (fake.feriados[fid]["fecha_inicio"], fake.feriados[fid]["fecha_fin"]) == ("2027-02-08", "2027-02-09")


def test_editar_hacia_fechas_ocupadas(client):
    crear(client, NUEVO)
    otro = crear(client, {"fecha_inicio": "2026-12-25", "nombre": "Navidad"}).json()["id"]
    r = client.patch(f"/feriados/{otro}", json={"fecha_inicio": "2026-11-01", "fecha_fin": "2026-11-02"}, headers=admin_headers())
    assert r.status_code == 409 and "se cruza" in r.text


def test_editar_su_propio_rango_no_choca_consigo_mismo(client):
    fid = crear(client, CARNAVAL).json()["id"]
    assert client.patch(f"/feriados/{fid}", json={"fecha_fin": "2027-02-10"}, headers=admin_headers()).status_code == 200


def test_editar_sin_cambios_o_con_nulos(client):
    fid = crear(client, NUEVO).json()["id"]
    assert client.patch(f"/feriados/{fid}", json={}, headers=admin_headers()).status_code == 422
    assert client.patch(f"/feriados/{fid}", json={"nombre": None}, headers=admin_headers()).status_code == 422
    assert client.patch(f"/feriados/{fid}", json={"fecha_fin": None}, headers=admin_headers()).status_code == 422


def test_inexistente(client):
    assert client.patch("/feriados/no-existe", json={"nombre": "Algo"}, headers=admin_headers()).status_code == 404
    assert client.post("/feriados/no-existe/desactivar", headers=admin_headers()).status_code == 404


# ---------------------------------------------------------------- activar y desactivar
def test_desactivar_y_activar_no_borran(client, fake):
    fid = crear(client, NUEVO).json()["id"]
    assert client.post(f"/feriados/{fid}/desactivar", headers=admin_headers()).status_code == 200
    assert fake.feriados[fid]["activo"] is False and fid in fake.feriados
    # repetir no vuelve a escribir
    antes = len([c for c in fake.llamadas if c[0] == "actualizar_feriado"])
    client.post(f"/feriados/{fid}/desactivar", headers=admin_headers())
    assert len([c for c in fake.llamadas if c[0] == "actualizar_feriado"]) == antes
    assert client.post(f"/feriados/{fid}/activar", headers=admin_headers()).status_code == 200
    assert fake.feriados[fid]["activo"] is True


def test_no_se_puede_activar_uno_que_se_cruza_con_otro_activo(client, fake):
    viejo = crear(client, CARNAVAL).json()["id"]
    client.post(f"/feriados/{viejo}/desactivar", headers=admin_headers())
    crear(client, CARNAVAL)                                   # otro activo en las mismas fechas
    r = client.post(f"/feriados/{viejo}/activar", headers=admin_headers())
    assert r.status_code == 409 and "se cruza" in r.text
    assert fake.feriados[viejo]["activo"] is False
