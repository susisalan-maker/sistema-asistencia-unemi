import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import registrar_manejadores
from app.biometria import cargar_motor, umbral_de_vida
from app.config import get_settings
from app.ia import crear_cliente
from app.routers import anomalias, dispositivo, feriados, marcaciones, procesos, rostro, sedes, usuarios
from app.verificacion import configurar_verificador
from app.supabase_client import SupabaseClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    log = logging.getLogger("uvicorn.error")
    if cfg.verificacion_facial == "simulada":
        log.warning("Verificación facial SIMULADA: las marcaciones se dan por verificadas (VERIFICACION_FACIAL=simulada)")
    else:
        configurar_verificador(cfg)  # falla al arrancar si falta o está mal ROSTRO_CLAVE_AES
        await asyncio.to_thread(cargar_motor, cfg.modelos_dir, umbral_de_vida(cfg))  # carga los modelos ahora, no en la primera marcación
        log.info("Verificación facial real activa (umbral %.2f)", cfg.rostro_umbral)
        if not cfg.vida_activa:
            log.warning("Detección de vida APAGADA (VIDA_ACTIVA=false): una foto de otra foto pasaría la verificación")
    app.state.supabase = SupabaseClient(cfg.supabase_url, cfg.supabase_service_role_key)
    app.state.ia = crear_cliente(cfg)
    if app.state.ia:
        log.info("Chat de justificación con IA activo (%s)", cfg.ia_proveedor)
    else:
        llave = "GEMINI_API_KEY" if cfg.ia_proveedor == "gemini" else "ANTHROPIC_API_KEY"
        log.warning("Sin %s: el chat de justificación funciona sin IA (un mensaje y pasa a revisión)", llave)
    yield
    await app.state.supabase.aclose()
    if app.state.ia:
        await app.state.ia.aclose()


app = FastAPI(title="Asistencia UNEMI · Microservicio", version="0.1.0", lifespan=lifespan)

# get_settings() se evalúa al importar solo si hay .env; en pruebas se reemplaza con overrides.
try:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_list,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Authorization", "Content-Type"],
    )
except Exception:  # falta configuración (p. ej. en pruebas)
    pass

registrar_manejadores(app)
app.include_router(usuarios.router)
app.include_router(sedes.router_sedes)
app.include_router(sedes.router_bloques)
app.include_router(marcaciones.router)
app.include_router(dispositivo.router)
app.include_router(rostro.router)
app.include_router(procesos.router)
app.include_router(anomalias.router)
app.include_router(feriados.router)


@app.get("/health")
async def health():
    return {"estado": "ok"}
