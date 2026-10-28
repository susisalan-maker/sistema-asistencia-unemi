"""Ayudas de las pruebas de la firma con la clave del celular: hacen lo mismo que el chip de seguridad del teléfono.

* `Celular` crea un par de claves P-256 (como el Keystore / Secure Enclave), firma marcaciones y arma la cadena de
  certificados que un Android emitiría para esa clave (con la extensión de key attestation escrita a mano en DER).
* Así las pruebas usan criptografía real de punta a punta, sin reemplazar la verificación por un doble.
"""
import base64
import hashlib
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

from app import firma_dispositivo as firma


# ---------------------------------------------------------------- DER mínimo para escribir la extensión de atestación
def _tlv(etiqueta: bytes, contenido: bytes) -> bytes:
    n = len(contenido)
    if n < 0x80:
        largo = bytes([n])
    else:
        bs = n.to_bytes((n.bit_length() + 7) // 8, "big")
        largo = bytes([0x80 | len(bs)]) + bs
    return etiqueta + largo + contenido


def _entero(n: int) -> bytes:
    return _tlv(b"\x02", n.to_bytes(max(1, (n.bit_length() + 8) // 8), "big"))


def _enumerado(n: int) -> bytes:
    return _tlv(b"\x0a", bytes([n]))


def _octetos(b: bytes) -> bytes:
    return _tlv(b"\x04", b)


def _booleano(v: bool) -> bytes:
    return _tlv(b"\x01", b"\xff" if v else b"\x00")


def _secuencia(*partes: bytes) -> bytes:
    return _tlv(b"\x30", b"".join(partes))


def descripcion_de_clave(desafio: bytes, nivel: int = 2, estado_arranque: int | None = 0) -> bytes:
    """KeyDescription de Android. nivel: 0 software, 1 TEE, 2 StrongBox. estado_arranque: 0 verificado, 1 firmado por el usuario,
    2 sin verificar, 3 fallido; None = sin raíz de confianza."""
    elementos = [_tlv(b"\xbf\x85\x3e", _entero(0))]   # [702] origin: un elemento cualquiera que el lector debe saltarse
    if estado_arranque is not None:
        raiz = _secuencia(_octetos(b"k" * 32), _booleano(estado_arranque == 0), _enumerado(estado_arranque), _octetos(b"h" * 32))
        elementos.append(_tlv(b"\xbf\x85\x40", raiz))   # [704] rootOfTrust
    return _secuencia(
        _entero(300), _enumerado(nivel), _entero(300), _enumerado(nivel), _octetos(desafio), _octetos(b""),
        _secuencia(), _secuencia(*elementos),
    )


def _nombre(cn: str) -> x509.Name:
    return x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, cn)])


def _certificado(sujeto: str, clave_publica, emisor: str, clave_emisor, *, extension: bytes | None = None, ca: bool = False):
    ahora = datetime.now(timezone.utc)
    b = (
        x509.CertificateBuilder()
        .subject_name(_nombre(sujeto))
        .issuer_name(_nombre(emisor))
        .public_key(clave_publica)
        .serial_number(x509.random_serial_number())
        .not_valid_before(ahora - timedelta(days=1))
        .not_valid_after(ahora + timedelta(days=365))
        .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
    )
    if extension is not None:
        b = b.add_extension(x509.UnrecognizedExtension(firma.OID_ATESTACION, extension), critical=False)
    return b.sign(clave_emisor, hashes.SHA256())


def _der(c: x509.Certificate) -> bytes:
    return c.public_bytes(serialization.Encoding.DER)


def b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode("ascii")


class Celular:
    """Un celular con su clave en el chip de seguridad."""

    def __init__(self):
        self.privada = ec.generate_private_key(ec.SECP256R1())
        self.publica_b64 = firma.clave_a_b64(self.privada.public_key())

    def firmar(self, mensaje: bytes) -> str:
        return b64(self.privada.sign(mensaje, ec.ECDSA(hashes.SHA256())))

    def firmar_marcacion(self, datos: dict, usuario_id: str) -> str:
        """Firma como lo haría la app: sobre lo que va a enviar."""
        return self.firmar(
            firma.mensaje_de_marcacion(
                usuario_id=usuario_id, marcacion_id=datos["id"], tipo=datos["tipo"],
                fecha_hora=datetime.fromisoformat(datos["fecha_hora"]), latitud=datos["latitud"], longitud=datos["longitud"],
                dispositivo_id=datos["dispositivo_id"], selfie_b64=datos["selfie_b64"],
            )
        )

    def cadena(self, desafio: bytes, nivel: int = 2, estado_arranque: int | None = 0, clave_hoja=None) -> tuple[list[str], str]:
        """La cadena que emitiría el chip (hoja primero, raíz al final) y la huella SHA-256 de su raíz."""
        raiz_k = ec.generate_private_key(ec.SECP256R1())
        medio_k = ec.generate_private_key(ec.SECP256R1())
        raiz = _certificado("Raiz de prueba", raiz_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        medio = _certificado("Intermedio de prueba", medio_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        hoja = _certificado(
            "Clave de prueba", (clave_hoja or self.privada.public_key()), "Intermedio de prueba", medio_k,
            extension=descripcion_de_clave(desafio, nivel, estado_arranque),
        )
        return [b64(_der(hoja)), b64(_der(medio)), b64(_der(raiz))], hashlib.sha256(_der(raiz)).hexdigest()

    def cadena_sin_extension(self) -> list[str]:
        raiz_k = ec.generate_private_key(ec.SECP256R1())
        raiz = _certificado("Raiz de prueba", raiz_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        hoja = _certificado("Clave de prueba", self.privada.public_key(), "Raiz de prueba", raiz_k)
        return [b64(_der(hoja)), b64(_der(raiz))]

    def cadena_con_extension(self, extension: bytes) -> list[str]:
        """Una cadena coherente cuya extensión de atestación trae los bytes que se indiquen (para probar formatos dañados)."""
        raiz_k = ec.generate_private_key(ec.SECP256R1())
        raiz = _certificado("Raiz de prueba", raiz_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        hoja = _certificado("Clave de prueba", self.privada.public_key(), "Raiz de prueba", raiz_k, extension=extension)
        return [b64(_der(hoja)), b64(_der(raiz))]

    def cadena_mal_firmada(self, desafio: bytes) -> list[str]:
        """La hoja la firma alguien que no es el intermedio que se presenta."""
        cadena, _ = self.cadena(desafio)
        impostor = ec.generate_private_key(ec.SECP256R1())
        medio_k = ec.generate_private_key(ec.SECP256R1())
        raiz_k = ec.generate_private_key(ec.SECP256R1())
        raiz = _certificado("Raiz de prueba", raiz_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        medio = _certificado("Intermedio de prueba", medio_k.public_key(), "Raiz de prueba", raiz_k, ca=True)
        hoja = _certificado("Clave de prueba", self.privada.public_key(), "Intermedio de prueba", impostor,
                            extension=descripcion_de_clave(desafio))
        return [b64(_der(hoja)), b64(_der(medio)), b64(_der(raiz))]
