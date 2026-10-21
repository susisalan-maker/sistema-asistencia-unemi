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
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse

from app import reglas_marcacion as reglas
from app.auth import exigir_usuario, get_supabase
from app.config import Settings, get_settings
from app.schemas import MarcacionNueva
from app.supabase_client import SupabaseClient, SupabaseError
from app.verificacion import Verificador, get_verificador

router = APIRouter(prefix="/marcaciones", tags=["marcaciones"])

# Se tolera un reloj de celular un poco adelantado, no una marcación «del futuro».
MARGEN_FUTURO = timedelta(minutes=5)


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
        k: marcacion.get(k)
        for k in ("id", "tipo", "fecha_hora", "sede_id", "bloque_id", "origen", "verificacion")
    }


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
        "dispositivo": dispositivo,
        "rostro_registrado": bool(usuario.get("fecha_registro_rostro")),
        # En modo simulado (solo desarrollo) no se exige rostro para marcar.
        "rostro_requerido": cfg.verificacion_facial == "real",
    }


@router.get("/zona")
async def zona_actual(
    latitud: float = Query(ge=-90, le=90),
    longitud: float = Query(ge=-180, le=180),
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
):
    uid = usuario["id"]
    ahora = datetime.now(timezone.utc)

    try:
        # 1) Reintento: la app reenvía la misma marcación (mismo id) tras un corte de red.
        existente = await sb.marcacion_fila(str(datos.id))
        if existente:
            if existente["usuario_id"] != uid:
                raise HTTPException(409, "Ese identificador de marcación ya está en uso")
            return JSONResponse(
                {"marcacion": _resumen(existente), "anomalias": [], "reintento": True}, status_code=200
            )

        # 2) La hora la manda el dispositivo; no puede ser del futuro.
        if datos.fecha_hora > ahora + MARGEN_FUTURO:
            raise HTTPException(422, "La hora de la marcación está en el futuro; revisa la hora de tu dispositivo")

        # 3) Dispositivo: si la cuenta ya tiene uno vinculado, la app debe marcar desde ese.
        vinculado = usuario.get("dispositivo_id")
        if datos.origen == "app" and vinculado and datos.dispositivo_id and datos.dispositivo_id != vinculado:
            raise HTTPException(403, "Este dispositivo no es el vinculado a tu cuenta")

        # 4) Sede del usuario.
        sede = await sb.sede_fila(usuario["sede_id"]) if usuario.get("sede_id") else None
        if not sede or not sede["activa"]:
            raise HTTPException(409, "Tu sede no está disponible; contacta a Talento Humano")

        cfg = await sb.configuracion()
        desde_dia, hasta_dia = reglas.limites_del_dia(datos.fecha_hora)

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
        verif = await verificador.verificar(usuario, datos.selfie_b64)
        if verif.estado == "fallida":
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
                    "fecha_hora": _iso(datos.fecha_hora),
                    "latitud": datos.latitud,
                    "longitud": datos.longitud,
                    "precision_m": datos.precision_m,
                    "origen": datos.origen,
                    "dispositivo_id": datos.dispositivo_id,
                    "motivo_contingencia": datos.motivo_contingencia,
                    "verificacion": verif.estado,
                    "similitud_score": verif.score,
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
        if not zona.dentro and not sede["permite_fuera_geocerca"]:
            hallazgos.append(reglas.Hallazgo("fuera_geocerca", zona.descripcion))
        # Día no laborable (feriado o día que no trabaja). En ese caso no se evalúa el horario:
        # llegar «tarde» a un día que no le toca solo duplicaría el aviso.
        feriado = await sb.feriado_activo(reglas.a_local(datos.fecha_hora).date().isoformat())
        h = reglas.evaluar_dia_laborable(datos.fecha_hora, usuario.get("dias_laborables") or [1, 2, 3, 4, 5], feriado)
        if h:
            hallazgos.append(h)
        else:
            h = reglas.evaluar_horario(
                datos.tipo,
                datos.fecha_hora,
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
                datos.fecha_hora,
                cfg["almuerzo_max_min"],
                cfg["tolerancia_min"],
            )
            if h:
                hallazgos.append(h)
        anterior = await sb.marcacion_anterior(uid, _iso(datos.fecha_hora))
        h = reglas.evaluar_desplazamiento(
            anterior, datos.latitud, datos.longitud, datos.fecha_hora, cfg["velocidad_max_kmh"]
        )
        if h:
            hallazgos.append(h)
        if datos.origen == "web":
            previas = await sb.contar_marcaciones_web(
                uid, _iso(datos.fecha_hora - timedelta(days=30)), _iso(datos.fecha_hora)
            )
            h = reglas.evaluar_uso_web(previas, cfg["max_marcaciones_web_30d"])
            if h:
                hallazgos.append(h)

        anomalias = [
            await _registrar_anomalia(sb, uid, h.tipo, h.descripcion, marcacion["id"]) for h in hallazgos
        ]
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo registrar la marcación: {e.message}")

    return {
        "marcacion": _resumen(marcacion),
        "anomalias": [{"tipo": a["tipo"], "detalle": a.get("detalle")} for a in anomalias],
        "reintento": False,
    }
