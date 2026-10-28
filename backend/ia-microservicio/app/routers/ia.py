"""Claves de IA del chat de justificación: cada una es proveedor + modelo + llave de API (cifrada), con nombre, y UNA sola
está activa: la que responde (o, si no hay ninguna, la del .env del servidor).

Las claves viven en `ia_claves`, que solo este servicio puede tocar: el panel nunca recibe una llave de vuelta, solo
«termina en …1234». Cada cambio queda en la bitácora (la llave, solo con sus últimos 4 caracteres, y el motivo si se dio).
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app import cifrado
from app.auth import Administrador, exigir_administrador, get_supabase
from app.config import Settings, get_settings
from app.ia import IAError, PROVEEDORES, crear_cliente_de, llave_de_clave, llave_de_entorno
from app.schemas import ClaveIAEdicion, ClaveIANueva, PruebaClave
from app.supabase_client import SupabaseClient, SupabaseError

router = APIRouter(prefix="/ia", tags=["ia"])


def _ahora() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clave_de_cifrado(cfg: Settings) -> bytes:
    try:
        return cifrado.clave_desde_texto(cfg.rostro_clave_aes)
    except cifrado.ClaveInvalida:
        raise HTTPException(503, "El servidor no tiene la clave de cifrado (ROSTRO_CLAVE_AES): no puede guardar llaves")


def _cifrar(llave: str, proveedor: str, cfg: Settings) -> dict:
    cifrada = cifrado.bytea_para_postgrest(cifrado.cifrar_texto(llave, _clave_de_cifrado(cfg), proveedor))
    return {"llave_cifrada": cifrada, "version_clave": cfg.rostro_version_clave, "ultimos_4": llave[-4:]}


def _publica(fila: dict) -> dict:
    """Lo que ve el panel de una clave: nunca la llave, solo sus últimos 4 caracteres."""
    p = PROVEEDORES[fila["proveedor"]]
    return {
        "id": fila["id"], "nombre": fila["nombre"], "proveedor": fila["proveedor"], "proveedor_nombre": p["nombre"],
        "modelo": fila.get("modelo") or None, "modelo_predeterminado": p["modelo"], "activa": bool(fila.get("activa")),
        "ultimos_4": fila["ultimos_4"], "created_at": fila.get("created_at"), "updated_at": fila.get("updated_at"),
    }


def _en_uso(activa: dict | None, cfg: Settings) -> tuple[dict | None, bool]:
    """Qué IA respondería ahora y si la clave activa del panel no se pudo abrir (entonces se usa el .env, si hay)."""
    ilegible = False
    if activa:
        if llave_de_clave(activa, cfg):
            p = PROVEEDORES[activa["proveedor"]]
            return {"origen": "panel", "nombre": activa["nombre"], "proveedor": activa["proveedor"], "proveedor_nombre": p["nombre"],
                    "modelo": activa.get("modelo") or p["modelo"]}, False
        ilegible = True
    if llave_de_entorno(cfg, cfg.ia_proveedor):
        p = PROVEEDORES[cfg.ia_proveedor]
        return {"origen": "servidor", "nombre": None, "proveedor": cfg.ia_proveedor, "proveedor_nombre": p["nombre"],
                "modelo": cfg.ia_modelo or p["modelo"]}, ilegible
    return None, ilegible


async def _bitacora(sb: SupabaseClient, admin: Administrador, evento: str, clave_id: str, campo: str | None,
                    antes: str | None, despues: str | None, motivo: str | None = None) -> None:
    await sb.registrar_bitacora({
        "usuario_id": admin.id, "evento": evento, "entidad": "ia_claves", "entidad_id": clave_id, "campo": campo,
        "valor_anterior": antes, "valor_nuevo": despues, "motivo": motivo or None,
    })


def _resumen(fila: dict) -> str:
    return f"{fila['nombre']} ({fila['proveedor']}) …{fila['ultimos_4']}"


def _es_duplicado(e: SupabaseError) -> bool:
    return e.status == 409 and "duplicate" in e.message.lower()


def _nombre_repetido(claves: list[dict], nombre: str, salvo: str | None = None) -> bool:
    return any(c["id"] != salvo and c["nombre"].strip().lower() == nombre.strip().lower() for c in claves)


async def _clave_o_404(sb: SupabaseClient, clave_id: str) -> dict:
    try:
        fila = await sb.clave_ia(clave_id)
    except SupabaseError as e:
        if e.status == 400:     # un id que no es uuid
            fila = None
        else:
            raise HTTPException(502, f"No se pudo consultar la clave: {e.message}")
    if not fila:
        raise HTTPException(404, "Clave no encontrada")
    return fila


@router.get("/claves")
async def listar(
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Las claves guardadas (la activa primero), los proveedores disponibles y qué IA responde ahora."""
    try:
        filas = await sb.claves_ia()
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo consultar las claves de IA: {e.message}")
    filas.sort(key=lambda f: (not f.get("activa"), f.get("created_at") or ""))
    activa = next((f for f in filas if f.get("activa")), None)
    en_uso, ilegible = _en_uso(activa, cfg)
    try:
        cifrado.clave_desde_texto(cfg.rostro_clave_aes)
        puede = True
    except cifrado.ClaveInvalida:
        puede = False
    return {
        "puede_guardar_llaves": puede,
        "proveedores": [{"id": k, "nombre": v["nombre"], "modelo_predeterminado": v["modelo"]} for k, v in PROVEEDORES.items()],
        "claves": [_publica(f) for f in filas],
        "en_uso": en_uso,
        "activa_ilegible": ilegible,
    }


async def _activar(sb: SupabaseClient, admin: Administrador, fila: dict, motivo: str | None, tras_guardar: bool = False) -> None:
    try:
        previa = await sb.clave_ia_activa()
        await sb.activar_clave_ia(fila["id"], admin.id)
        if previa and previa["id"] != fila["id"]:
            await _bitacora(sb, admin, "desactivar", previa["id"], "activa", "true", "false", f"Reemplazada por «{fila['nombre']}»")
        await _bitacora(sb, admin, "activar", fila["id"], "activa", "false", "true", motivo)
    except SupabaseError as e:
        cola = " La clave quedó guardada, pero inactiva." if tras_guardar else ""
        raise HTTPException(502, f"No se pudo activar la clave: {e.message}.{cola}")


@router.post("/claves", status_code=201)
async def crear(
    datos: ClaveIANueva,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Guarda una clave nueva (la llave, cifrada). Con `activar` pasa a ser la activa y la anterior se desactiva."""
    cifrada = _cifrar(datos.llave, datos.proveedor, cfg)
    try:
        if _nombre_repetido(await sb.claves_ia(), datos.nombre):
            raise HTTPException(409, "Ya tienes una clave con ese nombre")
        fila = await sb.insertar_clave_ia({
            "nombre": datos.nombre, "proveedor": datos.proveedor, "modelo": datos.modelo or None, **cifrada,
            "activa": False, "created_by": admin.id, "updated_by": admin.id,
        })
        await _bitacora(sb, admin, "crear", fila["id"], "clave", None, _resumen(fila), datos.motivo)
    except SupabaseError as e:
        if _es_duplicado(e):
            raise HTTPException(409, "Ya tienes una clave con ese nombre")
        raise HTTPException(502, f"No se pudo guardar la clave: {e.message}")
    if datos.activar:
        await _activar(sb, admin, fila, datos.motivo, tras_guardar=True)
        fila = {**fila, "activa": True}
    return _publica(fila)


@router.patch("/claves/{clave_id}")
async def editar(
    clave_id: str,
    datos: ClaveIAEdicion,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Cambia nombre, modelo y/o llave, y puede activarla. El proveedor no cambia. Sin llave en el cuerpo, se conserva."""
    fila = await _clave_o_404(sb, clave_id)
    enviados = datos.model_fields_set
    cambios: dict = {}
    registros: list[tuple[str, str | None, str | None]] = []       # (campo, antes, después)
    try:
        if datos.nombre is not None and datos.nombre != fila["nombre"]:
            if _nombre_repetido(await sb.claves_ia(), datos.nombre, salvo=fila["id"]):
                raise HTTPException(409, "Ya tienes una clave con ese nombre")
            cambios["nombre"] = datos.nombre
            registros.append(("nombre", fila["nombre"], datos.nombre))
        if "modelo" in enviados and (datos.modelo or None) != (fila.get("modelo") or None):
            cambios["modelo"] = datos.modelo or None
            registros.append(("modelo", fila.get("modelo"), datos.modelo or None))
        if datos.llave is not None:
            cambios.update(_cifrar(datos.llave, fila["proveedor"], cfg))
            registros.append(("llave", f"…{fila['ultimos_4']}", f"…{datos.llave[-4:]}"))
        if datos.activa is False and fila.get("activa"):
            raise HTTPException(409, "Es la clave activa: activa otra para poder desactivar esta")
        activar = datos.activa is True and not fila.get("activa")
        if cambios:
            fila = await sb.actualizar_clave_ia(fila["id"], {**cambios, "updated_at": _ahora(), "updated_by": admin.id})
            for campo, antes, despues in registros:
                await _bitacora(sb, admin, "actualizar", fila["id"], campo, antes, despues, datos.motivo)
    except SupabaseError as e:
        if _es_duplicado(e):
            raise HTTPException(409, "Ya tienes una clave con ese nombre")
        raise HTTPException(502, f"No se pudo guardar la clave: {e.message}")
    if activar:
        await _activar(sb, admin, fila, datos.motivo)
        fila = {**fila, "activa": True}
    return {"mensaje": "Clave guardada" if (cambios or activar) else "Sin cambios", "clave": _publica(fila)}


@router.delete("/claves/{clave_id}")
async def eliminar(
    clave_id: str,
    admin: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
):
    """Elimina una clave inactiva (la activa no: primero se activa otra)."""
    fila = await _clave_o_404(sb, clave_id)
    if fila.get("activa"):
        raise HTTPException(409, "Es la clave activa: activa otra antes de eliminarla")
    try:
        await sb.borrar_clave_ia(fila["id"])
        await _bitacora(sb, admin, "actualizar", fila["id"], "clave", _resumen(fila), None, "Clave eliminada")
    except SupabaseError as e:
        raise HTTPException(502, f"No se pudo eliminar la clave: {e.message}")
    return {"mensaje": f"Clave «{fila['nombre']}» eliminada"}


def _explicar(e: IAError) -> str:
    if e.status in (401, 403):
        return "La llave no es válida o no tiene permiso para usar ese modelo."
    if e.status in (400, 404):
        return "El modelo no existe o no está disponible para esa llave."
    if e.status == 429:
        return "El proveedor rechazó la llamada por límite de uso o de saldo."
    return f"No se pudo completar la prueba: {e}"


@router.post("/claves/{clave_id}/probar")
async def probar(
    clave_id: str,
    datos: PruebaClave,
    _: Administrador = Depends(exigir_administrador),
    sb: SupabaseClient = Depends(get_supabase),
    cfg: Settings = Depends(get_settings),
):
    """Una llamada mínima con la llave guardada de esa clave. Responde siempre 200 con `ok` y un mensaje."""
    fila = await _clave_o_404(sb, clave_id)
    llave = llave_de_clave(fila, cfg)
    if not llave:
        return {"ok": False, "mensaje": "No se pudo abrir la llave guardada (¿cambió ROSTRO_CLAVE_AES?). Escríbela de nuevo en «Editar»."}
    modelo = datos.modelo or fila.get("modelo")
    nombre = PROVEEDORES[fila["proveedor"]]["nombre"]
    cliente = crear_cliente_de(fila["proveedor"], llave, modelo, cfg.ia_timeout_s)
    usado = (modelo or "").strip() or PROVEEDORES[fila["proveedor"]]["modelo"]
    try:
        await cliente.evaluar(
            {"tipo": "fuera_horario", "detalle": "Prueba de conexión del administrador", "fecha": None},
            [{"emisor": "usuario", "contenido": "Prueba de conexión: llegué tarde porque había tráfico."}],
            True,
        )
    except IAError as e:
        return {"ok": False, "mensaje": _explicar(e)}
    finally:
        await cliente.aclose()
    return {"ok": True, "mensaje": f"Conexión correcta con {nombre} (modelo {usado})."}
