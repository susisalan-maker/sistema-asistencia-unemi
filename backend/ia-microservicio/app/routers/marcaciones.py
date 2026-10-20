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

from fastapi import APIRouter, Depends, Header, HTTPException
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
        "dispositivo": dispositivo,
        "rostro_registrado": bool(usuario.get("fecha_registro_rostro")),
        # En modo simulado (solo desarrollo) no se exige rostro para marcar.
        "rostro_requerido": cfg.verificacion_facial == "real",
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
            raise HTTPException(
                422,
                "No pudimos verificar tu rostro. Intenta de nuevo con buena luz y de frente"
                + (f" ({verif.motivo})" if verif.motivo else ""),
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
