"""Modelos de datos del sistema: una clase por tabla de Supabase.

IMPORTANTE: aquí NO se crean las tablas (eso lo hace el SQL en
`supabase/migrations/0001_init.sql`). Estas clases solo describen las filas para
que el código tenga tipos y validación. Si cambias una tabla o un enum en el SQL,
cambia también esta clase; la prueba `tests/test_models.py` avisa si se desfasan.
"""

from datetime import datetime, time
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel


# ───────────────────────── Enums (tipos de PostgreSQL) ─────────────────────────
class RolUsuario(StrEnum):
    usuario = "usuario"
    administrador = "administrador"


class TipoMarcacion(StrEnum):
    ingreso = "ingreso"
    salida_almuerzo = "salida_almuerzo"
    entrada_almuerzo = "entrada_almuerzo"
    salida = "salida"


class OrigenMarcacion(StrEnum):
    app = "app"
    web = "web"


class MotivoContingencia(StrEnum):
    celular_perdido = "celular_perdido"
    celular_robado = "celular_robado"
    celular_olvidado = "celular_olvidado"
    celular_danado = "celular_danado"
    sin_bateria = "sin_bateria"
    otro = "otro"


class VerificacionRostro(StrEnum):
    verificada = "verificada"
    pendiente = "pendiente"
    fallida = "fallida"


class TipoAnomalia(StrEnum):
    fuera_geocerca = "fuera_geocerca"
    sin_salida = "sin_salida"
    desplazamiento_inusual = "desplazamiento_inusual"
    fuera_horario = "fuera_horario"
    duplicada = "duplicada"
    verificacion_fallida = "verificacion_fallida"
    uso_recurrente_web = "uso_recurrente_web"
    almuerzo_excedido = "almuerzo_excedido"
    sin_regreso_almuerzo = "sin_regreso_almuerzo"


class DetectorAnomalia(StrEnum):
    regla = "regla"
    modelo = "modelo"


class EstadoAnomalia(StrEnum):
    pendiente = "pendiente"
    en_revision = "en_revision"
    justificada = "justificada"
    rechazada = "rechazada"
    sin_justificar = "sin_justificar"


class ClasificacionJustificacion(StrEnum):
    aceptable = "aceptable"
    requiere_revision = "requiere_revision"
    sospechosa = "sospechosa"


class DecisionCaso(StrEnum):
    aprobada = "aprobada"
    rechazada = "rechazada"
    escalada = "escalada"


class EmisorMensaje(StrEnum):
    usuario = "usuario"
    asistente = "asistente"


class EventoBitacora(StrEnum):
    crear = "crear"
    actualizar = "actualizar"
    activar = "activar"
    desactivar = "desactivar"
    registrar_rostro = "registrar_rostro"
    resetear_rostro = "resetear_rostro"
    resetear_dispositivo = "resetear_dispositivo"
    decidir_caso = "decidir_caso"


# ───────────────────────────── Tablas ─────────────────────────────
class Sede(BaseModel):
    """tabla `sedes` (campus)."""

    id: UUID
    nombre: str
    latitud: float
    longitud: float
    radio_metros: int
    permite_fuera_geocerca: bool
    activa: bool
    created_at: datetime
    updated_at: datetime
    created_by: UUID | None = None
    updated_by: UUID | None = None


class Bloque(BaseModel):
    """tabla `bloques` (edificios/zonas de marcación dentro de una sede)."""

    id: UUID
    sede_id: UUID
    nombre: str
    latitud: float
    longitud: float
    radio_metros: int
    activo: bool
    created_at: datetime
    created_by: UUID | None = None
    updated_at: datetime
    updated_by: UUID | None = None


class Usuario(BaseModel):
    """tabla `usuarios` (el `id` es el mismo de Supabase Auth)."""

    id: UUID
    nombres: str
    apellidos: str
    email: str
    rol: RolUsuario
    sede_id: UUID | None = None
    jornada_inicio: time
    jornada_fin: time
    dispositivo_id: str | None = None
    push_token: str | None = None
    fecha_registro_rostro: datetime | None = None
    fecha_consentimiento_biometrico: datetime | None = None
    activo: bool
    created_at: datetime
    created_by: UUID | None = None
    updated_at: datetime
    updated_by: UUID | None = None

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombres} {self.apellidos}".strip()


class Rostro(BaseModel):
    """tabla `rostros`. Solo la lee el microservicio. NUNCA devolver esto en una respuesta de la API."""

    id: UUID
    usuario_id: UUID
    vectores_cifrados: bytes
    version_clave: int
    created_at: datetime


class Configuracion(BaseModel):
    """tabla `configuracion` (una sola fila, id = 1)."""

    id: int
    plazo_justificacion_h: int
    plazo_revision_h: int
    tolerancia_min: int
    almuerzo_max_min: int
    velocidad_max_kmh: int
    max_marcaciones_web_30d: int
    modelo_ia: str
    created_at: datetime
    created_by: UUID | None = None
    updated_at: datetime
    updated_by: UUID | None = None


class Marcacion(BaseModel):
    """tabla `marcaciones` (inmutable una vez registrada)."""

    id: UUID
    usuario_id: UUID
    sede_id: UUID
    bloque_id: UUID | None = None
    tipo: TipoMarcacion
    fecha_hora: datetime
    latitud: float
    longitud: float
    precision_m: float | None = None
    origen: OrigenMarcacion
    dispositivo_id: str | None = None
    motivo_contingencia: MotivoContingencia | None = None
    verificacion: VerificacionRostro
    similitud_score: float | None = None
    created_at: datetime


class Anomalia(BaseModel):
    """tabla `anomalias`."""

    id: UUID
    numero: int
    marcacion_id: UUID | None = None
    usuario_id: UUID
    tipo: TipoAnomalia
    detector: DetectorAnomalia
    score: float | None = None
    descripcion_ia: str | None = None
    intentos_fallidos: int
    estado: EstadoAnomalia
    fecha_vencimiento: datetime
    created_at: datetime


class Justificacion(BaseModel):
    """tabla `justificaciones`."""

    id: UUID
    anomalia_id: UUID
    resumen_ia: str | None = None
    clasificacion_ia: ClasificacionJustificacion | None = None
    confianza_ia: float | None = None
    decision_final: DecisionCaso | None = None
    comentario_admin: str | None = None
    revisado_por: UUID | None = None
    fecha_decision: datetime | None = None
    created_at: datetime


class MensajeChat(BaseModel):
    """tabla `mensajes_chat` (conversación de justificación)."""

    id: UUID
    justificacion_id: UUID
    emisor: EmisorMensaje
    contenido: str
    created_at: datetime


class Bitacora(BaseModel):
    """tabla `bitacora` (auditoría inmutable). `usuario_id` nulo = el sistema."""

    id: UUID
    usuario_id: UUID | None = None
    evento: EventoBitacora
    entidad: str
    entidad_id: str
    campo: str | None = None
    valor_anterior: str | None = None
    valor_nuevo: str | None = None
    motivo: str | None = None
    created_at: datetime
