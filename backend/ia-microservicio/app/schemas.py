from datetime import date, time, timedelta
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, AwareDatetime, BaseModel, EmailStr, Field, StringConstraints, model_validator


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


# ---- Feriados ----
MAX_DIAS_FERIADO = 31


class FeriadoNuevo(BaseModel):
    """Un feriado de un día (`fecha`) o de varios días seguidos (`fecha` a `hasta`, ambos incluidos)."""
    fecha: date
    hasta: date | None = None
    nombre: Nombre

    @model_validator(mode="after")
    def rango_valido(self):
        if self.hasta is not None:
            if self.hasta < self.fecha:
                raise ValueError("La fecha final no puede ser anterior a la inicial")
            if (self.hasta - self.fecha).days + 1 > MAX_DIAS_FERIADO:
                raise ValueError(f"Un feriado puede durar como máximo {MAX_DIAS_FERIADO} días seguidos")
        return self

    def fechas(self) -> list[date]:
        fin = self.hasta or self.fecha
        return [self.fecha + timedelta(days=i) for i in range((fin - self.fecha).days + 1)]


class FeriadoCambios(BaseModel):
    fecha: date | None = None
    nombre: Nombre | None = None

    @model_validator(mode="after")
    def alguno(self):
        if not self.model_fields_set or any(getattr(self, c) is None for c in self.model_fields_set):
            raise ValueError("Indica al menos un campo válido para cambiar")
        return self
