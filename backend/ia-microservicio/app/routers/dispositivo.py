"""Vinculación del celular a la cuenta (docs/logica-negocio.md, sección 8).

El usuario no puede escribir su propia fila de `usuarios` (la política de la base solo lo permite al
Administrador), así que vincular su dispositivo pasa por aquí. Reglas:
  * Una cuenta tiene a lo sumo un dispositivo, y un dispositivo pertenece a una sola cuenta.
  * Repetir la vinculación con el mismo dispositivo no hace nada (la app puede reintentar).
  * Para cambiar de celular, el Administrador reinicia el vínculo; el usuario no lo cambia solo.

Además del vínculo, el celular registra aquí la clave pública que creó en su chip de seguridad (`POST /dispositivo/clave`):
con ella el servidor comprueba la firma de las marcaciones sin conexión (app/firma_dispositivo.py). Una cuenta tiene una
sola clave; para otra, el Administrador reinicia el celular (lo que borra también la clave).
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import firma_dispositivo as firma
from app.auth import exigir_usuario, get_supabase
from app.config import Settings, get_settings
from app.schemas import ClaveNueva, DispositivoNuevo
from app.supabase_client import SupabaseClient, SupabaseError

log = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/dispositivo", tags=["dispositivo"])


@router.post("/vincular")
async def vincular(
    datos: DispositivoNuevo,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
):
    actual = usuario.get("dispositivo_id")
    if actual == datos.dispositivo_id:
        return {"dispositivo": "este", "mensaje": "Este dispositivo ya estaba vinculado a tu cuenta"}
    if actual:
        raise HTTPException(
            409, "Tu cuenta ya tiene otro celular vinculado. Pide a Talento Humano que lo reinicie para usar este"
        )
    try:
        fila = await sb.vincular_dispositivo(usuario["id"], datos.dispositivo_id)
    except SupabaseError as e:
        if e.status == 409 and "duplicate" in e.message.lower():
            raise HTTPException(409, "Este celular ya está vinculado a otra cuenta")
        raise HTTPException(502, f"No se pudo vincular el dispositivo: {e.message}")
    if fila is None:
        # Otro celular de la misma cuenta se vinculó justo antes.
        raise HTTPException(
            409, "Tu cuenta ya tiene otro celular vinculado. Pide a Talento Humano que lo reinicie para usar este"
        )
    return {"dispositivo": "este", "mensaje": "Dispositivo vinculado"}


MENSAJE_OTRA_CLAVE = (
    "Tu cuenta ya tiene registrada la clave de seguridad de otro celular (o de esta app antes de reinstalarla). "
    "Pide a Talento Humano que reinicie tu celular para registrar la nueva"
)


@router.post("/clave")
async def registrar_clave(
    datos: ClaveNueva,
    usuario: dict = Depends(exigir_usuario),
    sb: SupabaseClient = Depends(get_supabase),
    ajustes: Settings = Depends(get_settings),
):
    """Registra la clave pública del celular vinculado (la privada vive en su chip de seguridad).

    Reglas:
      * Solo el celular vinculado a la cuenta puede registrar su clave.
      * Repetir con la misma clave no hace nada (la app puede reintentar).
      * Una clave distinta de la ya registrada se rechaza: la reinstalación o el cambio de celular los resuelve el
        Administrador reiniciando el celular. Única excepción: en Android, si la nueva clave demuestra estar en el hardware,
        con el celular arrancado con su sistema original y la cadena anclada en la raíz de Google configurada, se reemplaza
        (la app se reinstaló en el mismo celular). Con root o el cargador de arranque abierto eso no se cumple.
    """
    vinculado = usuario.get("dispositivo_id")
    if not vinculado or vinculado != datos.dispositivo_id:
        raise HTTPException(409, "Primero vincula este celular a tu cuenta")

    try:
        clave = firma.cargar_clave_publica(datos.clave_publica)
    except firma.ClaveInvalida as e:
        raise HTTPException(422, f"La clave del celular no es válida: {e}")
    canonica = firma.clave_a_b64(clave)

    actual = usuario.get("clave_publica")
    if actual == canonica:
        return {"clave": "ya_registrada", "mensaje": "La clave de este celular ya estaba registrada"}

    if datos.plataforma == "android" and datos.cadena:
        try:
            evidencia = firma.evaluar_atestacion(
                datos.cadena, canonica, firma.desafio_de_clave(usuario["id"], datos.dispositivo_id), ajustes.raices_atestacion
            )
        except firma.AtestacionInvalida as e:
            log.warning("Prueba de hardware rechazada para %s: %s", usuario["id"], e)
            raise HTTPException(422, "No pudimos comprobar que la clave está protegida por el chip de seguridad de tu celular")
    else:
        evidencia = {"plataforma": datos.plataforma, "nivel": "sin_prueba", "arranque_verificado": None, "raiz_anclada": False}

    if ajustes.firma_exige_hardware and datos.plataforma == "android" and not firma.esta_en_hardware(evidencia):
        raise HTTPException(422, "Tu celular no demostró que la clave está protegida por su chip de seguridad")

    if actual:
        reemplazable = (
            datos.plataforma == "android" and firma.esta_en_hardware(evidencia)
            and evidencia.get("arranque_verificado") is True and evidencia.get("raiz_anclada") is True
        )
        if not reemplazable:
            raise HTTPException(409, MENSAJE_OTRA_CLAVE)

    try:
        fila = await sb.registrar_clave(
            usuario["id"], canonica, evidencia, datetime.now(timezone.utc).isoformat(), reemplazando=actual
        )
    except SupabaseError as e:
        if e.status == 409 and "duplicate" in e.message.lower():
            raise HTTPException(409, "Esa clave ya está registrada en otra cuenta")
        raise HTTPException(502, f"No se pudo registrar la clave del celular: {e.message}")
    if fila is None:
        # Otra solicitud registró una clave justo antes.
        raise HTTPException(409, MENSAJE_OTRA_CLAVE)
    return {
        "clave": "reemplazada" if actual else "registrada",
        "nivel": evidencia["nivel"],
        "mensaje": "Clave del celular registrada",
    }
