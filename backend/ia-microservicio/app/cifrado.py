"""Cifrado de los vectores faciales (AES-256-GCM).

Formato guardado en `rostros.vectores_cifrados`:  nonce (12 bytes) || texto cifrado || etiqueta (16 bytes).
El texto en claro es: 1 byte con la cantidad de vectores + cada vector como float32 little-endian.
El identificador del usuario va como «dato asociado»: si alguien copiara el cifrado de una fila a la de otro
usuario, el descifrado fallaría.
"""
import base64
import binascii
import os

import numpy as np
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

DIM = 512
TAM_NONCE = 12


class ClaveInvalida(ValueError):
    pass


class CifradoInvalido(Exception):
    """El cifrado no se pudo abrir: clave distinta, datos alterados o fila de otro usuario."""


def clave_desde_texto(texto: str | None) -> bytes:
    """Convierte la clave de la configuración (hex de 64 caracteres o base64 de 32 bytes) a 32 bytes."""
    if not texto or not texto.strip():
        raise ClaveInvalida("Falta ROSTRO_CLAVE_AES")
    texto = texto.strip()
    try:
        if len(texto) == 64:
            clave = bytes.fromhex(texto)
        else:
            clave = base64.b64decode(texto, validate=True)
    except (ValueError, binascii.Error):
        raise ClaveInvalida("ROSTRO_CLAVE_AES debe ser hexadecimal (64 caracteres) o base64 de 32 bytes")
    if len(clave) != 32:
        raise ClaveInvalida("ROSTRO_CLAVE_AES debe medir 32 bytes (AES-256)")
    return clave


def cifrar_vectores(vectores: np.ndarray, clave: bytes, usuario_id: str) -> bytes:
    v = np.asarray(vectores, dtype="<f4")
    if v.ndim != 2 or v.shape[1] != DIM or not 1 <= v.shape[0] <= 255:
        raise ValueError("Los vectores deben ser una matriz (n, 512) con 1 a 255 filas")
    claro = bytes([v.shape[0]]) + v.tobytes()
    nonce = os.urandom(TAM_NONCE)
    return nonce + AESGCM(clave).encrypt(nonce, claro, usuario_id.encode())


def descifrar_vectores(cifrado: bytes, clave: bytes, usuario_id: str) -> np.ndarray:
    if len(cifrado) < TAM_NONCE + 16 + 1:
        raise CifradoInvalido("Cifrado demasiado corto")
    try:
        claro = AESGCM(clave).decrypt(cifrado[:TAM_NONCE], cifrado[TAM_NONCE:], usuario_id.encode())
    except InvalidTag:
        raise CifradoInvalido("No se pudo descifrar (clave distinta o datos alterados)")
    n = claro[0]
    cuerpo = claro[1:]
    if n == 0 or len(cuerpo) != n * DIM * 4:
        raise CifradoInvalido("Formato de vectores no válido")
    return np.frombuffer(cuerpo, dtype="<f4").reshape(n, DIM).astype(np.float32)


def bytea_desde_postgrest(valor: str) -> bytes:
    """PostgREST devuelve los bytea como texto hexadecimal con prefijo \\x."""
    if not isinstance(valor, str) or not valor.startswith("\\x"):
        raise CifradoInvalido("Formato bytea inesperado")
    try:
        return bytes.fromhex(valor[2:])
    except ValueError:
        raise CifradoInvalido("Formato bytea inesperado")


def bytea_para_postgrest(datos: bytes) -> str:
    return "\\x" + datos.hex()
