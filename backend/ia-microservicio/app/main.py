import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import feriados, marcaciones, sedes, usuarios
from app.supabase_client import SupabaseClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    cfg = get_settings()
    logging.getLogger("uvicorn.error").warning(
        "Verificación facial SIMULADA: las marcaciones se dan por verificadas (ver app/verificacion.py)"
    )
    app.state.supabase = SupabaseClient(cfg.supabase_url, cfg.supabase_service_role_key)
    yield
    await app.state.supabase.aclose()


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

app.include_router(usuarios.router)
app.include_router(sedes.router_sedes)
app.include_router(sedes.router_bloques)
app.include_router(marcaciones.router)
app.include_router(feriados.router)


@app.get("/health")
async def health():
    return {"estado": "ok"}
