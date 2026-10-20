"""Anomalías propias y su justificación: GET /anomalias, GET /anomalias/{id}, POST /anomalias/{id}/justificacion."""
from datetime import datetime, timedelta, timezone

import pytest

UID = "aaaaaaaa-0000-0000-0000-000000000001"
OTRO = "aaaaaaaa-0000-0000-0000-000000000002"
H = {"Authorization": "Bearer token-dev"}
TEXTO = "Se cayó el internet de la sede y no pude marcar la salida"


def en(horas: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=horas)).isoformat()


@pytest.fixture(autouse=True)
def personas(fake):
    fake.tokens["token-dev"] = UID
    fake.tokens["token-otro"] = OTRO
    for u in (UID, OTRO):
        fake.filas[u] = {"id": u, "rol": "usuario", "activo": True, "email": f"{u}@x.com"}


def anomalia(fake, n, usuario=UID, tipo="sin_salida", estado="pendiente", vence=None, creada="2026-10-15T20:00:00+00:00"):
    a = {"id": f"00000000-0000-0000-0000-{n:012d}", "numero": n, "usuario_id": usuario, "tipo": tipo, "estado": estado, "detalle": f"detalle {n}",
         "created_at": creada, "fecha_vencimiento": vence or en(40)}
    fake.anomalias.append(a)
    return a


# ------------------------------------------------------------------ lista
def test_lista_solo_las_mias_ordenadas_de_la_mas_reciente(client, fake):
    anomalia(fake, 1, creada="2026-10-10T20:00:00+00:00")
    anomalia(fake, 2, creada="2026-10-14T20:00:00+00:00")
    anomalia(fake, 3, usuario=OTRO)
    r = client.get("/anomalias", headers=H)
    assert r.status_code == 200
    assert [a["caso"] for a in r.json()] == ["A-2", "A-1"]
    a = r.json()[0]
    assert a["tipo"] == "sin_salida" and a["estado"] == "pendiente" and a["detalle"] == "detalle 2"
    assert a["puede_justificar"] is True and set(a) >= {"id", "creada", "vence"}


def test_puede_justificar_solo_si_pendiente_y_en_plazo(client, fake):
    anomalia(fake, 1)
    anomalia(fake, 2, vence=en(-1))                          # el plazo venció, aún no la marcó el proceso
    anomalia(fake, 3, estado="en_revision")
    anomalia(fake, 4, estado="sin_justificar", vence=en(-5))
    r = client.get("/anomalias", headers=H).json()
    assert {a["caso"]: a["puede_justificar"] for a in r} == {"A-1": True, "A-2": False, "A-3": False, "A-4": False}


def test_sin_sesion_o_siendo_administrador(client, fake):
    assert client.get("/anomalias").status_code == 401
    assert client.get("/anomalias", headers={"Authorization": "Bearer token-admin"}).status_code == 403


# ------------------------------------------------------------------ detalle
def test_detalle_de_una_pendiente_sin_mensajes(client, fake):
    a = anomalia(fake, 1)
    r = client.get(f"/anomalias/{a['id']}", headers=H)
    assert r.status_code == 200
    assert r.json()["mensajes"] == [] and r.json()["decision"] is None and r.json()["puede_justificar"] is True


def test_detalle_con_mensaje_y_decision(client, fake):
    a = anomalia(fake, 1, estado="rechazada")
    fake.justificaciones[a["id"]] = {"id": "j1", "decision_final": "rechazada", "comentario_admin": "No hay respaldo",
                                     "fecha_decision": "2026-10-16T10:00:00+00:00"}
    fake.mensajes.append({"justificacion_id": "j1", "emisor": "usuario", "contenido": TEXTO, "created_at": "2026-10-15T21:00:00+00:00"})
    r = client.get(f"/anomalias/{a['id']}", headers=H).json()
    assert r["estado"] == "rechazada" and r["decision"] == "rechazada" and r["comentario"] == "No hay respaldo"
    assert r["mensajes"] == [{"emisor": "usuario", "contenido": TEXTO, "fecha": "2026-10-15T21:00:00+00:00"}]
    assert r["puede_justificar"] is False


def test_una_escalada_se_ve_como_en_revision_sin_decision(client, fake):
    a = anomalia(fake, 1, estado="en_revision")
    fake.justificaciones[a["id"]] = {"id": "j1", "decision_final": "escalada", "comentario_admin": "interno",
                                     "fecha_decision": "2026-10-16T10:00:00+00:00"}
    r = client.get(f"/anomalias/{a['id']}", headers=H).json()
    assert r["decision"] is None and r["comentario"] is None


def test_la_de_otra_persona_es_404_igual_que_una_inexistente(client, fake):
    a = anomalia(fake, 1, usuario=OTRO)
    assert client.get(f"/anomalias/{a['id']}", headers=H).status_code == 404
    assert client.get("/anomalias/00000000-0000-0000-0000-000000000099", headers=H).status_code == 404
    assert client.get("/anomalias/no-es-uuid", headers=H).status_code == 422


# ------------------------------------------------------------------ justificar
def justificar(client, a, texto=TEXTO, headers=H):
    return client.post(f"/anomalias/{a['id']}/justificacion", json={"texto": texto}, headers=headers)


def test_justificar_pasa_a_en_revision_y_guarda_el_mensaje(client, fake):
    a = anomalia(fake, 1)
    r = justificar(client, a, f"   {TEXTO}   ")
    assert r.status_code == 200
    d = r.json()
    assert d["estado"] == "en_revision" and d["puede_justificar"] is False
    assert d["mensajes"][0]["emisor"] == "usuario" and d["mensajes"][0]["contenido"] == TEXTO     # sin espacios sobrantes
    assert fake.anomalias[0]["estado"] == "en_revision"


def test_texto_muy_corto_o_muy_largo(client, fake):
    a = anomalia(fake, 1)
    for texto in ("", "   ", "corto", "x" * 1001, "   corto   "):
        r = justificar(client, a, texto)
        assert r.status_code == 422 and "10 a 1000" in r.json()["detail"], texto
    assert fake.anomalias[0]["estado"] == "pendiente" and not any(c[0] == "justificar" for c in fake.llamadas)
    assert justificar(client, a, "x" * 1000).status_code == 200


def test_no_se_puede_justificar_la_de_otro(client, fake):
    a = anomalia(fake, 1, usuario=OTRO)
    assert justificar(client, a).status_code == 404
    assert fake.anomalias[0]["estado"] == "pendiente" and fake.justificaciones == {}


def test_no_se_puede_justificar_dos_veces(client, fake):
    a = anomalia(fake, 1)
    assert justificar(client, a).status_code == 200
    r = justificar(client, a, "Otra explicación distinta de la primera")
    assert r.status_code == 409 and "ya fue justificada o resuelta" in r.json()["detail"]
    assert len(fake.mensajes) == 1


@pytest.mark.parametrize("estado", ["en_revision", "justificada", "rechazada", "sin_justificar"])
def test_no_se_justifica_si_ya_no_esta_pendiente(client, fake, estado):
    a = anomalia(fake, 1, estado=estado)
    r = justificar(client, a)
    assert r.status_code == 409 and fake.mensajes == []


def test_no_se_justifica_fuera_de_plazo(client, fake):
    a = anomalia(fake, 1, vence=en(-0.5))
    r = justificar(client, a)
    assert r.status_code == 409 and "plazo venció" in r.json()["detail"]
    assert fake.anomalias[0]["estado"] == "pendiente"


def test_el_administrador_no_justifica_y_sin_sesion_tampoco(client, fake):
    a = anomalia(fake, 1)
    assert justificar(client, a, headers={"Authorization": "Bearer token-admin"}).status_code == 403
    assert client.post(f"/anomalias/{a['id']}/justificacion", json={"texto": TEXTO}).status_code == 401


def test_error_inesperado_de_la_base_es_502(client, fake, monkeypatch):
    from app.supabase_client import SupabaseError
    a = anomalia(fake, 1)

    async def falla(*_):
        raise SupabaseError(500, "boom")
    monkeypatch.setattr(fake, "justificar_anomalia", falla)
    assert justificar(client, a).status_code == 502
