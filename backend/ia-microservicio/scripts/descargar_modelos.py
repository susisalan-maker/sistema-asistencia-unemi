"""Descarga los modelos faciales a la carpeta `modelos/`: detector y reconocedor (paquete «buffalo_sc» de
InsightFace, ~15 MB) y los dos modelos de detección de vida (MiniFASNet, ~3.5 MB).

Uso (desde backend/ia-microservicio):   python scripts/descargar_modelos.py
Es seguro repetirlo: si los archivos ya están, no hace nada. Solo usa la biblioteca estándar.

Licencias: los modelos preentrenados de InsightFace son de uso académico/investigación; MiniFASNet
(Silent-Face-Anti-Spoofing de Minivision) es Apache-2.0.
"""
import io
import sys
import urllib.request
import zipfile
from pathlib import Path

URL_ROSTRO = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
ARCHIVOS_ROSTRO = ("det_500m.onnx", "w600k_mbf.onnx")
URL_VIDA = "https://github.com/yakhyo/face-anti-spoofing/releases/download/weights/"
ARCHIVOS_VIDA = ("MiniFASNetV2.onnx", "MiniFASNetV1SE.onnx")


def _bajar(url: str) -> bytes:
    print(f"Descargando {url} ...")
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def main(destino: Path) -> int:
    destino.mkdir(parents=True, exist_ok=True)
    if not all((destino / a).exists() for a in ARCHIVOS_ROSTRO):
        with zipfile.ZipFile(io.BytesIO(_bajar(URL_ROSTRO))) as z:
            for a in ARCHIVOS_ROSTRO:
                (destino / a).write_bytes(z.read(a))
    for a in ARCHIVOS_VIDA:
        if not (destino / a).exists():
            (destino / a).write_bytes(_bajar(URL_VIDA + a))
    print(f"Listo: modelos en {destino}")
    return 0


if __name__ == "__main__":
    carpeta = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "modelos"
    sys.exit(main(carpeta))
