"""Motor facial con los modelos reales. Se omiten si los modelos no están descargados
(python scripts/descargar_modelos.py). Las fotos de rostros reales no se incluyen en el repositorio:
aquí solo se prueban los rechazos, que no necesitan ninguna cara."""
import base64
import io
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.biometria import ErrorRostro, MotorFacial

MODELOS = Path(__file__).resolve().parent.parent / "modelos"
pytestmark = pytest.mark.skipif(
    not (MODELOS / "det_500m.onnx").exists() or not (MODELOS / "w600k_mbf.onnx").exists(),
    reason="modelos faciales no descargados",
)


@pytest.fixture(scope="module")
def motor():
    return MotorFacial(MODELOS)


def jpeg_b64(array: np.ndarray) -> str:
    b = io.BytesIO()
    Image.fromarray(array).save(b, "JPEG")
    return base64.b64encode(b.getvalue()).decode()


def codigo(motor, foto, **kw):
    with pytest.raises(ErrorRostro) as e:
        motor.analizar(foto, **kw)
    return e.value.codigo


def test_texto_que_no_es_imagen(motor):
    assert codigo(motor, "esto no es una imagen") == "imagen_invalida"
    assert codigo(motor, base64.b64encode(b"tampoco").decode()) == "imagen_invalida"


def test_foto_demasiado_pequena(motor):
    assert codigo(motor, jpeg_b64(np.full((100, 100, 3), 128, np.uint8))) == "foto_pequena"


def test_foto_sin_rostro(motor):
    ruido = np.random.default_rng(0).integers(0, 255, (480, 640, 3), dtype=np.uint8)
    assert codigo(motor, jpeg_b64(ruido)) == "sin_rostro"
    assert codigo(motor, jpeg_b64(np.full((480, 640, 3), 200, np.uint8))) == "sin_rostro"


def test_acepta_prefijo_data_url(motor):
    foto = "data:image/jpeg;base64," + jpeg_b64(np.full((480, 640, 3), 200, np.uint8))
    assert codigo(motor, foto) == "sin_rostro"   # llegó a detectar: el prefijo no estorba
