"""Criterios: los umbrales del reconocimiento que se editan en el panel y viven en `configuracion`."""
import pytest

from app.biometria import Criterios
from app.config import Settings


def ajustes(**kw):
    return Settings(supabase_url="x", supabase_service_role_key="k", **kw)


def test_sin_fila_son_los_valores_de_siempre():
    assert Criterios.desde(None) == Criterios.desde({}) == Criterios()
    c = Criterios()
    assert (c.rostro_umbral, c.rostro_umbral_registro, c.vida_umbral) == (0.40, 0.35, 0.50)
    assert (c.giro_registro_frente, c.giro_registro_leve, c.giro_marcacion) == (0.30, 0.60, 0.40)
    assert (c.brillo_min, c.brillo_max, c.nitidez_min, c.rostro_min_px, c.foto_min_px) == (50, 215, 40, 90, 200)


def test_lee_cada_columna_de_la_fila():
    fila = {
        "rostro_umbral": 0.5, "rostro_umbral_registro": 0.3, "vida_umbral": 0.7,
        "giro_max_registro_frente": 0.2, "giro_max_registro_leve": 0.55, "giro_max_marcacion": 0.35,
        "brillo_min": 60, "brillo_max": 200, "nitidez_min": 55, "rostro_min_px": 100, "foto_min_px": 320,
    }
    c = Criterios.desde(fila)
    assert (c.rostro_umbral, c.rostro_umbral_registro, c.vida_umbral) == (0.5, 0.3, 0.7)
    assert (c.giro_registro_frente, c.giro_registro_leve, c.giro_marcacion) == (0.2, 0.55, 0.35)
    assert (c.brillo_min, c.brillo_max, c.nitidez_min, c.rostro_min_px, c.foto_min_px) == (60, 200, 55, 100, 320)


def test_los_numeric_de_la_base_pueden_llegar_como_texto():
    c = Criterios.desde({"rostro_umbral": "0.450", "brillo_min": "55"})
    assert c.rostro_umbral == 0.45 and c.brillo_min == 55.0


@pytest.mark.parametrize("malo", [None, "", "abc", float("nan"), float("inf")])
def test_un_valor_ilegible_cae_en_el_de_siempre(malo):
    assert Criterios.desde({"rostro_umbral": malo, "nitidez_min": malo}) == Criterios()


def test_el_servidor_respalda_los_tres_umbrales_que_tiene_en_el_env():
    cfg = ajustes(rostro_umbral=0.45, rostro_umbral_registro=0.30, vida_umbral=0.6)
    c = Criterios.desde({}, cfg)
    assert (c.rostro_umbral, c.rostro_umbral_registro, c.vida_umbral) == (0.45, 0.30, 0.6)


def test_lo_que_dice_la_base_manda_sobre_el_servidor():
    cfg = ajustes(rostro_umbral=0.45)
    assert Criterios.desde({"rostro_umbral": 0.52}, cfg).rostro_umbral == 0.52
