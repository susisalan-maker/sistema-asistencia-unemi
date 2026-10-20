from tests.conftest import ADMIN_ID, admin_headers

NUEVO = {"fecha": "2026-11-02", "nombre": "  Día de Difuntos  "}


def test_exige_administrador(client):
    assert client.post("/feriados", json=NUEVO).status_code == 401
    assert client.post("/feriados", json=NUEVO, headers={"Authorization": "Bearer token-usuario"}).status_code == 403
    assert client.post("/feriados/x/desactivar", headers={"Authorization": "Bearer token-usuario"}).status_code == 403


def test_crear_limpia_el_nombre_y_registra_autor(client, fake):
    r = client.post("/feriados", json=NUEVO, headers=admin_headers())
    assert r.status_code == 201, r.text
    datos = next(c for c in fake.llamadas if c[0] == "insertar_feriado")[1]
    assert datos == {"fecha": "2026-11-02", "nombre": "Día de Difuntos", "created_by": ADMIN_ID}


def test_no_hay_dos_feriados_en_la_misma_fecha(client):
    assert client.post("/feriados", json=NUEVO, headers=admin_headers()).status_code == 201
    r = client.post("/feriados", json=NUEVO, headers=admin_headers())
    assert r.status_code == 409 and "esa fecha" in r.text


def test_datos_invalidos(client):
    for malo in ({"fecha": "2026-13-45"}, {"fecha": "no"}, {"nombre": " a "}, {"nombre": ""}):
        assert client.post("/feriados", json={**NUEVO, **malo}, headers=admin_headers()).status_code == 422, malo
    assert client.post("/feriados", json={"nombre": "Sin fecha"}, headers=admin_headers()).status_code == 422


def test_editar_solo_lo_enviado_y_registra_autor(client, fake):
    fid = client.post("/feriados", json=NUEVO, headers=admin_headers()).json()["id"]
    r = client.patch(f"/feriados/{fid}", json={"nombre": "Difuntos"}, headers=admin_headers())
    assert r.status_code == 200
    assert next(c for c in fake.llamadas if c[0] == "actualizar_feriado")[2] == {"nombre": "Difuntos", "updated_by": ADMIN_ID}
    r = client.patch(f"/feriados/{fid}", json={"fecha": "2026-11-03"}, headers=admin_headers())
    assert fake.feriados[fid]["fecha"] == "2026-11-03"


def test_editar_a_una_fecha_ocupada(client):
    client.post("/feriados", json=NUEVO, headers=admin_headers())
    otro = client.post("/feriados", json={"fecha": "2026-12-25", "nombre": "Navidad"}, headers=admin_headers()).json()["id"]
    assert client.patch(f"/feriados/{otro}", json={"fecha": "2026-11-02"}, headers=admin_headers()).status_code == 409


def test_editar_sin_cambios_o_con_nulos(client):
    fid = client.post("/feriados", json=NUEVO, headers=admin_headers()).json()["id"]
    assert client.patch(f"/feriados/{fid}", json={}, headers=admin_headers()).status_code == 422
    assert client.patch(f"/feriados/{fid}", json={"nombre": None}, headers=admin_headers()).status_code == 422


def test_inexistente(client):
    assert client.patch("/feriados/no-existe", json={"nombre": "Algo"}, headers=admin_headers()).status_code == 404
    assert client.post("/feriados/no-existe/desactivar", headers=admin_headers()).status_code == 404


def test_desactivar_y_activar_no_borran(client, fake):
    fid = client.post("/feriados", json=NUEVO, headers=admin_headers()).json()["id"]
    assert client.post(f"/feriados/{fid}/desactivar", headers=admin_headers()).status_code == 200
    assert fake.feriados[fid]["activo"] is False and fid in fake.feriados
    # repetir no vuelve a escribir
    antes = len([c for c in fake.llamadas if c[0] == "actualizar_feriado"])
    client.post(f"/feriados/{fid}/desactivar", headers=admin_headers())
    assert len([c for c in fake.llamadas if c[0] == "actualizar_feriado"]) == antes
    assert client.post(f"/feriados/{fid}/activar", headers=admin_headers()).status_code == 200
    assert fake.feriados[fid]["activo"] is True


# ---------------------------------------------------------------- varios días seguidos
CARNAVAL = {"fecha": "2027-02-08", "hasta": "2027-02-09", "nombre": "Carnaval"}


def test_un_feriado_de_varios_dias_crea_una_fila_por_dia(client, fake):
    r = client.post("/feriados", json=CARNAVAL, headers=admin_headers())
    assert r.status_code == 201, r.text
    assert r.json() == {"creados": ["2027-02-08", "2027-02-09"], "omitidos": []}
    assert sorted(f["fecha"] for f in fake.feriados.values()) == ["2027-02-08", "2027-02-09"]
    assert all(f["nombre"] == "Carnaval" and f["created_by"] == ADMIN_ID for f in fake.feriados.values())


def test_hasta_igual_a_fecha_es_un_solo_dia(client, fake):
    r = client.post("/feriados", json={**CARNAVAL, "hasta": CARNAVAL["fecha"]}, headers=admin_headers())
    assert r.status_code == 201 and r.json()["fecha"] == "2027-02-08"
    assert len(fake.feriados) == 1


def test_el_rango_respeta_las_fechas_ya_registradas(client, fake):
    client.post("/feriados", json={"fecha": "2027-02-09", "nombre": "Otro"}, headers=admin_headers())
    r = client.post("/feriados", json={**CARNAVAL, "hasta": "2027-02-10"}, headers=admin_headers())
    assert r.status_code == 201
    assert r.json() == {"creados": ["2027-02-08", "2027-02-10"], "omitidos": ["2027-02-09"]}
    assert next(f for f in fake.feriados.values() if f["fecha"] == "2027-02-09")["nombre"] == "Otro"


def test_rango_donde_todo_esta_ocupado(client):
    client.post("/feriados", json=CARNAVAL, headers=admin_headers())
    assert client.post("/feriados", json=CARNAVAL, headers=admin_headers()).status_code == 409


def test_rango_invalido(client, fake):
    # final anterior al inicio
    assert client.post("/feriados", json={**CARNAVAL, "hasta": "2027-02-07"}, headers=admin_headers()).status_code == 422
    # 31 días está permitido; 32 no
    assert client.post("/feriados", json={**CARNAVAL, "fecha": "2027-03-01", "hasta": "2027-03-31"},
                       headers=admin_headers()).status_code == 201
    assert len(fake.feriados) == 31
    assert client.post("/feriados", json={**CARNAVAL, "fecha": "2027-05-01", "hasta": "2027-06-01"},
                       headers=admin_headers()).status_code == 422
    assert client.post("/feriados", json={**CARNAVAL, "hasta": "no"}, headers=admin_headers()).status_code == 422


def test_error_a_mitad_del_rango_informa_lo_ya_creado(client, fake, monkeypatch):
    from app.supabase_client import SupabaseError
    original = fake.insertar_feriado
    async def falla_en_el_segundo(datos):
        if datos["fecha"] == "2027-02-09":
            raise SupabaseError(500, "caída")
        return await original(datos)
    monkeypatch.setattr(fake, "insertar_feriado", falla_en_el_segundo)
    r = client.post("/feriados", json=CARNAVAL, headers=admin_headers())
    assert r.status_code == 502 and "Ya se crearon 1 día" in r.text
