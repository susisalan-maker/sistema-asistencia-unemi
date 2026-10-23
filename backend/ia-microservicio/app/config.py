from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    url_panel_web: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    # ---- Proceso periódico de ausencias (POST /procesos/ausencias) ----
    # Secreto que debe enviar quien lo programa (cabecera X-Proceso-Secreto). Sin él, el endpoint está apagado.
    procesos_secreto: str | None = None
    # Minutos después de `jornada_fin` que se espera antes de dar la jornada por terminada.
    ausencias_gracia_min: int = 120
    # Cuántos días hacia atrás revisa (cubre una caída del servicio o del programador).
    ausencias_dias_atras: int = 3

    # ---- Verificación facial (docs/logica-negocio.md, sección 2.1) ----
    # "real": registra y compara rostros de verdad. "simulada": toda marcación pasa (solo para desarrollo).
    verificacion_facial: Literal["real", "simulada"] = "real"
    # Clave AES-256 con la que se cifran los vectores faciales: 64 caracteres hexadecimales (o 32 bytes en
    # base64). Solo vive en el servidor. Generar: python -c "import secrets; print(secrets.token_hex(32))"
    rostro_clave_aes: str | None = None
    rostro_version_clave: int = 1
    # Los umbrales del reconocimiento (parecido, vida, giro, luz, nitidez, tamaños) los fija el administrador en el panel
    # (Configuración → Reconocimiento facial) y se guardan en la tabla `configuracion`. Estos tres valores solo
    # se usan como respaldo si la base no los trae (por ejemplo, sin la migración 0009).
    # Similitud coseno mínima (0 a 1) para dar por buena una selfie.
    rostro_umbral: float = 0.40
    # Similitud mínima entre las fotos del registro para aceptar que son de la misma persona.
    rostro_umbral_registro: float = 0.35
    # Detección de vida pasiva (¿es un rostro real o una foto/pantalla?). `vida_activa` enciende o apaga la detección
    # (carga los modelos al arrancar: se decide aquí). `vida_umbral` (probabilidad mínima de «real», 0 a 1) es el
    # respaldo del valor que se fija en el panel.
    vida_activa: bool = True
    vida_umbral: float = 0.5
    # Carpeta de los modelos ONNX (se descargan con scripts/descargar_modelos.py)
    modelos_dir: str = "modelos"

    # ---- Chat de justificación con IA (docs/logica-negocio.md, secciones 5 y 6) ----
    # Qué proveedor responde en el chat. La llave de ese proveedor SOLO vive en el servidor. Sin llave el chat funciona sin
    # IA: un mensaje y el caso pasa a revisión.
    ia_proveedor: Literal["anthropic", "gemini", "openai"] = "anthropic"
    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    # Vacío = el modelo por omisión del proveedor (ver app/ia.py).
    ia_modelo: str | None = None
    ia_timeout_s: float = 20
    # Máximo de mensajes de la persona por caso (cuentan también los de fuera de tema) y de preguntas del asistente.
    ia_max_mensajes_usuario: int = 3
    ia_max_preguntas: int = 1
    # Aprobación automática: solo faltas de menor riesgo, con clasificación «aceptable» y confianza mínima (ver chat_ia.py).
    ia_autoaprobar: bool = True
    ia_umbral_autoaprobar: float = 0.9

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
