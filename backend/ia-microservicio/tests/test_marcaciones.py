"""POST /marcaciones: el flujo completo contra un Supabase simulado."""
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.biometria import Criterios
from app.routers.marcaciones import get_reloj
from app.supabase_client import SupabaseError
from app.verificacion import ResultadoVerificacion, get_verificador
from tests.conftest import BLOQUE_ID, SEDE_ID

MARCA_ID = "55555555-5555-5555-5555-555555555555"
H = {"Authorization": "Bearer token-marca"}
# Dentro del bloque de la sede de pruebas (centro -2.14, -79.6; radio 60 m).
DENTRO = {"latitud": -2.14, "longitud": -79.6}
# A ~333 m al norte: dentro del círculo de la sede (400 m) pero fuera del bloque.
FUERA_DEL_BLOQUE = {"latitud": -2.137, "longitud": -79.6}
MUY_LEJOS = {"latitud": -1.14, "longitud": -79.6}  # ~111 km


@pytest.fixture(autouse=True)
def usuario_marcador(fake):
    fake.tokens["token-marca"] = MARCA_ID
    fake.filas[MARCA_ID] = {
        "id": MARCA_ID, "rol": "usuario", "activo": True, "email": "m@x.com", "sede_id": SEDE_ID,
        "jornada_inicio": "08:00:00", "jornada_fin": "17:00:00", "dias_laborables": [1, 2, 3, 4, 5],
        "dispositivo_id": None,
    }


def cuerpo(tipo="ingreso", hora="08:00", dia="2026-10-15", **extra):
    base = {"id": str(uuid4()), "tipo": tipo, "fecha_hora": f"{dia}T{hora}:00-05:00", **DENTRO}
    return {**base, **extra}


def enviar(client, datos, headers=H, reloj=None):
    """Envía la marcación con el reloj del SERVIDOR fijo en `reloj` (por omisión, la hora que trae `fecha_hora`)."""
    momento = reloj or (datetime.fromisoformat(datos["fecha_hora"]) if "fecha_hora" in datos else datetime.now(timezone.utc))
    client.app.dependency_overrides[get_reloj] = lambda: (lambda: momento)
    return client.post("/marcaciones", json=datos, headers=headers)


def marcar(client, **kw):
    return enviar(client, cuerpo(**kw))


def tipos_anomalia(fake):
    return [a["tipo"] for a in fake.anomalias]


# ---------------------------------------------------------------- acceso
def test_exige_sesion(client):
    assert client.post("/marcaciones", json=cuerpo()).status_code == 401
    assert client.post("/marcaciones", json=cuerpo(), headers={"Authorization": "Bearer x"}).status_code == 401


def test_un_administrador_no_marca(client):
    r = client.post("/marcaciones", json=cuerpo(), headers={"Authorization": "Bearer token-admin"})
    assert r.status_code == 403


def test_un_usuario_desactivado_no_marca(client, fake):
    fake.filas[MARCA_ID]["activo"] = False
    assert marcar(client).status_code == 403


# ---------------------------------------------------------------- camino feliz
def test_jornada_completa_sin_anomalias(client, fake):
    for tipo, hora in [("ingreso", "08:00"), ("salida_almuerzo", "12:30"),
                       ("entrada_almuerzo", "13:15"), ("salida", "17:00")]:
        r = marcar(client, tipo=tipo, hora=hora)
        assert r.status_code == 201, (tipo, r.text)
        assert r.json()["anomalias"] == [] and r.json()["reintento"] is False
        assert r.json()["marcacion"]["bloque_id"] == BLOQUE_ID
    assert len(fake.marcaciones) == 4 and fake.anomalias == []
    guardada = next(iter(fake.marcaciones.values()))
    assert guardada["usuario_id"] == MARCA_ID and guardada["sede_id"] == SEDE_ID
    assert guardada["verificacion"] == "verificada" and guardada["fecha_hora"].endswith("+00:00")


def test_la_hora_se_guarda_en_utc(client, fake):
    marcar(client, hora="08:00")
    assert next(iter(fake.marcaciones.values()))["fecha_hora"] == "2026-10-15T13:00:00+00:00"


# ---------------------------------------------------------------- reintentos
def test_reintentar_el_mismo_id_no_duplica(client, fake):
    datos = cuerpo()
    assert enviar(client, datos).status_code == 201
    r = enviar(client, datos)
    assert r.status_code == 200 and r.json()["reintento"] is True
    assert len(fake.marcaciones) == 1 and fake.anomalias == []


def test_un_id_de_otro_usuario_se_rechaza(client, fake):
    fake.marcaciones["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"] = {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "usuario_id": "otro", "tipo": "ingreso",
        "fecha_hora": "2026-10-15T13:00:00+00:00"}
    r = marcar(client, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    assert r.status_code == 409


def test_dos_envios_simultaneos_del_mismo_id(client, fake):
    """La app reenvía y los dos llegan a la vez: el segundo choca con la llave primaria."""
    datos = cuerpo()
    original = fake.insertar_marcacion

    async def guarda_y_choca(d):
        await original(d)
        raise SupabaseError(409, 'duplicate key value violates unique constraint "marcaciones_pkey"')

    fake.insertar_marcacion = guarda_y_choca
    r = enviar(client, datos)
    assert r.status_code == 200 and r.json()["reintento"] is True


# ---------------------------------------------------------------- secuencia
def test_fuera_de_secuencia_no_se_registra_y_genera_duplicada(client, fake):
    r = marcar(client, tipo="salida")
    assert r.status_code == 409 and "ingreso" in r.text
    assert fake.marcaciones == {}
    assert tipos_anomalia(fake) == ["duplicada"] and fake.anomalias[0]["marcacion_id"] is None


def test_repetir_la_misma_marcacion_es_duplicada(client, fake):
    assert marcar(client, tipo="ingreso").status_code == 201
    r = marcar(client, tipo="ingreso", hora="08:01")
    assert r.status_code == 409
    assert len(fake.marcaciones) == 1 and tipos_anomalia(fake) == ["duplicada"]


def test_la_quinta_marcacion_del_dia_es_duplicada(client, fake):
    for tipo, hora in [("ingreso", "08:00"), ("salida_almuerzo", "12:30"),
                       ("entrada_almuerzo", "13:15"), ("salida", "17:00")]:
        marcar(client, tipo=tipo, hora=hora)
    r = marcar(client, tipo="salida", hora="17:05")
    assert r.status_code == 409 and "ya está registrada" in r.text
    assert len(fake.marcaciones) == 4 and tipos_anomalia(fake) == ["duplicada"]


def test_el_dia_siguiente_empieza_otra_jornada(client, fake):
    assert marcar(client, tipo="ingreso", dia="2026-10-15", hora="08:00").status_code == 201
    assert marcar(client, tipo="ingreso", dia="2026-10-16", hora="08:00").status_code == 201


def test_el_dia_se_cuenta_en_hora_local(client, fake):
    # 23:50 del 15 y 00:10 del 16, ambas hora de Ecuador: son jornadas distintas aunque en UTC
    # sean las 04:50 y 05:10 del día 16.
    assert marcar(client, tipo="ingreso", dia="2026-10-15", hora="23:50").status_code == 201
    assert marcar(client, tipo="ingreso", dia="2026-10-16", hora="00:10").status_code == 201


# ---------------------------------------------------------------- zona
def test_fuera_de_la_zona_se_registra_con_anomalia(client, fake):
    r = marcar(client, **FUERA_DEL_BLOQUE)
    assert r.status_code == 201
    assert r.json()["marcacion"]["bloque_id"] is None
    assert [a["tipo"] for a in r.json()["anomalias"]] == ["fuera_geocerca"]
    assert len(fake.marcaciones) == 1
    assert fake.anomalias[0]["marcacion_id"] == next(iter(fake.marcaciones))
    assert fake.anomalias[0]["detector"] == "regla" and "Bloque M" in fake.anomalias[0]["detalle"]


def test_si_la_sede_permite_marcar_fuera_no_hay_anomalia(client, fake):
    fake.sedes[SEDE_ID]["permite_fuera_geocerca"] = True
    r = marcar(client, **MUY_LEJOS)
    assert r.status_code == 201 and r.json()["marcacion"]["bloque_id"] is None
    assert "fuera_geocerca" not in tipos_anomalia(fake)


def test_sin_bloques_activos_vale_el_circulo_de_la_sede(client, fake):
    fake.bloques[BLOQUE_ID]["activo"] = False
    r = marcar(client, **FUERA_DEL_BLOQUE)  # 333 m < 400 m de la sede
    assert r.status_code == 201 and r.json()["anomalias"] == []
    assert r.json()["marcacion"]["bloque_id"] is None
    assert marcar(client, tipo="salida_almuerzo", hora="12:30", **MUY_LEJOS).json()["anomalias"][0]["tipo"] \
        == "fuera_geocerca"


def test_una_sede_desactivada_no_deja_marcar(client, fake):
    fake.sedes[SEDE_ID]["activa"] = False
    assert marcar(client).status_code == 409 and fake.marcaciones == {}


# ---------------------------------------------------------------- días laborables y feriados
# 2026-10-15 es jueves; 2026-10-17 sábado; 2026-10-18 domingo; 2026-10-19 lunes.
def test_marcar_un_sabado_se_registra_con_anomalia_de_dia_no_laborable(client, fake):
    r = marcar(client, dia="2026-10-17", hora="09:00")
    assert r.status_code == 201
    assert [a["tipo"] for a in r.json()["anomalias"]] == ["dia_no_laborable"]
    assert "sábado" in r.json()["anomalias"][0]["detalle"] and "lunes a viernes" in r.json()["anomalias"][0]["detalle"]
    assert len(fake.marcaciones) == 1


def test_un_dia_no_laborable_no_suma_fuera_horario(client, fake):
    # Ingreso a las 10:30 un domingo: solo «día no laborable», no también «llegó tarde».
    r = marcar(client, dia="2026-10-18", hora="10:30")
    assert [a["tipo"] for a in r.json()["anomalias"]] == ["dia_no_laborable"]


def test_el_dia_de_la_semana_se_toma_en_hora_local(client):
    # Viernes 23:30 local = sábado 04:30 UTC: sigue siendo viernes (laborable).
    r = marcar(client, tipo="ingreso", dia="2026-10-16", hora="23:30")
    assert "dia_no_laborable" not in [a["tipo"] for a in r.json()["anomalias"]]


def test_los_dias_laborables_son_por_usuario(client, fake):
    fake.filas[MARCA_ID]["dias_laborables"] = [1, 2, 3, 4, 6]  # trabaja sábados, no viernes
    assert marcar(client, dia="2026-10-17", hora="08:00").json()["anomalias"] == []                      # sábado
    r = marcar(client, dia="2026-10-16", hora="08:00")                                                    # viernes
    assert [a["tipo"] for a in r.json()["anomalias"]] == ["dia_no_laborable"]


def test_un_feriado_activo_genera_anomalia_aunque_sea_dia_laborable(client, fake):
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-15", "fecha_fin": "2026-10-15", "nombre": "Feriado de prueba", "activo": True}
    r = marcar(client, dia="2026-10-15", hora="08:00")
    assert [a["tipo"] for a in r.json()["anomalias"]] == ["dia_no_laborable"]
    assert "Feriado de prueba" in r.json()["anomalias"][0]["detalle"]


def test_un_feriado_desactivado_no_cuenta(client, fake):
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-15", "fecha_fin": "2026-10-15", "nombre": "X", "activo": False}
    assert marcar(client, dia="2026-10-15", hora="08:00").json()["anomalias"] == []


def test_el_feriado_se_busca_por_fecha_local(client, fake):
    # 22:00 hora local del 14 es ya el día 15 en UTC; el feriado del 15 NO debe aplicarse.
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-15", "fecha_fin": "2026-10-15", "nombre": "X", "activo": True}
    r = marcar(client, tipo="ingreso", dia="2026-10-14", hora="22:00")
    assert "dia_no_laborable" not in [a["tipo"] for a in r.json()["anomalias"]]


@pytest.mark.parametrize("dia, cuenta", [("2026-10-13", False), ("2026-10-14", True), ("2026-10-15", True), ("2026-10-16", True), ("2026-10-19", False)])
def test_un_feriado_de_varios_dias_cubre_todo_el_rango(client, fake, dia, cuenta):
    # Un solo registro del 14 al 16 (ambos incluidos). El 13 y el 19 son lunes laborables sin feriado.
    fake.feriados["f1"] = {"id": "f1", "fecha_inicio": "2026-10-14", "fecha_fin": "2026-10-16", "nombre": "Puente", "activo": True}
    r = marcar(client, dia=dia, hora="08:00")
    assert ("dia_no_laborable" in [a["tipo"] for a in r.json()["anomalias"]]) is cuenta


# ---------------------------------------------------------------- horario y almuerzo
def test_ingreso_tarde_genera_fuera_horario(client, fake):
    r = marcar(client, hora="08:30")
    assert r.status_code == 201 and tipos_anomalia(fake) == ["fuera_horario"]
    assert "08:30" in fake.anomalias[0]["detalle"] and "08:10" in fake.anomalias[0]["detalle"]


def test_la_tolerancia_sale_de_la_configuracion(client, fake):
    fake.config["tolerancia_min"] = 45
    assert marcar(client, hora="08:30").json()["anomalias"] == []


def test_salida_temprana_genera_fuera_horario(client, fake):
    for tipo, hora in [("ingreso", "08:00"), ("salida_almuerzo", "12:30"), ("entrada_almuerzo", "13:15")]:
        marcar(client, tipo=tipo, hora=hora)
    assert marcar(client, tipo="salida", hora="16:00").json()["anomalias"][0]["tipo"] == "fuera_horario"


def test_almuerzo_excedido(client, fake):
    marcar(client, tipo="ingreso", hora="08:00")
    marcar(client, tipo="salida_almuerzo", hora="12:00")
    r = marcar(client, tipo="entrada_almuerzo", hora="13:20")  # 80 min > 60 + 10
    assert r.status_code == 201 and tipos_anomalia(fake) == ["almuerzo_excedido"]
    assert marcar(client, tipo="salida", hora="17:00").json()["anomalias"] == []


def test_almuerzo_dentro_del_maximo_con_tolerancia(client, fake):
    marcar(client, tipo="ingreso", hora="08:00")
    marcar(client, tipo="salida_almuerzo", hora="12:00")
    assert marcar(client, tipo="entrada_almuerzo", hora="13:10").json()["anomalias"] == []  # 70 = 60 + 10


# ---------------------------------------------------------------- desplazamiento
def test_desplazamiento_inusual(client, fake):
    marcar(client, tipo="ingreso", hora="08:00")
    r = marcar(client, tipo="salida_almuerzo", hora="08:30", **MUY_LEJOS)  # ~111 km en 30 min
    assert sorted(a["tipo"] for a in r.json()["anomalias"]) == ["desplazamiento_inusual", "fuera_geocerca"]


def _previa(fake, fecha_hora_utc):
    fake.marcaciones["previa"] = {
        "id": "previa", "usuario_id": MARCA_ID, "tipo": "salida", "origen": "app", "latitud": -1.14,
        "longitud": -79.6, "fecha_hora": fecha_hora_utc}   # ~111 km de la sede


def test_el_desplazamiento_se_mide_contra_la_marcacion_anterior_aunque_sea_de_otro_dia(client, fake):
    # Salida a las 23:50 hora local del 14, a ~111 km; ingreso a las 00:10 del 15: 111 km en 20 min.
    _previa(fake, "2026-10-15T04:50:00+00:00")
    r = marcar(client, tipo="ingreso", dia="2026-10-15", hora="00:10")
    assert "desplazamiento_inusual" in [a["tipo"] for a in r.json()["anomalias"]]


def test_un_viaje_largo_con_tiempo_suficiente_no_es_inusual(client, fake):
    # Misma distancia, pero el ingreso es a las 08:00: más de 8 horas después, ~13 km/h.
    _previa(fake, "2026-10-15T04:50:00+00:00")
    r = marcar(client, tipo="ingreso", hora="08:00")
    assert "desplazamiento_inusual" not in [a["tipo"] for a in r.json()["anomalias"]]


# ---------------------------------------------------------------- contingencia web
def test_la_marcacion_web_exige_motivo_y_no_lleva_dispositivo(client):
    assert marcar(client, origen="web").status_code == 422
    assert marcar(client, origen="web", motivo_contingencia="sin_bateria", dispositivo_id="d1").status_code == 422
    assert marcar(client, origen="app", motivo_contingencia="sin_bateria").status_code == 422
    assert marcar(client, origen="web", motivo_contingencia="inventado").status_code == 422


def test_marcacion_web_valida(client, fake):
    r = marcar(client, origen="web", motivo_contingencia="celular_perdido")
    assert r.status_code == 201 and r.json()["anomalias"] == []
    guardada = next(iter(fake.marcaciones.values()))
    assert guardada["origen"] == "web" and guardada["motivo_contingencia"] == "celular_perdido"
    assert guardada["dispositivo_id"] is None


def test_uso_recurrente_web(client, fake):
    for i in range(3):  # tres marcaciones web previas en los últimos 30 días
        fake.marcaciones[f"w{i}"] = {
            "id": f"w{i}", "usuario_id": MARCA_ID, "origen": "web", "tipo": "ingreso", "latitud": -2.14,
            "longitud": -79.6, "fecha_hora": f"2026-10-0{i + 1}T13:00:00+00:00"}
    r = marcar(client, origen="web", motivo_contingencia="otro")
    assert "uso_recurrente_web" in [a["tipo"] for a in r.json()["anomalias"]]


def test_las_marcaciones_web_antiguas_no_cuentan(client, fake):
    for i in range(3):
        fake.marcaciones[f"w{i}"] = {
            "id": f"w{i}", "usuario_id": MARCA_ID, "origen": "web", "tipo": "ingreso", "latitud": -2.14,
            "longitud": -79.6, "fecha_hora": f"2026-08-0{i + 1}T13:00:00+00:00"}  # hace más de 30 días
    r = marcar(client, origen="web", motivo_contingencia="otro")
    assert r.json()["anomalias"] == []


# ---------------------------------------------------------------- rostro
def con_verificador(client, resultado):
    class Falso:
        async def verificar(self, usuario, selfie, criterios=None):
            self.criterios = criterios
            return resultado

    falso = Falso()
    client.app.dependency_overrides[get_verificador] = lambda: falso
    return falso


def test_los_umbrales_del_panel_llegan_al_verificador(client, fake):
    v = con_verificador(client, ResultadoVerificacion("verificada", 0.9))
    fake.config.update(rostro_umbral="0.55", giro_max_marcacion=0.25, brillo_min=70, nitidez_min=80)
    assert marcar(client).status_code == 201
    c = v.criterios
    assert (c.rostro_umbral, c.giro_marcacion, c.brillo_min, c.nitidez_min) == (0.55, 0.25, 70, 80)


def test_sin_umbrales_en_la_base_se_usan_los_de_siempre(client, fake):
    v = con_verificador(client, ResultadoVerificacion("verificada", 0.9))
    assert marcar(client).status_code == 201
    assert v.criterios == Criterios()


def test_rostro_fallido_no_registra_y_cuenta_los_intentos(client, fake):
    con_verificador(client, ResultadoVerificacion("fallida", 0.2, "no es una cara real"))
    r = marcar(client)
    assert r.status_code == 422 and "rostro" in r.text and "no es una cara real" in r.text
    assert fake.marcaciones == {}
    assert tipos_anomalia(fake) == ["verificacion_fallida"]
    assert fake.anomalias[0]["marcacion_id"] is None and fake.anomalias[0]["intentos_fallidos"] == 1
    marcar(client)
    assert fake.anomalias[1]["intentos_fallidos"] == 2


def test_rostro_fallido_devuelve_codigo_e_intento_para_la_app(client, fake):
    con_verificador(client, ResultadoVerificacion("fallida", 0.2, None))
    primero = marcar(client).json()
    segundo = marcar(client).json()
    assert primero["codigo"] == "rostro_no_verificado" and primero["intento"] == 1 and "No pudimos verificar" in primero["detail"]
    assert segundo["intento"] == 2


def test_rostro_pendiente_se_registra_sin_anomalia(client, fake):
    con_verificador(client, ResultadoVerificacion("pendiente"))
    assert marcar(client).status_code == 201
    assert next(iter(fake.marcaciones.values()))["verificacion"] == "pendiente" and fake.anomalias == []


def test_el_puntaje_de_similitud_se_guarda(client, fake):
    con_verificador(client, ResultadoVerificacion("verificada", 0.93))
    marcar(client)
    assert next(iter(fake.marcaciones.values()))["similitud_score"] == 0.93


# ---------------------------------------------------------------- dispositivo y datos
def test_dispositivo_distinto_al_vinculado(client, fake):
    fake.filas[MARCA_ID]["dispositivo_id"] = "mi-celular"
    assert marcar(client, dispositivo_id="otro-celular").status_code == 403
    assert marcar(client, dispositivo_id="mi-celular").status_code == 201


def test_sin_dispositivo_vinculado_se_acepta_cualquiera(client):
    assert marcar(client, dispositivo_id="cualquiera").status_code == 201


# ---------------------------------------------------------------- la hora la pone el servidor
def test_la_hora_del_celular_se_ignora_y_se_guarda_la_del_servidor(client, fake):
    """El celular dice 08:00 (puntual) pero el servidor marca 08:30: queda 08:30 y la tardanza se registra."""
    r = enviar(client, cuerpo(hora="08:00"), reloj=datetime(2026, 10, 15, 13, 30, tzinfo=timezone.utc))
    assert r.status_code == 201
    assert next(iter(fake.marcaciones.values()))["fecha_hora"] == "2026-10-15T13:30:00+00:00"
    assert tipos_anomalia(fake) == ["fuera_horario"]


def test_adelantar_el_reloj_del_celular_tampoco_cambia_nada(client, fake):
    r = enviar(client, cuerpo(hora="23:59", dia="2026-10-16"), reloj=datetime(2026, 10, 15, 13, 0, tzinfo=timezone.utc))
    assert r.status_code == 201
    assert next(iter(fake.marcaciones.values()))["fecha_hora"] == "2026-10-15T13:00:00+00:00"
    assert fake.anomalias == []


def test_no_hace_falta_enviar_la_hora_del_celular(client, fake):
    datos = {k: v for k, v in cuerpo().items() if k != "fecha_hora"}
    r = enviar(client, datos, reloj=datetime(2026, 10, 15, 13, 0, tzinfo=timezone.utc))
    assert r.status_code == 201
    assert next(iter(fake.marcaciones.values()))["fecha_hora"] == "2026-10-15T13:00:00+00:00"


# ---------------------------------------------------------------- ubicación simulada
def test_ubicacion_simulada_no_se_registra_y_deja_la_anomalia(client, fake):
    r = marcar(client, ubicacion_simulada=True)
    assert r.status_code == 403 and "simulada" in r.json()["detail"]
    assert fake.marcaciones == {}
    assert tipos_anomalia(fake) == ["ubicacion_simulada"]
    assert fake.anomalias[0]["usuario_id"] == MARCA_ID and fake.anomalias[0]["marcacion_id"] is None


def test_tras_el_aviso_de_gps_falso_se_puede_marcar_sin_el(client, fake):
    assert marcar(client, ubicacion_simulada=True).status_code == 403
    assert marcar(client, ubicacion_simulada=False).status_code == 201
    assert len(fake.marcaciones) == 1


def test_sin_el_campo_se_asume_ubicacion_real(client):
    assert marcar(client).status_code == 201


@pytest.mark.parametrize(
    "malo",
    [
        {"fecha_hora": "2026-10-15T08:00:00"},          # sin zona horaria
        {"latitud": 91}, {"longitud": -181}, {"tipo": "almuerzo"}, {"id": "no-es-uuid"},
        {"precision_m": -1},
    ],
)
def test_datos_invalidos(client, malo):
    assert enviar(client, {**cuerpo(), **malo}).status_code == 422


def test_un_fallo_de_supabase_responde_502(client, fake):
    async def falla():
        raise SupabaseError(500, "caído")

    fake.configuracion = falla
    r = marcar(client)
    assert r.status_code == 502 and fake.marcaciones == {}


# ---------------------------------------------------------------- zona (GET /marcaciones/zona)
def zona(client, lat, lon, headers=H):
    return client.get("/marcaciones/zona", params={"latitud": lat, "longitud": lon}, headers=headers)


def test_zona_dentro_del_bloque(client):
    r = zona(client, **{"lat": DENTRO["latitud"], "lon": DENTRO["longitud"]})
    assert r.status_code == 200
    assert r.json() == {"dentro": True, "sede": "Matriz Milagro", "lugar": "Bloque M", "distancia_m": 0, "radio_m": 60,
                        "centro": {"latitud": DENTRO["latitud"], "longitud": DENTRO["longitud"]}, "permite_fuera": False}


def test_zona_fuera_del_bloque_informa_la_distancia(client):
    j = zona(client, FUERA_DEL_BLOQUE["latitud"], FUERA_DEL_BLOQUE["longitud"]).json()
    assert j["dentro"] is False and j["lugar"] == "Bloque M" and j["radio_m"] == 60 and 300 < j["distancia_m"] < 360


def test_zona_sin_bloques_mide_contra_la_sede(client, fake):
    fake.bloques.clear()
    j = zona(client, DENTRO["latitud"], DENTRO["longitud"]).json()
    assert j["dentro"] is True and j["lugar"] == "Matriz Milagro" and j["radio_m"] == 400
    sede = fake.sedes[SEDE_ID]
    assert j["centro"] == {"latitud": sede["latitud"], "longitud": sede["longitud"]}


def test_zona_fuera_trae_el_centro_del_bloque_para_dibujarlo(client):
    j = zona(client, MUY_LEJOS["latitud"], MUY_LEJOS["longitud"]).json()
    assert j["dentro"] is False and j["centro"] == {"latitud": DENTRO["latitud"], "longitud": DENTRO["longitud"]}


def test_zona_informa_si_la_sede_permite_estar_fuera(client, fake):
    fake.sedes[SEDE_ID]["permite_fuera_geocerca"] = True
    assert zona(client, MUY_LEJOS["latitud"], MUY_LEJOS["longitud"]).json()["permite_fuera"] is True


def test_zona_sin_sede_activa_es_409_y_exige_sesion_y_coordenadas_validas(client, fake):
    fake.filas[MARCA_ID]["sede_id"] = None
    assert zona(client, -2.14, -79.6).status_code == 409
    fake.filas[MARCA_ID]["sede_id"] = SEDE_ID
    assert client.get("/marcaciones/zona?latitud=-2.14&longitud=-79.6").status_code == 401
    assert zona(client, 91, -79.6).status_code == 422
    assert zona(client, -2.14, -181).status_code == 422
    assert zona(client, -2.14, -79.6, headers={"Authorization": "Bearer token-admin"}).status_code == 403
