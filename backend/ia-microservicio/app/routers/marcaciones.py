"""Registro de la marcación de asistencia (docs/logica-negocio.md, secciones 2.1 a 2.3 y 9).

Es el único punto por el que entra una marcación: los clientes solo leen esas tablas. El orden
de las comprobaciones es: sesión → reintento → fecha → secuencia del día → rostro → zona, horario,
almuerzo, desplazamiento y uso web. Las reglas viven en `reglas_marcacion.py`.

Qué se registra y qué no:
  * Rostro no verificado → NO se registra la marcación; queda la anomalía `verificacion_fallida`.
  * Fuera de secuencia o repetida → NO se registra; queda la anomalía `duplicada`.
  * Fuera de la zona → SÍ se registra y queda la anomalía `fuera_geocerca`, salvo que la sede
    tenga `permite_fuera_geocerca` activo (entonces no hay anomalía).
  * Día no laborable (feriado o día de la semana que no trabaja) → SÍ se registra y queda `dia_no_laborable`;
    ese día no se evalúa el horario.
  * Horario, almuerzo, desplazamiento y uso web → SÍ se registra y queda la anomalía que corresponda.

Marcación sin conexión (`sin_conexion = true`, solo app): la persona marcó sin internet y la app la envía después.
Se usa la hora que tenía el celular al marcar, pero validada: no puede ser futura, ni más antigua que
`configuracion.max_horas_sin_conexion`, ni anterior a otra marcación ya registrada, ni anterior a lo que el celular
puede probar con la hora firmada del servidor (`reloj`, ver app/reloj.py: detecta el reloj atrasado). Además debe venir
firmada con la clave del chip de seguridad del celular (`firma`, ver app/firma_dispositivo.py): si la cuenta tiene una clave
registrada la firma es obligatoria y cualquier cambio a lo guardado en el celular la invalida. La hora de llegada
queda aparte (`created_at`). Como la persona ya se fue, la verificación del rostro es DIFERIDA: si el rostro no coincide, o la selfie
no se puede analizar, la marcación SÍ se registra (como `fallida` o `pendiente`) con la anomalía `verificacion_fallida`
enlazada, para que la revise una persona; no se pierde la asistencia ni se aprueba a ciegas.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse

from app import reglas_marcacion as reglas
from app import firma_dispositivo as firma_clave
from app import reloj as reloj_firmado
from app.auth import exigir_usuario, get_supabase
from app.biometria import Criterios
from app.config import Settings, get_settings
from app.schemas import MarcacionNueva, RelojMarcacion
from app.supabase_client import SupabaseClient, SupabaseError
from app.verificacion import ResultadoVerificacion, Verificador, get_verificador

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/marcaciones", tags=["marcaciones"])

# Cuánto puede adelantarse el reloj del celular respecto del servidor antes de rechazar la hora (relojes mal ajustados).
TOLERANCIA_RELOJ = timedelta(minutes=5)
# Si la fila de configuración no trae el valor (por ejemplo, la migración 0010 aún no se aplicó).
MAX_HORAS_SIN_CONEXION_DEFECTO = 48


def get_reloj() -> Callable[[], datetime]:
    """El reloj del servidor. Es una dependencia para que las pruebas puedan fijar la hora."""
    return lambda: datetime.now(timezone.utc)


def _iso(momento: datetime) -> str:
    return momento.astimezone(timezone.utc).isoformat()


async def _registrar_anomalia(
    sb: SupabaseClient, usuario_id: str, tipo: str, descripcion: str, marcacion_id: str | None, intentos: int = 0
) -> dict:
    # `detalle` es el dato medido por la regla («120 km/h; el límite es 100»). El aviso que redacte la IA
    # irá aparte, en `descripcion_ia`, para no perder la evidencia.
    return await sb.insertar_anomalia(
        {
            "usuario_id": usuario_id,
            "marcacion_id": marcacion_id,
            "tipo": tipo,
            "detector": "regla",
            "detalle": descripcion,
            "intentos_fallidos": intentos,
        }
    )


def _resumen(marcacion: dict) -> dict:
    return {
        **{k: marcacion.get(k) for k in ("id", "tipo", "fecha_hora", "sede_id", "bloque_id", "origen", "verificacion")},
        "sin_conexion": bool(marcacion.get("sin_conexion")),
    }


def _rechazo(estado: int, mensaje: str, codigo: str) -> JSONResponse:
    """Rechazo con código de máquina: la app decide por el código, no por el texto."""
    return JSONResponse(status_code=estado, content={"detail": mensaje, "codigo": codigo})


def _max_horas_sin_conexion(cfg: dict) -> int:
    try:
        horas = int(cfg.get("max_horas_sin_conexion") or MAX_HORAS_SIN_CONEXION_DEFECTO)
    except (TypeError, ValueError):
        return MAX_HORAS_SIN_CONEXION_DEFECTO
    return horas if horas > 0 else MAX_HORAS_SIN_CONEXION_DEFECTO


# Incertidumbre máxima (± metros) de la ubicación para marcar, si la configuración no la trae (migración 0013). Son valores
# provisionales: se calibran con mediciones reales en cada sede (docs/calibracion-precision-gps.md).
PRECISION_MAX_APP_DEFECTO = 50
PRECISION_MAX_WEB_DEFECTO = 200


def _precision_max(cfg: dict, origen: str) -> int:
    """Hasta cuántos metros de incertidumbre se acepta la ubicación al marcar desde `origen` («app» o «web»)."""
    clave, defecto = (
        ("precision_max_web_m", PRECISION_MAX_WEB_DEFECTO) if origen == "web" else ("precision_max_app_m", PRECISION_MAX_APP_DEFECTO)
    )
    try:
        metros = int(cfg.get(clave) or defecto)
    except (TypeError, ValueError):
        return defecto
    return metros if metros > 0 else defecto


def _validar_precision(precision_m: float | None, limite_m: int) -> JSONResponse | None:
    """None si la ubicación es lo bastante precisa; si no, el rechazo que se devuelve. Si el equipo no informó la precisión no se rechaza
    (no hay con qué compararla); el dato queda en blanco en la marcación."""
    if precision_m is None or precision_m <= limite_m:
        return None
    return _rechazo(
        422,
        f"La precisión de tu ubicación es de ±{round(precision_m)} m y para marcar se necesita ±{limite_m} m o menos. "
        "Acércate a una ventana o sal a un lugar abierto, espera unos segundos e inténtalo de nuevo",
        "precision_insuficiente",
    )


def _hora_local(momento: datetime) -> str:
    return reglas.a_local(momento).strftime("%d/%m %H:%M")


def _validar_hora_sin_conexion(hora: datetime | None, llegada: datetime, max_horas: int) -> JSONResponse | None:
    """None si la hora del celular es creíble; si no, el rechazo que se devuelve a la app."""
    if hora is None:   # el esquema ya lo exige; por si acaso
        return _rechazo(422, "Falta la hora en que marcaste", "hora_invalida")
    if hora > llegada + TOLERANCIA_RELOJ:
        return _rechazo(
            422,
            "La hora de tu celular está adelantada respecto de la real. Activa la fecha y hora automáticas e inténtalo de nuevo",
            "hora_invalida",
        )
    if llegada - hora > timedelta(hours=max_horas):
        return _rechazo(
            422,
            f"Pasaron más de {max_horas} horas desde que marcaste, así que ya no se puede registrar. "
            "Explica lo ocurrido desde Avisos",
            "marcacion_expirada",
        )
    return None


def _validar_reloj(
    prueba: RelojMarcacion | None, usuario_id: str, hora: datetime, llegada: datetime, clave: bytes
) -> JSONResponse | None:
    """Comprueba que la hora del celular no sea anterior a la cota que él mismo probó con la hora firmada del servidor.

    Sin prueba (la app no pudo darla: primera vez, o el celular se reinició) no se puede comprobar y vale la hora del
    celular, validada como siempre. Con una prueba que no cuadra se rechaza: no se descarta en silencio, porque entonces
    bastaría con mandarla mal para saltarse la comprobación."""
    if prueba is None:
        return None
    if not reloj_firmado.firma_valida(clave, usuario_id, prueba.servidor_t, prueba.firma):
        return _rechazo(
            422, "No pudimos comprobar la hora de tu celular. Abre la app con internet e inténtalo de nuevo", "hora_invalida"
        )
    cota = prueba.servidor_t + timedelta(milliseconds=prueba.arranque_marca_ms - prueba.arranque_ancla_ms)
    if cota > llegada + TOLERANCIA_RELOJ:
        # El celular dice haber estado encendido más tiempo del que pasó desde que el servidor firmó esa hora.
        return _rechazo(
            422, "No pudimos comprobar la hora de tu celular. Abre la app con internet e inténtalo de nuevo", "hora_invalida"
        )
    if hora < cota - TOLERANCIA_RELOJ:
        return _rechazo(
            422,
            "La hora de tu celular está atrasada respecto de la real. Activa la fecha y hora automáticas e inténtalo de nuevo",
            "hora_invalida",
        )
    return None


def _validar_firma(datos: MarcacionNueva, usuario: dict, obligatoria: bool) -> tuple[JSONResponse | None, bool]:
    """Comprueba la firma de una marcación sin conexión con la clave pública registrada del celular.
    Devuelve (rechazo, firmada): `firmada` es true solo si la firma es válida.

    * Cuenta CON clave registrada: la firma es obligatoria y debe ser válida (así no se puede «bajar» la seguridad
      quitando la firma, que es lo que haría quien modificó los datos guardados).
    * Cuenta SIN clave (celular que aún no la registró, p. ej. Expo Go): se acepta sin firma, salvo que el servidor
      tenga `FIRMA_OBLIGATORIA` activa."""
    clave = usuario.get("clave_publica")
    mensaje = (
        "No pudimos comprobar que esta marcación se hizo desde tu celular, o se alteró antes de enviarla. "
        "Explica lo ocurrido desde Avisos"
    )
    if not clave or datos.firma is None:
        if clave or obligatoria:
            log.warning("Marcación sin conexión sin firma de %s (id %s)", usuario["id"], datos.id)
            return _rechazo(422, mensaje, "firma_invalida"), False
        return None, False
    assert datos.fecha_hora is not None and datos.selfie_b64 is not None   # el esquema ya lo exige
    texto = firma_clave.mensaje_de_marcacion(
        usuario_id=usuario["id"], marcacion_id=str(datos.id), tipo=datos.tipo, fecha_hora=datos.fecha_hora,
        latitud=datos.latitud, longitud=datos.longitud, dispositivo_id=datos.dispositivo_id or "", selfie_b64=datos.selfie_b64,
    )
    if not firma_clave.firma_valida(clave, texto, datos.firma):
        log.warning("Firma inválida en la marcación %s de %s: los datos no coinciden con lo firmado", datos.id, usuario["id"])
        return _rechazo(422, mensaje, "firma_invalida"), False
    return None, True


def _motivo_diferido(verif: ResultadoVerificacion) -> str:
    if verif.estado == "fallida":
        return f"Marcación sin conexión: {verif.motivo or 'el rostro no coincide con el registrado'}"
    return f"Marcación sin conexión: la selfie no se pudo analizar ({(verif.motivo or 'sin detalle').rstrip('.')})"


async def _anotar_ausencias_previas(sb: SupabaseClient, uid: str, tipo: str, momento: datetime, llegada: datetime):
    """Si el proceso de ausencias ya generó una ausencia de ese día (`sin_ingreso`, `sin_salida`,
    `sin_regreso_almuerzo`) antes de que llegara esta marcación, la ausencia puede ya no ser cierta. No se cierra sola
    (los casos los resuelve una persona): se le añade una nota para quien la revise."""
    try:
        for a in await sb.ausencias_de_jornada(uid, reglas.a_local(momento).date().isoformat()):
            nota = (
                f"Después llegó una marcación sin conexión de ese día ({tipo.replace('_', ' ')} a las "
                f"{_hora_local(momento)[-5:]}, enviada el {_hora_local(llegada)}): revisa si la ausencia sigue vigente."
            )
            await sb.anotar_anomalia(a["id"], f"{a.get('detalle') or ''} · {nota}".strip(" ·"))
    except SupabaseError as e:  # la marcación ya está guardada: la nota es un complemento, no debe tumbarla
        log.warning("No se pudo anotar la ausencia previa de %s: %s", uid, e.message)


@router.get("/hoy")
async def marcaciones_de_hoy(
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
    x_dispositivo_id: str | None = Header(default=None),
    cfg: Settings = Depends(get_settings),
):
    """Lo que la app necesita para pintar la pantalla de marcación: las marcaciones de hoy, cuál toca ahora
    y si el celular que pregunta es el vinculado. La secuencia y el día local se calculan aquí, una sola vez."""
    ahora = datetime.now(timezone.utc)
    desde_dia, hasta_dia = reglas.limites_del_dia(ahora)
    try:
        del_dia = await sb.marcaciones_en_rango(usuario["id"], _iso(desde_dia), _iso(hasta_dia))
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudieron cargar tus marcaciones: {e.message}")
    try:
        # La última marcación de todas (puede ser de un día anterior): la pantalla de inicio la muestra.
        ultima = await sb.marcacion_anterior(usuario["id"], _iso(ahora + timedelta(minutes=1)))
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudieron cargar tus marcaciones: {e.message}")
    jornada = None
    if usuario.get("jornada_inicio") and usuario.get("jornada_fin"):
        jornada = {"inicio": str(usuario["jornada_inicio"])[:5], "fin": str(usuario["jornada_fin"])[:5]}
    # Día no laborable (por el horario de la persona o por un feriado): la app deshabilita el botón de marcar.
    # Si el administrador le habilita el día en su horario, aquí deja de ser no laborable. Un fallo al consultar
    # los feriados no bloquea a nadie: se asume día laborable (el servidor igual registra la anomalía si marca).
    dias = usuario.get("dias_laborables") or [1, 2, 3, 4, 5]
    try:
        feriado = await sb.feriado_activo(reglas.a_local(ahora).date().isoformat())
    except SupabaseError:
        feriado = None
    motivo = reglas.motivo_no_laborable(ahora, dias, feriado)
    vinculado = usuario.get("dispositivo_id")
    if not vinculado:
        dispositivo = "sin_vincular"
    elif x_dispositivo_id and x_dispositivo_id == vinculado:
        dispositivo = "este"
    else:
        dispositivo = "otro"
    return {
        "fecha": desde_dia.date().isoformat(),
        "marcaciones": [_resumen(m) for m in del_dia],
        "siguiente": reglas.siguiente_tipo(del_dia),
        "ultima": _resumen(ultima) if ultima else None,
        "jornada": jornada,
        "dia_laborable": motivo is None,
        "motivo_no_laborable": motivo,
        "dias_laborables": sorted(set(dias)),
        "dispositivo": dispositivo,
        # La hora del servidor, firmada: la app la guarda para poder probar la hora de una marcación sin conexión.
        "hora_servidor": reloj_firmado.hora_servidor(reloj_firmado.clave_de(cfg.supabase_service_role_key), usuario["id"], ahora),
        # La clave pública que el celular registró (es pública): la app la compara con la suya para saber si debe registrarla.
        "clave_publica": usuario.get("clave_publica"),
        "rostro_registrado": bool(usuario.get("fecha_registro_rostro")),
        # En modo simulado (solo desarrollo) no se exige rostro para marcar.
        "rostro_requerido": cfg.verificacion_facial == "real",
    }


@router.get("/zona")
async def zona_actual(
    latitud: float = Query(ge=-90, le=90),
    longitud: float = Query(ge=-180, le=180),
    origen: Literal["app", "web"] = Query(default="app"),
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
):
    """¿Está la persona dentro de la zona de marcación de su sede? Solo informa (la app lo muestra antes de marcar);
    la validación que cuenta se vuelve a hacer al registrar la marcación."""
    try:
        sede = await sb.sede_fila(usuario["sede_id"]) if usuario.get("sede_id") else None
        if not sede or not sede.get("activa", True):
            raise HTTPException(409, "No tienes una sede activa asignada. Comunícate con Talento Humano")
        zona = reglas.evaluar_zona(latitud, longitud, sede, await sb.bloques_activos_de_sede(sede["id"]))
        precision_max = _precision_max(await sb.configuracion(), origen)
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo comprobar tu ubicación: {e.message}")
    return {
        "dentro": zona.dentro,
        "sede": sede["nombre"],
        "lugar": zona.lugar,
        "distancia_m": round(zona.distancia_m) if zona.distancia_m is not None else None,
        "radio_m": round(zona.radio_m) if zona.radio_m is not None else None,
        "centro": {"latitud": zona.centro[0], "longitud": zona.centro[1]} if zona.centro else None,
        # Con este permiso activo, estar fuera de la zona no genera anomalía.
        "permite_fuera": bool(sede.get("permite_fuera_geocerca")),
        # Incertidumbre máxima (± m) con la que se acepta marcar desde este canal; la app y la web avisan antes de intentarlo.
        "precision_max_m": precision_max,
    }


@router.get("/historial")
async def historial(
    dias: int = Query(default=7, ge=1, le=31),
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Las marcaciones de los últimos `dias` días (hoy incluido), agrupadas por día local, del más reciente al más
    antiguo. Cada una trae el lugar (bloque o, si no tiene, la sede) y la anomalía que dejó, si dejó alguna."""
    ahora = datetime.now(timezone.utc)
    desde, _ = reglas.limites_del_dia(ahora - timedelta(days=dias - 1))
    _, hasta = reglas.limites_del_dia(ahora)
    try:
        marcaciones = await sb.marcaciones_en_rango(usuario["id"], _iso(desde), _iso(hasta))
        anomalias = await sb.anomalias_de_usuario(usuario["id"])
        nombres: dict[tuple[str, str], str | None] = {}

        async def lugar(m: dict) -> str | None:
            for clave, buscar in (("bloque_id", sb.bloque_fila), ("sede_id", sb.sede_fila)):
                ident = m.get(clave)
                if ident:
                    if (clave, ident) not in nombres:
                        fila = await buscar(ident)
                        nombres[(clave, ident)] = fila["nombre"] if fila else None
                    if nombres[(clave, ident)]:
                        return nombres[(clave, ident)]
            return None

        por_marcacion = {a["marcacion_id"]: a for a in anomalias if a.get("marcacion_id")}
        por_dia: dict[str, list[dict]] = {}
        for m in marcaciones:                       # vienen de la más antigua a la más reciente
            fecha = reglas.a_local(datetime.fromisoformat(m["fecha_hora"].replace("Z", "+00:00"))).date().isoformat()
            a = por_marcacion.get(m["id"])
            por_dia.setdefault(fecha, []).append({
                **_resumen(m),
                "lugar": await lugar(m),
                "anomalia": {"tipo": a["tipo"], "estado": a["estado"]} if a else None,
            })
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo cargar tu historial: {e.message}")
    return {
        "dias": [{"fecha": f, "marcaciones": por_dia[f]} for f in sorted(por_dia, reverse=True)],
        "total": len(marcaciones),
    }


@router.post("", status_code=201)
async def marcar(
    datos: MarcacionNueva,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
    verificador: Verificador = Depends(get_verificador),
    reloj: Callable[[], datetime] = Depends(get_reloj),
    ajustes: Settings = Depends(get_settings),
):
    uid = usuario["id"]
    llegada = reloj()   # cuándo llegó la solicitud al servidor
    ahora = llegada     # la hora de la marcación: la del servidor… salvo en una marcación sin conexión (paso 4)

    try:
        # 1) Reintento: la app reenvía la misma marcación (mismo id) tras un corte de red.
        existente = await sb.marcacion_fila(str(datos.id))
        if existente:
            if existente["usuario_id"] != uid:
                raise HTTPException(409, "Ese identificador de marcación ya está en uso")
            return JSONResponse(
                {"marcacion": _resumen(existente), "anomalias": [], "reintento": True}, status_code=200
            )

        # 2) Ubicación simulada: Android avisa cuando la posición viene de una app de GPS falso. No se registra.
        if datos.ubicacion_simulada:
            await _registrar_anomalia(
                sb, uid, "ubicacion_simulada", "El celular informó que la ubicación es simulada (GPS falso)", None
            )
            raise HTTPException(
                403,
                "Detectamos que la ubicación de tu celular es simulada. Desactiva la app de ubicación falsa e inténtalo de nuevo",
            )

        # 3) Dispositivo: si la cuenta ya tiene uno vinculado, la app debe marcar desde ese.
        vinculado = usuario.get("dispositivo_id")
        if datos.origen == "app" and vinculado and datos.dispositivo_id and datos.dispositivo_id != vinculado:
            raise HTTPException(403, "Este dispositivo no es el vinculado a tu cuenta")

        # 4) Sede del usuario.
        sede = await sb.sede_fila(usuario["sede_id"]) if usuario.get("sede_id") else None
        if not sede or not sede["activa"]:
            raise HTTPException(409, "Tu sede no está disponible; contacta a Talento Humano")

        cfg = await sb.configuracion()

        # 4a) Precisión de la ubicación: si el equipo no sabe dónde está con la exactitud mínima, «estar en la zona» no prueba nada.
        # Solo en marcaciones con conexión: la persona está ahí para acercarse a una ventana y repetirlo. La que se hizo sin conexión
        # ya no puede repetirse, y su precisión queda guardada como evidencia.
        if not datos.sin_conexion:
            rechazo = _validar_precision(datos.precision_m, _precision_max(cfg, datos.origen))
            if rechazo:
                return rechazo

        # 4b) Marcación sin conexión: se usa la hora del celular, pero solo si es creíble y viene firmada por su celular.
        firmada = False
        if datos.sin_conexion:
            rechazo = _validar_hora_sin_conexion(datos.fecha_hora, llegada, _max_horas_sin_conexion(cfg))
            if rechazo:
                return rechazo
            rechazo = _validar_reloj(datos.reloj, uid, datos.fecha_hora, llegada, reloj_firmado.clave_de(ajustes.supabase_service_role_key))
            if rechazo:
                return rechazo
            rechazo, firmada = _validar_firma(datos, usuario, ajustes.firma_obligatoria)
            if rechazo:
                return rechazo
            ahora = datos.fecha_hora.astimezone(timezone.utc)
            posteriores = await sb.marcaciones_en_rango(uid, _iso(ahora), _iso(llegada + timedelta(minutes=1)))
            if posteriores:
                return _rechazo(
                    409,
                    "Ya tienes una marcación registrada después de esa hora; esta no se puede agregar",
                    "fuera_de_orden",
                )
        desde_dia, hasta_dia = reglas.limites_del_dia(ahora)

        # 5) Secuencia del día: solo se acepta la marcación que corresponde.
        del_dia = await sb.marcaciones_en_rango(uid, _iso(desde_dia), _iso(hasta_dia))
        esperada = reglas.siguiente_tipo(del_dia)
        if datos.tipo != esperada:
            detalle = (
                f"Intentó «{datos.tipo}» pero la jornada ya tiene las 4 marcaciones"
                if esperada is None
                else f"Intentó «{datos.tipo}» y correspondía «{esperada}»"
            )
            await _registrar_anomalia(sb, uid, "duplicada", detalle, None)
            raise HTTPException(
                409,
                "Esa marcación ya está registrada hoy"
                if esperada is None
                else f"Ahora te corresponde marcar «{esperada.replace('_', ' ')}»",
            )

        # 6) Rostro.
        # Los umbrales del reconocimiento los fija el administrador en el panel (ya vienen en `cfg`).
        try:
            verif = await verificador.verificar(usuario, datos.selfie_b64, Criterios.desde(cfg, ajustes))
        except HTTPException as e:
            # Sin conexión la persona ya no está para repetir la foto: si la selfie no se puede analizar (oscura,
            # borrosa…), la marcación se guarda sin verificar y una persona la revisa. Lo demás (sin rostro registrado,
            # sin selfie, servicio caído) se rechaza igual que siempre.
            if not (datos.sin_conexion and e.status_code == 422 and datos.selfie_b64):
                raise
            verif = ResultadoVerificacion("pendiente", None, str(e.detail))
        if verif.estado == "fallida" and not datos.sin_conexion:
            inicio_hoy, _ = reglas.limites_del_dia(ahora)
            previos = await sb.contar_verificaciones_fallidas(uid, _iso(inicio_hoy))
            await _registrar_anomalia(
                sb, uid, "verificacion_fallida", verif.motivo or "El rostro no coincide", None, previos + 1
            )
            # `codigo` e `intento` permiten a la app mostrar la pantalla de «verificación no superada»
            # sin tener que adivinar por el texto del mensaje.
            return JSONResponse(
                status_code=422,
                content={
                    "detail": "No pudimos verificar tu rostro. Intenta de nuevo con buena luz y de frente"
                    + (f" ({verif.motivo})" if verif.motivo else ""),
                    "codigo": "rostro_no_verificado",
                    "intento": previos + 1,
                },
            )

        # 7) Zona (bloques activos de la sede o, si no hay, la sede).
        bloques = await sb.bloques_activos_de_sede(sede["id"])
        zona = reglas.evaluar_zona(datos.latitud, datos.longitud, sede, bloques)

        # 8) Guardar la marcación (inmutable desde aquí).
        try:
            marcacion = await sb.insertar_marcacion(
                {
                    "id": str(datos.id),
                    "usuario_id": uid,
                    "sede_id": sede["id"],
                    "bloque_id": zona.bloque_id,
                    "tipo": datos.tipo,
                    "fecha_hora": _iso(ahora),
                    "latitud": datos.latitud,
                    "longitud": datos.longitud,
                    "precision_m": datos.precision_m,
                    "origen": datos.origen,
                    "dispositivo_id": datos.dispositivo_id,
                    "motivo_contingencia": datos.motivo_contingencia,
                    "verificacion": verif.estado,
                    "similitud_score": verif.score,
                    "sin_conexion": datos.sin_conexion,
                    "firmada": firmada,
                    "firma": datos.firma if firmada else None,
                }
            )
        except SupabaseError as e:
            # Dos envíos simultáneos del mismo id: el segundo choca con la llave primaria.
            if e.status == 409 and "duplicate" in e.message.lower():
                existente = await sb.marcacion_fila(str(datos.id))
                if existente and existente["usuario_id"] == uid:
                    return JSONResponse(
                        {"marcacion": _resumen(existente), "anomalias": [], "reintento": True}, status_code=200
                    )
            raise

        # 9) Anomalías que se detectan al marcar.
        hallazgos: list[reglas.Hallazgo] = []
        if datos.sin_conexion and verif.estado != "verificada":   # verificación diferida: que la revise una persona
            hallazgos.append(reglas.Hallazgo("verificacion_fallida", _motivo_diferido(verif)))
        if not zona.dentro and not sede["permite_fuera_geocerca"]:
            hallazgos.append(reglas.Hallazgo("fuera_geocerca", zona.descripcion))
        # Día no laborable (feriado o día que no trabaja). En ese caso no se evalúa el horario:
        # llegar «tarde» a un día que no le toca solo duplicaría el aviso.
        feriado = await sb.feriado_activo(reglas.a_local(ahora).date().isoformat())
        h = reglas.evaluar_dia_laborable(ahora, usuario.get("dias_laborables") or [1, 2, 3, 4, 5], feriado)
        if h:
            hallazgos.append(h)
        else:
            h = reglas.evaluar_horario(
                datos.tipo,
                ahora,
                reglas.parsear_hora(usuario["jornada_inicio"]),
                reglas.parsear_hora(usuario["jornada_fin"]),
                cfg["tolerancia_min"],
            )
            if h:
                hallazgos.append(h)
        if datos.tipo == "entrada_almuerzo":
            salida = next(m for m in del_dia if m["tipo"] == "salida_almuerzo")
            h = reglas.evaluar_almuerzo(
                datetime.fromisoformat(salida["fecha_hora"]),
                ahora,
                cfg["almuerzo_max_min"],
                cfg["tolerancia_min"],
            )
            if h:
                hallazgos.append(h)
        anterior = await sb.marcacion_anterior(uid, _iso(ahora))
        h = reglas.evaluar_desplazamiento(
            anterior, datos.latitud, datos.longitud, ahora, cfg["velocidad_max_kmh"]
        )
        if h:
            hallazgos.append(h)
        if datos.origen == "web":
            previas = await sb.contar_marcaciones_web(
                uid, _iso(ahora - timedelta(days=30)), _iso(ahora)
            )
            h = reglas.evaluar_uso_web(previas, cfg["max_marcaciones_web_30d"])
            if h:
                hallazgos.append(h)

        anomalias = [
            await _registrar_anomalia(sb, uid, h.tipo, h.descripcion, marcacion["id"]) for h in hallazgos
        ]
        if datos.sin_conexion:
            await _anotar_ausencias_previas(sb, uid, datos.tipo, ahora, llegada)
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo registrar la marcación: {e.message}")

    return {
        "marcacion": _resumen(marcacion),
        "anomalias": [{"tipo": a["tipo"], "detalle": a.get("detalle")} for a in anomalias],
        "reintento": False,
    }
