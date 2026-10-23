import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_supabase, registrar_manejadores
from app.config import Settings, get_settings
from datetime import datetime, timezone

from app.ia import get_ia
from app.routers import anomalias, dispositivo, feriados, ia as router_ia, marcaciones, procesos, rostro, sedes, usuarios
from app.supabase_client import SupabaseError

ADMIN_ID = "11111111-1111-1111-1111-111111111111"
SEDE_ID = "22222222-2222-2222-2222-222222222222"
BLOQUE_ID = "44444444-4444-4444-4444-444444444444"
NUEVO_ID = "33333333-3333-3333-3333-333333333333"


class FakeSupabase:
    """Simula Supabase en memoria para probar la lógica sin red."""

    def __init__(self):
        self.tokens = {"token-admin": ADMIN_ID, "token-usuario": "u-1"}
        self.filas = {
            ADMIN_ID: {"id": ADMIN_ID, "rol": "administrador", "activo": True, "email": "admin@x.com"},
            "u-1": {"id": "u-1", "rol": "usuario", "activo": True, "email": "u1@x.com"},
        }
        self.auth_users = {ADMIN_ID: {"id": ADMIN_ID, "email_confirmed_at": "2026-01-01"},
                           "u-1": {"id": "u-1", "email_confirmed_at": None}}
        self.sedes = {SEDE_ID: {"id": SEDE_ID, "nombre": "Matriz Milagro", "latitud": -2.14, "longitud": -79.6,
                                 "radio_metros": 400, "permite_fuera_geocerca": False, "activa": True}}
        self.bloques = {BLOQUE_ID: {"id": BLOQUE_ID, "sede_id": SEDE_ID, "nombre": "Bloque M", "latitud": -2.14,
                                     "longitud": -79.6, "radio_metros": 60, "activo": True}}
        self.nombre_duplicado = False
        self.llamadas = []
        self.fallar_insert = False
        self.correo_existente = False
        # marcaciones
        self.marcaciones = {}
        self.anomalias = []
        self.config = {"tolerancia_min": 10, "almuerzo_max_min": 60, "velocidad_max_kmh": 120,
                       "max_marcaciones_web_30d": 3}
        self.insertar_marcacion_choca = False
        self.dispositivo_choca = False
        self.auth_correo_existente = False
        self.feriados = {}
        self.rostros = {}
        self.vencidas = 0
        self.rostro_falla = None
        self.justificaciones = {}      # anomalia_id -> fila
        self.ia_claves = {}            # id -> fila de ia_claves
        self.bitacora = []
        self.mensajes = []

    async def usuario_de_token(self, token):
        return self.tokens.get(token)

    async def usuario_fila(self, uid):
        return self.filas.get(uid)

    async def invitar_por_correo(self, email, redirect_to):
        self.llamadas.append(("invitar", email, redirect_to))
        if self.correo_existente:
            raise SupabaseError(422, "A user with this email address has already been registered")
        uid = NUEVO_ID
        self.auth_users[uid] = {"id": uid, "email_confirmed_at": None}
        return {"id": uid, "email": email}

    async def insertar_usuario(self, datos):
        self.llamadas.append(("insertar", datos))
        if self.fallar_insert:
            raise SupabaseError(400, "violación de restricción")
        self.filas[datos["id"]] = {**datos, "activo": True}
        return datos

    async def eliminar_usuario_auth(self, uid):
        self.llamadas.append(("eliminar_auth", uid))
        self.auth_users.pop(uid, None)

    async def obtener_usuario_auth(self, uid):
        return self.auth_users[uid]

    async def ids_con_invitacion_pendiente(self):
        return [uid for uid, a in self.auth_users.items() if not a.get("email_confirmed_at")]

    async def enviar_recuperacion(self, email, redirect_to):
        self.llamadas.append(("recuperar", email, redirect_to))

    async def contar_administradores_activos(self):
        return sum(1 for f in self.filas.values() if f["rol"] == "administrador" and f["activo"])

    async def actualizar_usuario(self, uid, datos):
        self.llamadas.append(("actualizar", uid, datos))
        self.filas[uid].update({k: v for k, v in datos.items() if k != "updated_by"})
        return self.filas[uid]

    async def actualizar_correo_auth(self, uid, email):
        self.llamadas.append(("auth_correo", uid, email))
        if self.auth_correo_existente:
            raise SupabaseError(422, "A user with this email address has already been registered")
        self.auth_users[uid]["email"] = email

    async def vincular_dispositivo(self, uid, dispositivo_id):
        self.llamadas.append(("vincular_dispositivo", uid, dispositivo_id))
        if self.dispositivo_choca:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "usuarios_dispositivo_unico"')
        fila = self.filas[uid]
        if fila.get("dispositivo_id"):
            return None
        fila["dispositivo_id"] = dispositivo_id
        return fila

    async def rostro_fila(self, uid):
        return self.rostros.get(uid)

    async def registrar_rostro(self, uid, cifrado_hex, version_clave, consentimiento):
        self.llamadas.append(("registrar_rostro", uid, version_clave))
        if self.rostro_falla:
            raise SupabaseError(400, self.rostro_falla)
        if uid in self.rostros:
            raise SupabaseError(400, "El usuario ya tiene un rostro registrado; el administrador debe resetearlo primero")
        self.rostros[uid] = {"vectores_cifrados": cifrado_hex, "version_clave": version_clave}
        self.filas[uid]["fecha_registro_rostro"] = "2026-10-15T10:00:00+00:00"
        self.filas[uid]["fecha_consentimiento_biometrico"] = consentimiento

    async def bloquear_usuario_auth(self, uid, bloquear):
        self.llamadas.append(("bloquear", uid, bloquear))

    # ---- sedes y bloques ----
    async def sede_fila(self, sede_id):
        return self.sedes.get(sede_id)

    async def insertar_sede(self, datos):
        self.llamadas.append(("insertar_sede", datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "sedes_nombre_key"')
        fila = {"id": "sede-nueva", "activa": True, **datos}
        self.sedes[fila["id"]] = fila
        return fila

    async def actualizar_sede(self, sede_id, datos):
        self.llamadas.append(("actualizar_sede", sede_id, datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "sedes_nombre_key"')
        self.sedes[sede_id].update(datos)
        return self.sedes[sede_id]

    async def contar_usuarios_activos_de_sede(self, sede_id):
        return sum(1 for f in self.filas.values() if f.get("sede_id") == sede_id and f["activo"])

    async def bloque_fila(self, bloque_id):
        return self.bloques.get(bloque_id)

    async def insertar_bloque(self, datos):
        self.llamadas.append(("insertar_bloque", datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "bloques_nombre_por_sede_unico"')
        fila = {"id": "bloque-nuevo", "activo": True, **datos}
        self.bloques[fila["id"]] = fila
        return fila

    async def actualizar_bloque(self, bloque_id, datos):
        self.llamadas.append(("actualizar_bloque", bloque_id, datos))
        if self.nombre_duplicado:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "bloques_nombre_por_sede_unico"')
        self.bloques[bloque_id].update(datos)
        return self.bloques[bloque_id]

    async def contar_bloques_activos(self, sede_id):
        return sum(1 for b in self.bloques.values() if b["sede_id"] == sede_id and b["activo"])

    # ---- marcaciones y anomalías ----
    async def configuracion(self):
        return self.config

    async def claves_ia(self):
        return [dict(f) for f in self.ia_claves.values()]

    async def clave_ia(self, clave_id):
        fila = self.ia_claves.get(clave_id)
        return dict(fila) if fila else None

    async def clave_ia_activa(self):
        return next((dict(f) for f in self.ia_claves.values() if f.get("activa")), None)

    async def insertar_clave_ia(self, datos):
        n = len(self.ia_claves) + 1
        while f"clave-{n}" in self.ia_claves:
            n += 1
        fila = {"id": f"clave-{n}", "created_at": f"2026-01-01T00:00:{n:02d}+00:00", "updated_at": None, "activa": False, **datos}
        self.ia_claves[fila["id"]] = fila
        return dict(fila)

    async def actualizar_clave_ia(self, clave_id, datos):
        self.ia_claves[clave_id].update(datos)
        return dict(self.ia_claves[clave_id])

    async def borrar_clave_ia(self, clave_id):
        self.ia_claves.pop(clave_id, None)

    async def activar_clave_ia(self, clave_id, usuario_id):
        for f in self.ia_claves.values():
            f["activa"] = f["id"] == clave_id
            f["updated_by"] = usuario_id

    async def registrar_bitacora(self, datos):
        self.bitacora.append(dict(datos))

    async def bloques_activos_de_sede(self, sede_id):
        return [b for b in self.bloques.values() if b["sede_id"] == sede_id and b["activo"]]

    async def marcacion_fila(self, marcacion_id):
        return self.marcaciones.get(marcacion_id)

    @staticmethod
    def _t(texto):
        return datetime.fromisoformat(texto)

    async def marcaciones_en_rango(self, usuario_id, desde, hasta):
        filas = [m for m in self.marcaciones.values() if m["usuario_id"] == usuario_id
                 and self._t(desde) <= self._t(m["fecha_hora"]) < self._t(hasta)]
        return sorted(filas, key=lambda m: self._t(m["fecha_hora"]))

    async def marcacion_anterior(self, usuario_id, antes_de):
        filas = [m for m in self.marcaciones.values() if m["usuario_id"] == usuario_id
                 and self._t(m["fecha_hora"]) < self._t(antes_de)]
        return max(filas, key=lambda m: self._t(m["fecha_hora"])) if filas else None

    async def contar_marcaciones_web(self, usuario_id, desde, hasta):
        return sum(1 for m in self.marcaciones.values() if m["usuario_id"] == usuario_id and m["origen"] == "web"
                   and self._t(desde) <= self._t(m["fecha_hora"]) < self._t(hasta))

    async def insertar_marcacion(self, datos):
        self.llamadas.append(("insertar_marcacion", datos))
        if self.insertar_marcacion_choca:
            raise SupabaseError(409, 'duplicate key value violates unique constraint "marcaciones_pkey"')
        self.marcaciones[datos["id"]] = dict(datos)
        return dict(datos)

    # ---- proceso de ausencias ----
    async def usuarios_para_ausencias(self):
        return [f for f in self.filas.values() if f["rol"] == "usuario" and f["activo"] and f.get("sede_id")]

    async def marcaciones_de_todos(self, desde, hasta):
        filas = [m for m in self.marcaciones.values() if self._t(desde) <= self._t(m["fecha_hora"]) < self._t(hasta)]
        return sorted(filas, key=lambda m: self._t(m["fecha_hora"]))

    async def feriados_activos_entre(self, desde, hasta):
        return [f for f in self.feriados.values() if f["activo"] and f["fecha_fin"] >= desde and f["fecha_inicio"] <= hasta]

    async def ausencias_registradas(self, desde, hasta):
        return [a for a in self.anomalias if a.get("fecha_jornada") and desde <= a["fecha_jornada"] <= hasta
                and a["tipo"] in ("sin_ingreso", "sin_salida", "sin_regreso_almuerzo")]

    async def marcar_sin_justificar(self):
        self.llamadas.append(("marcar_sin_justificar",))
        return self.vencidas

    async def insertar_anomalia(self, datos):
        self.llamadas.append(("insertar_anomalia", datos))
        # Imita el índice único (usuario, tipo, fecha_jornada) de la migración 0002.
        if datos.get("fecha_jornada") and any(
            a.get("fecha_jornada") == datos["fecha_jornada"] and a["usuario_id"] == datos["usuario_id"]
            and a["tipo"] == datos["tipo"] for a in self.anomalias
        ):
            raise SupabaseError(409, 'duplicate key value violates unique constraint "anomalias_jornada_unica"')
        fila = {"id": f"anom-{len(self.anomalias) + 1}", "estado": "pendiente", **datos}
        self.anomalias.append(fila)
        return fila

    # ---- anomalías y justificaciones (lo que ve la propia persona) ----
    async def anomalias_de_usuario(self, uid, limite=100):
        filas = [a for a in self.anomalias if a["usuario_id"] == uid]
        return sorted(filas, key=lambda a: a["created_at"], reverse=True)[:limite]

    async def anomalia_de_usuario(self, uid, anomalia_id):
        return next((a for a in self.anomalias if a["id"] == anomalia_id and a["usuario_id"] == uid), None)

    async def justificacion_de_anomalia(self, anomalia_id):
        return self.justificaciones.get(anomalia_id)

    async def mensajes_de_justificacion(self, justificacion_id):
        return [m for m in self.mensajes if m["justificacion_id"] == justificacion_id]

    async def justificar_anomalia(self, uid, anomalia_id, texto):
        """Imita la función `justificar_anomalia` de la migración 0003 (mismos errores)."""
        self.llamadas.append(("justificar", uid, anomalia_id, texto))
        a = next((x for x in self.anomalias if x["id"] == anomalia_id), None)
        if a is None or a["usuario_id"] != uid:
            raise SupabaseError(400, "Anomalía no encontrada")
        if a["estado"] != "pendiente":
            raise SupabaseError(400, "Esta anomalía ya no admite justificación")
        if datetime.fromisoformat(a["fecha_vencimiento"]) < datetime.now(timezone.utc):
            raise SupabaseError(400, "El plazo para justificar esta anomalía venció")
        texto = texto.strip()
        if not 10 <= len(texto) <= 1000:
            raise SupabaseError(400, "La justificación debe tener entre 10 y 1000 caracteres")
        jid = f"just-{len(self.justificaciones) + 1}"
        self.justificaciones[anomalia_id] = {"id": jid, "decision_final": None, "comentario_admin": None,
                                             "fecha_decision": None}
        self.mensajes.append({"justificacion_id": jid, "emisor": "usuario", "contenido": texto,
                              "created_at": "2026-10-20T15:00:00+00:00"})
        a["estado"] = "en_revision"

    # Imitan las funciones de la migración 0004 (mismos errores).
    def _reloj(self):
        return f"2026-10-20T15:{len(self.mensajes):02d}:00+00:00"

    async def registrar_mensaje_usuario(self, uid, anomalia_id, texto, maximo):
        self.llamadas.append(("mensaje_usuario", uid, anomalia_id, texto))
        a = next((x for x in self.anomalias if x["id"] == anomalia_id), None)
        if a is None or a["usuario_id"] != uid:
            raise SupabaseError(400, "Anomalía no encontrada")
        if a["estado"] != "pendiente":
            raise SupabaseError(400, "Esta anomalía ya no admite justificación")
        if datetime.fromisoformat(a["fecha_vencimiento"]) < datetime.now(timezone.utc):
            raise SupabaseError(400, "El plazo para justificar esta anomalía venció")
        texto = texto.strip()
        j = self.justificaciones.get(anomalia_id)
        minimo = 10 if j is None else 2
        if not minimo <= len(texto) <= 1000:
            raise SupabaseError(400, f"La justificación debe tener entre {minimo} y 1000 caracteres")
        if j is None:
            j = {"id": f"just-{len(self.justificaciones) + 1}", "decision_final": None, "comentario_admin": None,
                 "fecha_decision": None, "revisado_por": None, "clasificacion_ia": None, "confianza_ia": None,
                 "resumen_ia": None}
            self.justificaciones[anomalia_id] = j
        elif sum(1 for m in self.mensajes if m["justificacion_id"] == j["id"] and m["emisor"] == "usuario") >= maximo:
            raise SupabaseError(400, "Se alcanzó el máximo de mensajes para esta justificación")
        self.mensajes.append({"justificacion_id": j["id"], "emisor": "usuario", "contenido": texto,
                              "created_at": self._reloj()})
        return j["id"]

    async def registrar_mensaje_asistente(self, justificacion_id, contenido):
        self.llamadas.append(("mensaje_asistente", justificacion_id, contenido))
        self.mensajes.append({"justificacion_id": justificacion_id, "emisor": "asistente", "contenido": contenido,
                              "created_at": self._reloj()})

    async def cerrar_justificacion(self, anomalia_id, clasificacion, confianza, resumen, auto_aprobar):
        self.llamadas.append(("cerrar", anomalia_id, clasificacion, confianza, resumen, auto_aprobar))
        a = next(x for x in self.anomalias if x["id"] == anomalia_id)
        if a["estado"] != "pendiente":
            raise SupabaseError(400, "Esta anomalía ya no admite justificación")
        j = self.justificaciones[anomalia_id]
        j.update(clasificacion_ia=clasificacion, confianza_ia=confianza, resumen_ia=resumen)
        if auto_aprobar:
            j.update(decision_final="aprobada", fecha_decision="2026-10-20T15:30:00+00:00")
        a["estado"] = "justificada" if auto_aprobar else "en_revision"
        return a["estado"]

    # ---- feriados ----
    async def feriado_activo(self, fecha):
        return next(
            (f for f in self.feriados.values() if f["activo"] and f["fecha_inicio"] <= fecha <= f["fecha_fin"]), None
        )

    async def feriado_fila(self, feriado_id):
        return self.feriados.get(feriado_id)

    def _choca_feriado(self, fila, excepto=None):
        """Imita la restricción de exclusión de la base: dos feriados ACTIVOS no pueden cruzarse."""
        if not fila["activo"]:
            return
        for i, f in self.feriados.items():
            if i != excepto and f["activo"] and f["fecha_inicio"] <= fila["fecha_fin"] and fila["fecha_inicio"] <= f["fecha_fin"]:
                raise SupabaseError(
                    409, 'conflicting key value violates exclusion constraint "feriados_sin_traslape"'
                )

    async def insertar_feriado(self, datos):
        self.llamadas.append(("insertar_feriado", datos))
        fila = {"id": f"fer-{len(self.feriados) + 1}", "activo": True, **datos}
        self._choca_feriado(fila)
        self.feriados[fila["id"]] = fila
        return fila

    async def actualizar_feriado(self, feriado_id, datos):
        self.llamadas.append(("actualizar_feriado", feriado_id, datos))
        nueva = {**self.feriados[feriado_id], **datos}
        self._choca_feriado(nueva, excepto=feriado_id)
        self.feriados[feriado_id] = nueva
        return nueva

    async def contar_verificaciones_fallidas(self, usuario_id, desde):
        return sum(1 for a in self.anomalias if a["usuario_id"] == usuario_id and a["tipo"] == "verificacion_fallida")


class FakeIA:
    """Sustituye al modelo: devuelve las evaluaciones que se le programen, en orden, y anota lo que recibió."""

    def __init__(self):
        self.cola = []
        self.llamadas = []

    async def evaluar(self, caso, mensajes, ultima):
        from app.ia import IAError
        self.llamadas.append({"caso": caso, "mensajes": [dict(m) for m in mensajes], "ultima": ultima})
        if not self.cola:
            raise IAError("sin respuesta programada")
        siguiente = self.cola.pop(0)
        if isinstance(siguiente, Exception):
            raise siguiente
        return siguiente


@pytest.fixture
def fake():
    return FakeSupabase()


@pytest.fixture
def ia(client):
    """Activa el chat con IA en la app de pruebas (por omisión no hay llave y el chat funciona sin IA)."""
    falso = FakeIA()
    client.app.dependency_overrides[get_ia] = lambda: falso
    return falso


@pytest.fixture
def client(fake):
    app = FastAPI()
    registrar_manejadores(app)
    app.include_router(usuarios.router)
    app.include_router(sedes.router_sedes)
    app.include_router(sedes.router_bloques)
    app.include_router(marcaciones.router)
    app.include_router(feriados.router)
    app.include_router(dispositivo.router)
    app.include_router(rostro.router)
    app.include_router(procesos.router)
    app.include_router(anomalias.router)
    app.include_router(router_ia.router)
    app.dependency_overrides[get_supabase] = lambda: fake
    app.dependency_overrides[get_ia] = lambda: None     # por omisión no hay IA: el chat funciona sin repreguntas
    app.dependency_overrides[get_settings] = lambda: Settings(
        supabase_url="http://sb", supabase_service_role_key="k", url_panel_web="http://panel.test",
        verificacion_facial="simulada",
    )
    return TestClient(app)


def admin_headers():
    return {"Authorization": "Bearer token-admin"}
