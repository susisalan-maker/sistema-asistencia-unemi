from datetime import date, time, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, EmailStr, Field, StringConstraints, field_validator, model_validator


def _dias_validos(dias: list[int]) -> list[int]:
    if not dias or any(d < 1 or d > 7 for d in dias):
        raise ValueError("Los días laborables van de 1 (lunes) a 7 (domingo) y debe haber al menos uno")
    if len(set(dias)) != len(dias):
        raise ValueError("Hay días laborables repetidos")
    return sorted(dias)


DiasLaborables = Annotated[list[int], AfterValidator(_dias_validos)]


class UsuarioNuevo(BaseModel):
    nombres: str = Field(min_length=2, max_length=80)
    apellidos: str = Field(min_length=2, max_length=80)
    email: EmailStr
    rol: Literal["usuario", "administrador"] = "usuario"
    sede_id: UUID | None = None
    jornada_inicio: time = time(8, 0)
    jornada_fin: time = time(17, 0)
    dias_laborables: DiasLaborables = [1, 2, 3, 4, 5]

    @model_validator(mode="after")
    def validar(self):
        if self.rol == "usuario" and self.sede_id is None:
            raise ValueError("Un usuario con rol 'usuario' debe tener sede")
        if self.jornada_fin <= self.jornada_inicio:
            raise ValueError("La jornada debe terminar después de iniciar")
        return self


class HorarioCambios(BaseModel):
    """Edición del horario de un usuario: solo los campos enviados cambian."""

    jornada_inicio: time | None = None
    jornada_fin: time | None = None
    dias_laborables: DiasLaborables | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self


NombrePersona = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]


class UsuarioCambios(BaseModel):
    """Edición de un usuario por el Administrador: solo los campos enviados cambian.
    Incluye el horario (lo mismo que HorarioCambios) más nombres, correo, rol y sede."""

    nombres: NombrePersona | None = None
    apellidos: NombrePersona | None = None
    email: EmailStr | None = None
    rol: Literal["usuario", "administrador"] | None = None
    sede_id: UUID | None = None
    jornada_inicio: time | None = None
    jornada_fin: time | None = None
    dias_laborables: DiasLaborables | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self


class UsuarioCreado(BaseModel):
    id: UUID
    email: EmailStr
    mensaje: str


# ---- Sedes y bloques (los rangos son los mismos CHECK de la base de datos) ----
Nombre = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=100)]
Latitud = Annotated[float, Field(ge=-90, le=90)]
Longitud = Annotated[float, Field(ge=-180, le=180)]
RadioSede = Annotated[int, Field(ge=50, le=1000)]
RadioBloque = Annotated[int, Field(ge=20, le=200)]


class SedeNueva(BaseModel):
    nombre: Nombre
    latitud: Latitud
    longitud: Longitud
    radio_metros: RadioSede
    permite_fuera_geocerca: bool = False


class SedeCambios(BaseModel):
    nombre: Nombre | None = None
    latitud: Latitud | None = None
    longitud: Longitud | None = None
    radio_metros: RadioSede | None = None
    permite_fuera_geocerca: bool | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self


class BloqueNuevo(BaseModel):
    sede_id: UUID
    nombre: Nombre
    latitud: Latitud
    longitud: Longitud
    radio_metros: RadioBloque


class BloqueCambios(BaseModel):
    nombre: Nombre | None = None
    latitud: Latitud | None = None
    longitud: Longitud | None = None
    radio_metros: RadioBloque | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self


# ---- Marcación ----
TipoMarcacion = Literal["ingreso", "salida_almuerzo", "entrada_almuerzo", "salida"]
MotivoContingencia = Literal[
    "celular_perdido", "celular_robado", "celular_olvidado", "celular_danado", "sin_bateria", "otro"
]


class MarcacionNueva(BaseModel):
    # La app genera el id antes de guardar en su base local: reintentar la misma marcación no la duplica.
    id: UUID
    tipo: TipoMarcacion
    fecha_hora: AwareDatetime  # hora del dispositivo al marcar (con zona horaria)
    latitud: Latitud
    longitud: Longitud
    precision_m: float | None = Field(default=None, ge=0, le=100_000)
    origen: Literal["app", "web"] = "app"
    dispositivo_id: str | None = Field(default=None, min_length=1, max_length=200)
    motivo_contingencia: MotivoContingencia | None = None
    selfie_b64: str | None = Field(default=None, max_length=8_000_000)  # la foto no se guarda

    @model_validator(mode="after")
    def coherente(self):
        # Mismas reglas que los CHECK de la tabla marcaciones.
        if self.origen == "web":
            if self.motivo_contingencia is None:
                raise ValueError("La marcación web exige el motivo de la contingencia")
            if self.dispositivo_id is not None:
                raise ValueError("La marcación web no lleva dispositivo")
        elif self.motivo_contingencia is not None:
            raise ValueError("Solo la marcación web lleva motivo de contingencia")
        return self


class DispositivoNuevo(BaseModel):
    """El celular que el usuario quiere dejar vinculado a su cuenta."""
    dispositivo_id: str = Field(min_length=1, max_length=200)

    @field_validator("dispositivo_id")
    @classmethod
    def sin_espacios(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("El identificador del dispositivo no puede estar vacío")
        return v


# ---- Feriados ----
MAX_DIAS_FERIADO = 31


def validar_rango_feriado(inicio: date, fin: date) -> None:
    """Un feriado dura de 1 a 31 días seguidos (fin incluido)."""
    if fin < inicio:
        raise ValueError("La fecha final no puede ser anterior a la inicial")
    if (fin - inicio).days + 1 > MAX_DIAS_FERIADO:
        raise ValueError(f"Un feriado puede durar como máximo {MAX_DIAS_FERIADO} días seguidos")


class FeriadoNuevo(BaseModel):
    """Un solo registro por feriado: de `fecha_inicio` a `fecha_fin` (ambos incluidos).
    Si no se envía `fecha_fin`, dura un solo día."""
    fecha_inicio: date
    fecha_fin: date | None = None
    nombre: Nombre

    @model_validator(mode="after")
    def rango_valido(self):
        if self.fecha_fin is None:
            self.fecha_fin = self.fecha_inicio
        validar_rango_feriado(self.fecha_inicio, self.fecha_fin)
        return self


class FeriadoCambios(BaseModel):
    fecha_inicio: date | None = None
    fecha_fin: date | None = None
    nombre: Nombre | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self


class RegistroRostro(BaseModel):
    """Registro guiado del rostro: consentimiento + de 3 a 5 fotos (en base64). Las fotos no se guardan."""

    consentimiento: bool
    fotos: list[str] = Field(min_length=3, max_length=5)

    @field_validator("fotos")
    @classmethod
    def fotos_con_contenido(cls, v: list[str]) -> list[str]:
        for f in v:
            if not f or len(f) > 8_000_000:
                raise ValueError("Cada foto debe venir en base64 y pesar menos de 8 MB")
        return v


class JustificacionNueva(BaseModel):
    """Lo que la persona escribe para explicar una anomalía. El largo útil (10 a 1000) se valida en el router."""

    texto: str = Field(max_length=5000)
