"""Motor facial: detecta el rostro en una foto y calcula su vector (embedding) de 512 números.

Modelos (paquete «buffalo_sc» de InsightFace, ~16 MB, corren en CPU con onnxruntime):
  * det_500m.onnx  : detector de rostros SCRFD (devuelve caja y 5 puntos: ojos, nariz y comisuras).
  * w600k_mbf.onnx : reconocedor MobileFaceNet entrenado con ArcFace (WebFace600K).
Los modelos preentrenados de InsightFace son de uso académico/investigación: hay que declararlo en la tesis.

La foto solo se usa en memoria para sacar el vector; nunca se guarda.

Controles de calidad (cada uno lanza `ErrorRostro` con un mensaje para la persona): foto legible, un solo
rostro, tamaño, luz, nitidez y que mire de frente.

Detección de vida PASIVA (opcional, `vida_umbral`): dos modelos MiniFASNet (Silent-Face-Anti-Spoofing de
Minivision, Apache-2.0; pesos ONNX de yakhyo/face-anti-spoofing) miran la textura y el contexto de la foto
y estiman la probabilidad de que sea un rostro real y no una foto impresa o una pantalla. Ayuda contra
las suplantaciones más simples; NO es infalible (un ataque cuidadoso, un video o una máscara pueden pasar).
"""
import base64
import binascii
import io
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from fastapi import Depends, HTTPException
from PIL import Image, ImageOps

from app.config import Settings, get_settings

Image.MAX_IMAGE_PIXELS = 50_000_000

TAM_DET = 640
UMBRAL_DET = 0.5
UMBRAL_NMS = 0.4
STRIDES = (8, 16, 32)

# Posición estándar de los 5 puntos en el recorte de 112×112 que espera ArcFace.
ARCFACE_DST = np.array(
    [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]],
    dtype=np.float32,
)

# Controles de calidad (ajustables tras probar con fotos reales de celulares).
LADO_MIN_FOTO = 200          # px del lado menor de la foto
ROSTRO_MIN_PX = 90           # px del lado menor de la caja del rostro, en la foto original
OTRA_PERSONA_AREA = 0.30     # un segundo rostro con ≥30 % del área del mayor cuenta como «otra persona»
BRILLO_MIN, BRILLO_MAX = 50.0, 215.0
NITIDEZ_MIN = 40.0           # varianza del laplaciano del recorte de 112×112
ROLL_MAX_GRADOS = 25.0

# Detección de vida (MiniFASNet): cada modelo recorta la cara con su propia escala de contexto y recibe 80×80.
TAM_VIDA = 80
MODELOS_VIDA = (("MiniFASNetV2.onnx", 2.7), ("MiniFASNetV1SE.onnx", 4.0))


class ErrorRostro(Exception):
    """La foto no sirve para reconocer. `mensaje` está pensado para mostrarse a la persona."""

    def __init__(self, codigo: str, mensaje: str):
        super().__init__(mensaje)
        self.codigo = codigo
        self.mensaje = mensaje


@dataclass(frozen=True)
class Analisis:
    vector: np.ndarray   # float32, 512 valores, norma 1
    giro: float          # 0 = de frente; ≥0.5 ≈ de perfil (|nariz − centro de ojos| / distancia entre ojos)
    brillo: float
    nitidez: float
    lado_rostro: float
    vida: float | None = None   # probabilidad (0 a 1) de rostro real; None si la detección de vida está apagada


def _decodificar(b64: str) -> Image.Image:
    if "," in b64[:100]:  # «data:image/jpeg;base64,....»
        b64 = b64.split(",", 1)[1]
    try:
        crudo = base64.b64decode(b64, validate=False)
        img = Image.open(io.BytesIO(crudo))
        img.load()
    except (binascii.Error, ValueError, OSError, Image.DecompressionBombError):
        raise ErrorRostro("imagen_invalida", "No se pudo leer la foto. Toma otra")
    img = ImageOps.exif_transpose(img).convert("RGB")
    if min(img.size) < LADO_MIN_FOTO:
        raise ErrorRostro("foto_pequena", "La foto es muy pequeña. Toma otra con la cámara del celular")
    return img


def _nms(cajas: np.ndarray, puntajes: np.ndarray, umbral: float) -> list[int]:
    x1, y1, x2, y2 = cajas.T
    areas = (x2 - x1 + 1) * (y2 - y1 + 1)
    orden = puntajes.argsort()[::-1]
    quedan: list[int] = []
    while orden.size:
        i = orden[0]
        quedan.append(int(i))
        xx1 = np.maximum(x1[i], x1[orden[1:]])
        yy1 = np.maximum(y1[i], y1[orden[1:]])
        xx2 = np.minimum(x2[i], x2[orden[1:]])
        yy2 = np.minimum(y2[i], y2[orden[1:]])
        inter = np.maximum(0.0, xx2 - xx1 + 1) * np.maximum(0.0, yy2 - yy1 + 1)
        iou = inter / (areas[i] + areas[orden[1:]] - inter)
        orden = orden[1:][iou <= umbral]
    return quedan


def _transformacion(origen: np.ndarray, destino: np.ndarray) -> np.ndarray:
    """Transformación de semejanza (giro + escala + traslación) que lleva `origen` a `destino` (Umeyama)."""
    mo, md = origen.mean(0), destino.mean(0)
    o, d = origen - mo, destino - md
    u, s, vt = np.linalg.svd(d.T @ o / len(origen))
    signo = np.array([1.0, np.sign(np.linalg.det(u) * np.linalg.det(vt))])
    r = u @ np.diag(signo) @ vt
    escala = float((s * signo).sum() / ((o**2).sum() / len(origen)))
    m = np.zeros((2, 3), dtype=np.float64)
    m[:, :2] = escala * r
    m[:, 2] = md - escala * r @ mo
    return m


def _alinear(img: Image.Image, puntos: np.ndarray) -> Image.Image:
    m = _transformacion(puntos.astype(np.float64), ARCFACE_DST.astype(np.float64))
    inv = np.linalg.inv(m[:, :2])
    c = -inv @ m[:, 2]
    coef = (inv[0, 0], inv[0, 1], c[0], inv[1, 0], inv[1, 1], c[1])
    return img.transform((112, 112), Image.AFFINE, coef, resample=Image.BILINEAR)


def _nitidez(gris: np.ndarray) -> float:
    lap = 4 * gris[1:-1, 1:-1] - gris[:-2, 1:-1] - gris[2:, 1:-1] - gris[1:-1, :-2] - gris[1:-1, 2:]
    return float(lap.var())


def caja_de_vida(ancho: int, alto: int, caja: tuple[float, float, float, float], escala: float) -> tuple[int, int, int, int]:
    """Recorte (x1, y1, x2, y2) centrado en la cara y ampliado `escala` veces, sin salirse de la foto
    (se desplaza en vez de rellenar). Es el mismo recorte con el que se entrenaron los modelos."""
    x, y, w, h = caja[0], caja[1], caja[2] - caja[0], caja[3] - caja[1]
    escala = min((alto - 1) / h, (ancho - 1) / w, escala)
    nw, nh = w * escala, h * escala
    cx, cy = x + w / 2, y + h / 2
    x1, y1, x2, y2 = cx - nw / 2, cy - nh / 2, cx + nw / 2, cy + nh / 2
    if x1 < 0:
        x2 -= x1
        x1 = 0
    if y1 < 0:
        y2 -= y1
        y1 = 0
    if x2 > ancho - 1:
        x1 -= x2 - ancho + 1
        x2 = ancho - 1
    if y2 > alto - 1:
        y1 -= y2 - alto + 1
        y2 = alto - 1
    return int(x1), int(y1), int(x2), int(y2)


def _softmax(z: np.ndarray) -> np.ndarray:
    e = np.exp(z - z.max())
    return e / e.sum()


class MotorFacial:
    def __init__(self, carpeta: str | Path, vida_umbral: float | None = None):
        """`vida_umbral`: probabilidad mínima de «rostro real» (0 a 1). None apaga la detección de vida."""
        import onnxruntime as ort  # se importa aquí para que el resto del servicio arranque sin el modelo

        carpeta = Path(carpeta)
        opciones = ort.SessionOptions()
        opciones.intra_op_num_threads = 2
        opciones.enable_cpu_mem_arena = False   # menos memoria residente (Render tiene 512 MB)
        opciones.enable_mem_pattern = False
        opciones.log_severity_level = 3
        try:
            self._det = ort.InferenceSession(
                str(carpeta / "det_500m.onnx"), opciones, providers=["CPUExecutionProvider"]
            )
            self._rec = ort.InferenceSession(
                str(carpeta / "w600k_mbf.onnx"), opciones, providers=["CPUExecutionProvider"]
            )
        except Exception as e:
            raise RuntimeError(
                f"No se pudieron cargar los modelos faciales desde «{carpeta}». "
                "Ejecuta: python scripts/descargar_modelos.py"
            ) from e
        self._det_in = self._det.get_inputs()[0].name
        self._rec_in = self._rec.get_inputs()[0].name
        self.vida_umbral = vida_umbral
        self._vida: list[tuple[ort.InferenceSession, str, float]] = []
        if vida_umbral is not None:
            try:
                for archivo, escala in MODELOS_VIDA:
                    sesion = ort.InferenceSession(str(carpeta / archivo), opciones, providers=["CPUExecutionProvider"])
                    self._vida.append((sesion, sesion.get_inputs()[0].name, escala))
            except Exception as e:
                raise RuntimeError(
                    f"No se pudieron cargar los modelos de detección de vida desde «{carpeta}». "
                    "Ejecuta: python scripts/descargar_modelos.py (o pon VIDA_ACTIVA=false)"
                ) from e

    # ---- detección ----
    def _detectar(self, img: Image.Image) -> list[tuple[float, np.ndarray, np.ndarray]]:
        w, h = img.size
        escala = min(TAM_DET / w, TAM_DET / h)
        nw, nh = max(1, round(w * escala)), max(1, round(h * escala))
        lienzo = np.zeros((TAM_DET, TAM_DET, 3), dtype=np.uint8)
        lienzo[:nh, :nw] = np.asarray(img.resize((nw, nh), Image.BILINEAR))
        x = ((lienzo.astype(np.float32) - 127.5) / 128.0).transpose(2, 0, 1)[None]
        salidas = self._det.run(None, {self._det_in: x})

        cajas, puntajes, puntos = [], [], []
        for i, stride in enumerate(STRIDES):
            p = salidas[i][:, 0]
            lado = TAM_DET // stride
            ys, xs = np.mgrid[:lado, :lado]
            centros = np.repeat(np.stack([xs, ys], -1).reshape(-1, 2).astype(np.float32) * stride, 2, axis=0)
            buenos = p >= UMBRAL_DET
            if not buenos.any():
                continue
            d = salidas[i + 3][buenos] * stride
            c = centros[buenos]
            cajas.append(np.stack([c[:, 0] - d[:, 0], c[:, 1] - d[:, 1], c[:, 0] + d[:, 2], c[:, 1] + d[:, 3]], 1))
            k = salidas[i + 6][buenos].reshape(-1, 5, 2) * stride
            puntos.append(k + c[:, None, :])
            puntajes.append(p[buenos])
        if not cajas:
            return []
        cajas, puntajes, puntos = np.concatenate(cajas), np.concatenate(puntajes), np.concatenate(puntos)
        cajas, puntos = cajas / escala, puntos / escala
        return [(float(puntajes[i]), cajas[i], puntos[i]) for i in _nms(cajas, puntajes, UMBRAL_NMS)]

    # ---- detección de vida ----
    def probabilidad_real(self, img: Image.Image, caja: np.ndarray) -> float:
        """Promedio de la probabilidad de «rostro real» de los dos modelos (la clase 1 de cada uno)."""
        bgr = np.asarray(img.convert("RGB"))[:, :, ::-1]   # estos modelos esperan BGR sin normalizar
        alto, ancho = bgr.shape[:2]
        probs = []
        for sesion, entrada, escala in self._vida:
            x1, y1, x2, y2 = caja_de_vida(ancho, alto, tuple(float(v) for v in caja), escala)
            recorte = Image.fromarray(np.ascontiguousarray(bgr[y1 : y2 + 1, x1 : x2 + 1, ::-1])).resize(
                (TAM_VIDA, TAM_VIDA), Image.BILINEAR
            )
            x = np.asarray(recorte, dtype=np.float32)[:, :, ::-1].transpose(2, 0, 1)[None].copy()
            probs.append(float(_softmax(sesion.run(None, {entrada: x})[0][0])[1]))
        return float(np.mean(probs))

    # ---- reconocimiento ----
    def _vector(self, recorte: Image.Image) -> np.ndarray:
        x = ((np.asarray(recorte, dtype=np.float32) - 127.5) / 127.5).transpose(2, 0, 1)[None]
        v = self._rec.run(None, {self._rec_in: x})[0][0].astype(np.float32)
        return v / np.linalg.norm(v)

    def analizar(self, foto_b64: str, max_giro: float = 0.40) -> Analisis:
        """Revisa la calidad de la foto y devuelve el vector del rostro. Lanza `ErrorRostro` si no sirve."""
        img = _decodificar(foto_b64)
        rostros = self._detectar(img)
        if not rostros:
            raise ErrorRostro("sin_rostro", "No se ve ningún rostro. Mira de frente a la cámara, con buena luz")
        rostros.sort(key=lambda r: (r[1][2] - r[1][0]) * (r[1][3] - r[1][1]), reverse=True)
        _, caja, pts = rostros[0]
        area = (caja[2] - caja[0]) * (caja[3] - caja[1])
        if len(rostros) > 1:
            otra = rostros[1][1]
            if (otra[2] - otra[0]) * (otra[3] - otra[1]) >= OTRA_PERSONA_AREA * area:
                raise ErrorRostro("varios_rostros", "Se ven varias personas. Debe salir solo tu rostro")

        lado = float(min(caja[2] - caja[0], caja[3] - caja[1]))
        if lado < ROSTRO_MIN_PX:
            raise ErrorRostro("rostro_pequeno", "Acércate más a la cámara: tu rostro se ve muy pequeño")

        ojo_i, ojo_d, nariz = pts[0], pts[1], pts[2]
        dist_ojos = float(np.linalg.norm(ojo_d - ojo_i))
        roll = math.degrees(math.atan2(float(ojo_d[1] - ojo_i[1]), float(ojo_d[0] - ojo_i[0])))
        if abs(roll) > ROLL_MAX_GRADOS:
            raise ErrorRostro("cabeza_inclinada", "Mantén la cabeza derecha")
        giro = abs(float(nariz[0] - (ojo_i[0] + ojo_d[0]) / 2)) / max(dist_ojos, 1e-6)
        if giro > max_giro:
            raise ErrorRostro("rostro_de_lado", "Mira más de frente a la cámara")

        recorte = _alinear(img, pts)
        gris = np.asarray(recorte.convert("L"), dtype=np.float32)
        brillo = float(gris[20:92, 20:92].mean())
        if brillo < BRILLO_MIN:
            raise ErrorRostro("muy_oscura", "Hay muy poca luz. Busca un lugar más iluminado")
        if brillo > BRILLO_MAX:
            raise ErrorRostro("muy_clara", "Hay demasiada luz sobre tu rostro. Evita el contraluz y los reflejos")
        nitidez = _nitidez(gris)
        if nitidez < NITIDEZ_MIN:
            raise ErrorRostro("borrosa", "La foto salió borrosa. Sostén firme el celular y toma otra")

        vida = None
        if self._vida:
            vida = self.probabilidad_real(img, caja)
            if vida < (self.vida_umbral or 0.0):
                raise ErrorRostro(
                    "no_es_real", "Parece una foto de una foto o de una pantalla. Toma la selfie directamente, en persona"
                )

        return Analisis(self._vector(recorte), giro, brillo, nitidez, lado, vida)


@lru_cache
def cargar_motor(carpeta: str, vida_umbral: float | None = None) -> MotorFacial:
    """Carga los modelos una sola vez (tarda unos segundos). Lanza RuntimeError si faltan."""
    return MotorFacial(carpeta, vida_umbral)


def umbral_de_vida(cfg: Settings) -> float | None:
    return cfg.vida_umbral if cfg.vida_activa else None


def get_motor(cfg: Settings = Depends(get_settings)) -> MotorFacial:
    """Dependencia de FastAPI: el motor, o 503 si los modelos no están instalados."""
    try:
        return cargar_motor(cfg.modelos_dir, umbral_de_vida(cfg))
    except RuntimeError as e:
        raise HTTPException(503, str(e))
