"""Detección de vida: partes que no necesitan los modelos."""
import pytest

from app.biometria import caja_de_vida
from app.config import Settings
from app.biometria import umbral_de_vida


def test_recorte_centrado_y_ampliado():
    # cara de 100×100 en el centro de una foto de 1000×1000, escala 2.7 → 270×270 centrado
    x1, y1, x2, y2 = caja_de_vida(1000, 1000, (450, 450, 550, 550), 2.7)
    assert (x2 - x1, y2 - y1) == (269, 269) or (x2 - x1, y2 - y1) == (270, 270)
    assert abs((x1 + x2) / 2 - 500) <= 1 and abs((y1 + y2) / 2 - 500) <= 1


def test_el_recorte_se_desplaza_en_vez_de_salirse_de_la_foto():
    x1, y1, x2, y2 = caja_de_vida(1000, 1000, (0, 0, 100, 100), 4.0)
    assert x1 == 0 and y1 == 0 and x2 <= 999 and y2 <= 999
    x1, y1, x2, y2 = caja_de_vida(1000, 1000, (900, 900, 999, 999), 4.0)
    assert x2 == 999 and y2 == 999 and x1 >= 0 and y1 >= 0


def test_si_la_cara_ocupa_casi_toda_la_foto_la_escala_se_limita():
    x1, y1, x2, y2 = caja_de_vida(400, 600, (10, 100, 390, 500), 4.0)
    assert 0 <= x1 and x2 <= 399 and 0 <= y1 and y2 <= 599


@pytest.mark.parametrize("activa, esperado", [(True, 0.5), (False, None)])
def test_umbral_segun_la_configuracion(activa, esperado):
    cfg = Settings(supabase_url="x", supabase_service_role_key="k", vida_activa=activa)
    assert umbral_de_vida(cfg) == esperado
