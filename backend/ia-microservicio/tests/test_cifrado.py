import numpy as np
import pytest

from app import cifrado

CLAVE = bytes(range(32))


def vectores(n=3):
    v = np.random.default_rng(1).normal(size=(n, 512)).astype(np.float32)
    return v / np.linalg.norm(v, axis=1, keepdims=True)


def test_ida_y_vuelta():
    v = vectores()
    out = cifrado.descifrar_vectores(cifrado.cifrar_vectores(v, CLAVE, "u-1"), CLAVE, "u-1")
    assert out.shape == (3, 512) and np.allclose(out, v)


def test_formato_nonce_texto_etiqueta():
    c = cifrado.cifrar_vectores(vectores(3), CLAVE, "u-1")
    assert len(c) == 12 + (1 + 3 * 512 * 4) + 16


def test_cada_cifrado_usa_un_nonce_distinto():
    v = vectores()
    assert cifrado.cifrar_vectores(v, CLAVE, "u-1") != cifrado.cifrar_vectores(v, CLAVE, "u-1")


def test_clave_distinta_no_abre():
    c = cifrado.cifrar_vectores(vectores(), CLAVE, "u-1")
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_vectores(c, bytes(32), "u-1")


def test_cifrado_copiado_a_otro_usuario_no_abre():
    c = cifrado.cifrar_vectores(vectores(), CLAVE, "u-1")
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_vectores(c, CLAVE, "u-2")


def test_dato_alterado_no_abre():
    c = bytearray(cifrado.cifrar_vectores(vectores(), CLAVE, "u-1"))
    c[40] ^= 1
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_vectores(bytes(c), CLAVE, "u-1")


def test_cifrado_truncado():
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.descifrar_vectores(b"corto", CLAVE, "u-1")


def test_vectores_con_forma_invalida():
    with pytest.raises(ValueError):
        cifrado.cifrar_vectores(np.zeros((2, 10), dtype=np.float32), CLAVE, "u-1")


def test_clave_en_hex_y_base64():
    import base64

    assert cifrado.clave_desde_texto(CLAVE.hex()) == CLAVE
    assert cifrado.clave_desde_texto(base64.b64encode(CLAVE).decode()) == CLAVE


@pytest.mark.parametrize("texto", [None, "", "  ", "corta", "zz" * 32, "ab" * 16])
def test_clave_invalida(texto):
    with pytest.raises(cifrado.ClaveInvalida):
        cifrado.clave_desde_texto(texto)


def test_bytea_de_postgrest():
    assert cifrado.bytea_desde_postgrest(cifrado.bytea_para_postgrest(b"\x00\xffab")) == b"\x00\xffab"
    assert cifrado.bytea_para_postgrest(b"\x01\x02") == "\\x0102"
    with pytest.raises(cifrado.CifradoInvalido):
        cifrado.bytea_desde_postgrest("sin-prefijo")
