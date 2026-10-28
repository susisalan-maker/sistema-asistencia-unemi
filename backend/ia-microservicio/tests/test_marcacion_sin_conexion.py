"""POST /marcaciones con `sin_conexion = true`: la app marcó sin internet y envía la marcación después.

Aquí `fecha_hora` es la hora del CELULAR y el reloj del servidor es la hora de llegada.
"""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from app.verificacion import ResultadoVerificacion
from tests.conftest import SEDE_ID
from tests.test_marcaciones import (  # noqa: F401  (usuario_marcador es un fixture autouse que se reutiliza)
    DENTRO, H, MARCA_ID, MUY_LEJOS, con_verificador, enviar, tipos_anomalia, usuario_marcador,
)

# Un jueves. Todo en hora de Ecuador (UTC-5).
DIA = "2026-10-15"


def hora(h: str, dia: str = DIA) -> datetime:
    return datetime.fromisoformat(f"{dia}T{h}:00-05:00")


def sin_conexion(tipo="ingreso", marco="08:00", **extra):
    """Cuerpo de una marcación hecha a las `marco` sin internet."""
    return {
        "id": str(uuid4()), "tipo": tipo, "fecha_hora": hora(marco).isoformat(), **DENTRO,
        "origen": "app", "dispositivo_id": "cel-1", "sin_conexion": True, "selfie_b64": "AAAA", **extra,
    }


def llega(client, datos, a="08:30"):
    """La envía; el servidor la recibe a las `a`."""
    return enviar(client, datos, reloj=hora(a))


def guardada(fake):
    return next(iter(fake.marcaciones.values()))


@pytest.fixture(autouse=True)
def verificacion_buena(client):
    return con_verificador(client, ResultadoVerificacion("verificada", 0.9))


# ---------------------------------------------------------------- la hora que se registra
def test_se_registra_con_la_hora_del_celular_y_se_marca_como_sin_conexion(client, fake):
    r = llega(client, sin_conexion(marco="08:00"), a="09:15")
    assert r.status_code == 201
    m = guardada(fake)
    assert datetime.fromisoformat(m["fecha_hora"]) == hora("08:00")      # NO la de llegada
    assert m["sin_conexion"] is True
    assert r.json()["marcacion"]["sin_conexion"] is True
    assert r.json()["marcacion"]["fecha_hora"] == m["fecha_hora"]


def test_una_marcacion_normal_sigue_usando_la_hora_del_servidor(client, fake):
    datos = sin_conexion(marco="07:00")
    datos.update(sin_conexion=False)
    assert llega(client, datos, a="08:00").status_code == 201
    m = guardada(fake)
    assert datetime.fromisoformat(m["fecha_hora"]) == hora("08:00") and m["sin_conexion"] is False


def test_el_horario_se_evalua_con_la_hora_del_celular_no_la_de_llegada(client, fake):
    # Marcó a tiempo (08:00) pero llegó a las 14:00: no hay anomalía de horario.
    assert llega(client, sin_conexion(marco="08:00"), a="14:00").status_code == 201
    assert "fuera_horario" not in tipos_anomalia(fake)


def test_si_marco_tarde_la_anomalia_de_horario_si_aparece(client, fake):
    assert llega(client, sin_conexion(marco="09:30"), a="09:40").status_code == 201
    assert "fuera_horario" in tipos_anomalia(fake)


def test_el_almuerzo_se_mide_con_las_horas_del_celular(client, fake):
    assert llega(client, sin_conexion("ingreso", "08:00"), a="08:05").status_code == 201
    assert llega(client, sin_conexion("salida_almuerzo", "12:00"), a="12:01").status_code == 201
    # Regresó a las 13:00 (1 h, dentro del límite) pero el envío llegó a las 20:00.
    assert llega(client, sin_conexion("entrada_almuerzo", "13:00"), a="20:00").status_code == 201
    assert "almuerzo_excedido" not in tipos_anomalia(fake)


def test_fuera_de_la_zona_se_registra_con_anomalia(client, fake):
    r = llega(client, sin_conexion(**MUY_LEJOS))
    assert r.status_code == 201
    assert "fuera_geocerca" in tipos_anomalia(fake)


# ---------------------------------------------------------------- la hora tiene que ser creíble
def test_una_hora_futura_se_rechaza(client, fake):
    r = llega(client, sin_conexion(marco="10:00"), a="09:00")
    assert r.status_code == 422 and r.json()["codigo"] == "hora_invalida"
    assert fake.marcaciones == {}


def test_se_tolera_un_reloj_adelantado_pocos_minutos(client, fake):
    assert llega(client, sin_conexion(marco="09:04"), a="09:00").status_code == 201


def test_mas_de_cinco_minutos_adelantado_se_rechaza(client):
    assert llega(client, sin_conexion(marco="09:06"), a="09:00").status_code == 422


def test_pasado_el_maximo_de_horas_se_rechaza(client, fake):
    r = enviar(client, sin_conexion(marco="08:00"), reloj=hora("08:01", "2026-10-17"))   # 48 h y 1 min después
    assert r.status_code == 422 and r.json()["codigo"] == "marcacion_expirada"
    assert "48 horas" in r.json()["detail"]
    assert fake.marcaciones == {} and fake.anomalias == []


def test_justo_dentro_del_maximo_se_acepta(client):
    assert enviar(client, sin_conexion(marco="08:00"), reloj=hora("07:59", "2026-10-17")).status_code == 201


def test_el_maximo_se_cambia_en_el_panel(client, fake):
    fake.config["max_horas_sin_conexion"] = 2
    assert llega(client, sin_conexion(marco="08:00"), a="10:30").status_code == 422
    fake.config["max_horas_sin_conexion"] = 4
    assert llega(client, sin_conexion(marco="08:00"), a="10:30").status_code == 201


def test_sin_el_parametro_en_la_base_se_usan_48_horas(client, fake):
    fake.config.pop("max_horas_sin_conexion", None)
    assert enviar(client, sin_conexion(marco="08:00"), reloj=hora("07:00", "2026-10-17")).status_code == 201


# ---------------------------------------------------------------- orden y secuencia
def test_no_se_acepta_una_marcacion_anterior_a_otra_ya_registrada(client, fake):
    assert llega(client, sin_conexion("ingreso", "08:00"), a="08:05").status_code == 201
    assert llega(client, sin_conexion("salida_almuerzo", "12:00"), a="12:05").status_code == 201
    # Una marcación que dice 11:00 pero llega después de la de las 12:00.
    r = llega(client, sin_conexion("entrada_almuerzo", "11:00"), a="13:00")
    assert r.status_code == 409 and r.json()["codigo"] == "fuera_de_orden"
    assert len(fake.marcaciones) == 2


def test_en_orden_cronologico_se_aceptan_las_cuatro(client, fake):
    for tipo, marco in [("ingreso", "08:00"), ("salida_almuerzo", "12:00"), ("entrada_almuerzo", "13:00"), ("salida", "17:00")]:
        assert llega(client, sin_conexion(tipo, marco), a="20:00").status_code == 201
    assert len(fake.marcaciones) == 4


def test_la_secuencia_se_valida_en_el_dia_de_la_marcacion_no_en_el_de_llegada(client, fake):
    # Ayer marcó el ingreso sin conexión; hoy marca otro ingreso normal.
    assert enviar(client, sin_conexion("ingreso", "08:00"), reloj=hora("08:00", "2026-10-16")).status_code == 201
    hoy = {**sin_conexion("ingreso", "08:00"), "sin_conexion": False}
    hoy["fecha_hora"] = hora("08:00", "2026-10-16").isoformat()
    assert enviar(client, hoy, reloj=hora("08:00", "2026-10-16")).status_code == 201


def test_tipo_que_no_corresponde_es_duplicada(client, fake):
    r = llega(client, sin_conexion("salida", "08:00"), a="08:05")
    assert r.status_code == 409
    assert tipos_anomalia(fake) == ["duplicada"]


def test_reenviar_la_misma_marcacion_no_la_duplica(client, fake):
    datos = sin_conexion()
    assert llega(client, datos).status_code == 201
    r = llega(client, datos, a="09:00")
    assert r.status_code == 200 and r.json()["reintento"] is True
    assert len(fake.marcaciones) == 1


def test_el_reintento_se_reconoce_aunque_ya_haya_vencido_el_plazo(client, fake):
    datos = sin_conexion(marco="08:00")
    assert llega(client, datos, a="08:30").status_code == 201
    r = enviar(client, datos, reloj=hora("08:00", "2026-10-30"))
    assert r.status_code == 200 and r.json()["reintento"] is True


# ---------------------------------------------------------------- verificación diferida
def test_si_el_rostro_no_coincide_se_registra_como_fallida_con_anomalia_enlazada(client, fake):
    con_verificador(client, ResultadoVerificacion("fallida", 0.21, "El rostro no coincide con el registrado"))
    r = llega(client, sin_conexion())
    assert r.status_code == 201                                   # NO se pierde la asistencia
    m = guardada(fake)
    assert m["verificacion"] == "fallida" and m["similitud_score"] == 0.21
    a = fake.anomalias[0]
    assert a["tipo"] == "verificacion_fallida" and a["marcacion_id"] == m["id"]   # enlazada para que la revise una persona
    assert "sin conexión" in a["detalle"].lower() and "no coincide" in a["detalle"]
    assert r.json()["anomalias"][0]["tipo"] == "verificacion_fallida"


def test_en_linea_el_rostro_que_no_coincide_sigue_sin_registrarse(client, fake):
    con_verificador(client, ResultadoVerificacion("fallida", 0.21, "El rostro no coincide con el registrado"))
    datos = {**sin_conexion(), "sin_conexion": False}
    r = llega(client, datos)
    assert r.status_code == 422 and r.json()["codigo"] == "rostro_no_verificado"
    assert fake.marcaciones == {}


def test_si_no_se_pudo_analizar_la_selfie_queda_pendiente_con_anomalia(client, fake):
    from fastapi import HTTPException

    class SelfieMala:
        async def verificar(self, usuario, selfie, criterios=None):
            raise HTTPException(422, "La foto está muy oscura. Busca más luz")

    from app.verificacion import get_verificador
    client.app.dependency_overrides[get_verificador] = lambda: SelfieMala()
    r = llega(client, sin_conexion())
    assert r.status_code == 201
    m = guardada(fake)
    assert m["verificacion"] == "pendiente"
    a = fake.anomalias[0]
    assert a["tipo"] == "verificacion_fallida" and a["marcacion_id"] == m["id"] and "muy oscura" in a["detalle"]


def test_en_linea_la_selfie_mala_se_sigue_pidiendo_de_nuevo(client, fake):
    from fastapi import HTTPException
    from app.verificacion import get_verificador

    class SelfieMala:
        async def verificar(self, usuario, selfie, criterios=None):
            raise HTTPException(422, "La foto está muy oscura. Busca más luz")

    client.app.dependency_overrides[get_verificador] = lambda: SelfieMala()
    datos = {**sin_conexion(), "sin_conexion": False}
    assert llega(client, datos).status_code == 422
    assert fake.marcaciones == {}


def test_sin_rostro_registrado_se_rechaza_tambien_sin_conexion(client, fake):
    from fastapi import HTTPException
    from app.verificacion import get_verificador

    class SinRostro:
        async def verificar(self, usuario, selfie, criterios=None):
            raise HTTPException(409, "Primero debes registrar tu rostro para poder marcar")

    client.app.dependency_overrides[get_verificador] = lambda: SinRostro()
    assert llega(client, sin_conexion()).status_code == 409
    assert fake.marcaciones == {}


def test_una_marcacion_verificada_sin_conexion_no_deja_anomalia(client, fake):
    assert llega(client, sin_conexion()).status_code == 201
    assert fake.anomalias == []


# ---------------------------------------------------------------- validación del cuerpo
def test_exige_la_hora_la_selfie_y_la_app(client):
    sin_hora = sin_conexion(); sin_hora.pop("fecha_hora")
    assert client.post("/marcaciones", json=sin_hora, headers=H).status_code == 422
    sin_foto = sin_conexion(); sin_foto.pop("selfie_b64")
    assert client.post("/marcaciones", json=sin_foto, headers=H).status_code == 422
    web = {**sin_conexion(), "origen": "web", "motivo_contingencia": "otro", "dispositivo_id": None}
    assert client.post("/marcaciones", json=web, headers=H).status_code == 422


def test_el_dispositivo_sigue_validandose(client, fake):
    fake.filas[MARCA_ID]["dispositivo_id"] = "mi-celular"
    r = llega(client, sin_conexion(dispositivo_id="otro-celular"))
    assert r.status_code == 403


def test_la_ubicacion_simulada_sigue_rechazandose(client, fake):
    assert llega(client, sin_conexion(ubicacion_simulada=True)).status_code == 403
    assert tipos_anomalia(fake) == ["ubicacion_simulada"]


def test_la_hora_de_llegada_no_se_toca(client, fake):
    # `created_at` lo pone la base (default now()): el servidor no lo envía, así queda la diferencia como evidencia.
    llega(client, sin_conexion(marco="08:00"), a="14:00")
    assert "created_at" not in guardada(fake)


# ---------------------------------------------------------------- ausencias que llegaron antes que la marcación
def ausencia(fake, tipo, dia=DIA, detalle="No marcó la salida"):
    fake.anomalias.append({
        "id": f"aus-{len(fake.anomalias) + 1}", "usuario_id": MARCA_ID, "marcacion_id": None, "tipo": tipo,
        "detector": "regla", "detalle": detalle, "fecha_jornada": dia, "estado": "pendiente",
    })


def test_una_ausencia_previa_del_mismo_dia_recibe_una_nota_y_no_se_cierra(client, fake):
    ausencia(fake, "sin_ingreso", detalle="No marcó nada el jueves")
    assert llega(client, sin_conexion("ingreso", "08:00"), a="23:00").status_code == 201
    a = next(x for x in fake.anomalias if x["tipo"] == "sin_ingreso")
    assert a["estado"] == "pendiente"                                       # sigue abierta: la decide una persona
    assert a["detalle"].startswith("No marcó nada el jueves")
    assert "marcación sin conexión" in a["detalle"] and "ingreso a las 08:00" in a["detalle"]


def test_la_ausencia_de_otro_dia_no_se_toca(client, fake):
    ausencia(fake, "sin_ingreso", dia="2026-10-14", detalle="original")
    llega(client, sin_conexion(), a="09:00")
    assert fake.anomalias[0]["detalle"] == "original"


def test_una_marcacion_normal_no_anota_ausencias(client, fake):
    ausencia(fake, "sin_salida", detalle="original")
    datos = {**sin_conexion(), "sin_conexion": False}
    llega(client, datos, a="08:00")
    assert fake.anomalias[0]["detalle"] == "original"


def test_si_la_nota_falla_la_marcacion_igual_se_registra(client, fake):
    from app.supabase_client import SupabaseError
    ausencia(fake, "sin_salida")

    async def falla(*a, **k):
        raise SupabaseError(500, "caído")

    fake.anotar_anomalia = falla
    assert llega(client, sin_conexion(), a="09:00").status_code == 201
    assert len(fake.marcaciones) == 1


# ---------------------------------------------------------------- lo que se lee después
def test_el_historial_y_hoy_informan_si_fue_sin_conexion(client, fake):
    llega(client, sin_conexion("ingreso", "08:00"), a="08:05")
    cliente_hoy = client.get("/marcaciones/historial?dias=31", headers=H)
    assert cliente_hoy.status_code == 200
    marcas = [m for d in cliente_hoy.json()["dias"] for m in d["marcaciones"]]
    assert marcas and marcas[0]["sin_conexion"] is True


def test_sede_de_la_marcacion(client, fake):
    llega(client, sin_conexion())
    assert guardada(fake)["sede_id"] == SEDE_ID
