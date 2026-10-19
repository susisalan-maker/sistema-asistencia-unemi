from datetime import time
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class UsuarioNuevo(BaseModel):
    nombre: str = Field(min_length=2, max_length=120)
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
