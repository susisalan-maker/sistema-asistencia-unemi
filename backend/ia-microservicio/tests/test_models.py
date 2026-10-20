"""Comprueba que app/models.py no se desfase de supabase/migrations/0001_init.sql."""

import re
from datetime import datetime, time, timezone
from enum import StrEnum
from pathlib import Path
from uuid import uuid4

import pytest

from app import models

SQL = Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "0001_init.sql"
ENUMS = {
    "rol_usuario": models.RolUsuario, "tipo_marcacion": models.TipoMarcacion,
    "origen_marcacion": models.OrigenMarcacion, "motivo_contingencia": models.MotivoContingencia,
    "verificacion_rostro": models.VerificacionRostro, "tipo_anomalia": models.TipoAnomalia,
    "detector_anomalia": models.DetectorAnomalia, "estado_anomalia": models.EstadoAnomalia,
    "clasificacion_justificacion": models.ClasificacionJustificacion, "decision_caso": models.DecisionCaso,
    "emisor_mensaje": models.EmisorMensaje, "evento_bitacora": models.EventoBitacora,
}
TABLAS = {
    "sedes": models.Sede, "bloques": models.Bloque, "feriados": models.Feriado, "usuarios": models.Usuario, "rostros": models.Rostro,
    "configuracion": models.Configuracion, "marcaciones": models.Marcacion, "anomalias": models.Anomalia,
    "justificaciones": models.Justificacion, "mensajes_chat": models.MensajeChat, "bitacora": models.Bitacora,
}

pytestmark = pytest.mark.skipif(not SQL.exists(), reason="no se encuentra 0001_init.sql")


def _sql() -> str:
    """0001 más las migraciones posteriores (0002, 0003…), en orden."""
    return "\n".join(re.sub(r"--[^\n]*", "", f.read_text(encoding="utf-8")) for f in sorted(SQL.parent.glob("0*.sql")))


@pytest.mark.parametrize("nombre_sql,enum", ENUMS.items())
def test_enum_igual_al_sql(nombre_sql, enum):
    m = re.search(rf"create type {nombre_sql} as enum\s*\((.*?)\)\s*;", _sql(), re.S | re.I)
    assert m, f"no se encontró el enum {nombre_sql} en el SQL"
    valores_sql = re.findall(r"'([^']+)'", m.group(1))
    # valores agregados después con `alter type ... add value`
    valores_sql += re.findall(rf"alter type {nombre_sql} add value(?: if not exists)?\s+'([^']+)'", _sql(), re.I)
    assert [e.value for e in enum] == valores_sql


@pytest.mark.parametrize("tabla,modelo", TABLAS.items())
def test_columnas_iguales_al_sql(tabla, modelo):
    sql = _sql()
    m = re.search(rf"create table {tabla}\s*\((.*?)\n\);", sql, re.S | re.I)
    assert m, f"no se encontró la tabla {tabla} en el SQL"
    columnas = set()
    for linea in m.group(1).splitlines():
        c = re.match(r"\s{2}([a-z0-9_]+)\s+[a-z]", linea)
        if c and c.group(1) not in {"constraint", "primary", "unique", "check", "foreign"}:
            columnas.add(c.group(1))
    # columnas agregadas después con `alter table ... add column`
    for alt in re.finditer(rf"alter table {tabla}\s+(.*?);", sql, re.S | re.I):
        columnas |= set(re.findall(r"add column(?:\s+if not exists)?\s+([a-z0-9_]+)", alt.group(1), re.I))
    assert set(modelo.model_fields) == columnas


def test_se_puede_construir_un_usuario_y_su_nombre_completo():
    ahora = datetime.now(timezone.utc)
    u = models.Usuario(
        id=uuid4(), nombres="Ana María", apellidos="Pérez Loor", email="a@unemi.edu.ec", rol="usuario",
        jornada_inicio=time(8), jornada_fin=time(17), dias_laborables=[1, 2, 3, 4, 5], activo=True, created_at=ahora, updated_at=ahora,
    )
    assert u.rol is models.RolUsuario.usuario
    assert u.nombre_completo == "Ana María Pérez Loor"


def test_los_enums_son_str():
    assert all(issubclass(e, StrEnum) for e in ENUMS.values())
