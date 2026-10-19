from datetime import time
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, StringConstraints, model_validator


class UsuarioNuevo(BaseModel):
    nombres: str = Field(min_length=2, max_length=80)
    apellidos: str = Field(min_length=2, max_length=80)
    email: EmailStr
    rol: Literal["usuario", "administrador"] = "usuario"
    sede_id: UUID | None = None
    jornada_inicio: time = time(8, 0)
    jornada_fin: time = time(17, 0)

    @model_validator(mode="after")
    def validar(self):
        if self.rol == "usuario" and self.sede_id is None:
            raise ValueError("Un usuario con rol 'usuario' debe tener sede")
        if self.jornada_fin <= self.jornada_inicio:
            raise ValueError("La jornada debe terminar después de iniciar")
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
