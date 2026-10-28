"""Firma de las marcaciones sin conexión con una clave del celular que no se puede copiar.

El problema (docs/logica-negocio.md, «Firma de la marcación sin conexión»): una marcación hecha sin internet se guarda en
el celular hasta que vuelve la señal. Quien tiene el celular con root o modo desarrollador puede abrir esa base y cambiar la
hora, la ubicación o la foto antes de que se envíe.

La solución: al vincular el celular, la app crea un par de claves ECDSA P-256 DENTRO del chip de seguridad del teléfono
(Android Keystore con TEE/StrongBox, iOS Secure Enclave). La clave privada no sale de ahí, ni con root. La app registra la
clave PÚBLICA aquí y firma cada marcación sin conexión en el momento de hacerla; al llegar, este módulo comprueba la firma.
Cualquier cambio a lo guardado (hora, lugar, tipo, dispositivo o foto) invalida la firma.

Qué se firma (`mensaje_de_marcacion`): un texto con versión, la persona, el id de la marcación, el tipo, la hora en
milisegundos, la ubicación a 6 decimales, el dispositivo y el SHA-256 de la selfie. La app arma exactamente el mismo texto
(`src/lib/firma/mensaje.ts`); las dos pruebas comparten un caso de referencia para que no se separen.

Qué se comprueba de la clave al registrarla (`evaluar_atestacion`), solo en Android: el celular entrega la cadena de
certificados que el chip emite para esa clave (key attestation). Se verifica que la cadena sea coherente, que el primer
certificado sea de ESA clave, que lleve el desafío de esta cuenta y este celular, y se lee qué tan protegida está (software,
TEE o StrongBox) y si el celular arrancó con el sistema original. Si se configura la huella de la raíz de Google
(`ATESTACION_RAICES_SHA256`) además se exige que la cadena termine ahí; sin ella la cadena se comprueba pero no se ancla.
En iPhone no hay prueba equivalente sin la verificación de App Attest de Apple, que queda como trabajo futuro: la clave se
registra igual, marcada «sin_prueba».

Límites, dichos con claridad: la firma protege lo GUARDADO. No impide que alguien con root enganche la app mientras corre
(Frida) y le pida firmar datos falsos, ni que falsee el GPS antes de firmar; eso corresponde a la integridad del dispositivo
(Play Integrity / App Attest), que quedan como trabajo futuro.
"""
import base64
import binascii
import hashlib
import hmac
from datetime import datetime, timezone

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

VERSION_MENSAJE = "asistencia-unemi/marca/v1"
CONTEXTO_DESAFIO = "asistencia-unemi/clave/v1"
OID_ATESTACION = x509.ObjectIdentifier("1.3.6.1.4.1.11129.2.1.17")
_EPOCA = datetime(1970, 1, 1, tzinfo=timezone.utc)


class ClaveInvalida(ValueError):
    """La clave pública enviada no sirve (no es base64, no es P-256…)."""


class AtestacionInvalida(ValueError):
    """La cadena de certificados no demuestra lo que debería."""


# ------------------------------------------------------------------ lo que se firma
def ms_epoch(momento: datetime) -> int:
    """Milisegundos desde 1970 con aritmética entera (sin pasar por decimales, que pueden redondear mal)."""
    diferencia = momento.astimezone(timezone.utc) - _EPOCA
    return (diferencia.days * 86_400 + diferencia.seconds) * 1000 + diferencia.microseconds // 1000


def sha256_hex(texto: str) -> str:
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def mensaje_de_marcacion(
    *, usuario_id: str, marcacion_id: str, tipo: str, fecha_hora: datetime, latitud: float, longitud: float,
    dispositivo_id: str, selfie_b64: str,
) -> bytes:
    """El texto que firma el celular. Cualquier diferencia con lo que llega al servidor invalida la firma."""
    lineas = [
        VERSION_MENSAJE,
        usuario_id,
        marcacion_id,
        tipo,
        str(ms_epoch(fecha_hora)),
        f"{latitud + 0.0:.6f}",      # «+ 0.0» vuelve -0.0 un cero normal: JavaScript no escribe el signo del cero negativo
        f"{longitud + 0.0:.6f}",
        dispositivo_id,
        sha256_hex(selfie_b64),
    ]
    return "\n".join(lineas).encode("utf-8")


def desafio_de_clave(usuario_id: str, dispositivo_id: str) -> bytes:
    """Desafío que el celular pone en la prueba de su clave: la liga a ESTA cuenta y ESTE celular. Lo calculan igual la app y
    el servidor, así que no hace falta una consulta previa."""
    return hashlib.sha256(f"{CONTEXTO_DESAFIO}|{usuario_id}|{dispositivo_id}".encode("utf-8")).digest()


# ------------------------------------------------------------------ claves y firmas
def _b64(texto: str) -> bytes:
    try:
        return base64.b64decode(texto, validate=True)
    except (binascii.Error, ValueError) as e:
        raise ClaveInvalida("No es base64 válido") from e


def cargar_clave_publica(clave_b64: str) -> ec.EllipticCurvePublicKey:
    """La clave pública del celular: curva P-256, formato SPKI (DER) en base64."""
    try:
        clave = serialization.load_der_public_key(_b64(clave_b64))
    except ClaveInvalida:
        raise
    except Exception as e:  # cryptography lanza ValueError / UnsupportedAlgorithm según el caso
        raise ClaveInvalida("No se pudo leer la clave pública") from e
    if not isinstance(clave, ec.EllipticCurvePublicKey) or not isinstance(clave.curve, ec.SECP256R1):
        raise ClaveInvalida("La clave debe ser de curva P-256")
    return clave


def clave_a_b64(clave: ec.EllipticCurvePublicKey) -> str:
    """La forma canónica en la que se guarda y se compara (así dos envíos de la misma clave coinciden)."""
    der = clave.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return base64.b64encode(der).decode("ascii")


def firma_valida(clave_b64: str, mensaje: bytes, firma_b64: str) -> bool:
    """¿Firmó `mensaje` la clave registrada? La firma es ECDSA con SHA-256 en DER (lo que producen Keystore y Secure Enclave)."""
    try:
        clave = cargar_clave_publica(clave_b64)
        clave.verify(_b64(firma_b64), mensaje, ec.ECDSA(hashes.SHA256()))
        return True
    except (ClaveInvalida, InvalidSignature):
        return False


# ------------------------------------------------------------------ prueba de que la clave está en el hardware (Android)
def _leer_tlv(datos: bytes, pos: int) -> tuple[int, bytes, int]:
    """Lee un elemento DER: (etiqueta, contenido, posición siguiente). La etiqueta se devuelve completa (con sus bytes
    extra si es de número alto, como el [704] de la raíz de confianza)."""
    if pos >= len(datos):
        raise AtestacionInvalida("La prueba de la clave está incompleta")
    inicio = pos
    pos += 1
    if datos[inicio] & 0x1F == 0x1F:           # etiqueta de varios bytes
        while True:
            if pos >= len(datos):
                raise AtestacionInvalida("La prueba de la clave está incompleta")
            pos += 1
            if not datos[pos - 1] & 0x80:
                break
    etiqueta = int.from_bytes(datos[inicio:pos], "big")
    if pos >= len(datos):
        raise AtestacionInvalida("La prueba de la clave está incompleta")
    largo = datos[pos]
    pos += 1
    if largo & 0x80:
        n = largo & 0x7F
        if n == 0 or n > 4 or pos + n > len(datos):
            raise AtestacionInvalida("La prueba de la clave tiene un formato inválido")
        largo = int.from_bytes(datos[pos : pos + n], "big")
        pos += n
    if pos + largo > len(datos):
        raise AtestacionInvalida("La prueba de la clave está incompleta")
    return etiqueta, datos[pos : pos + largo], pos + largo


def _hijos(contenido: bytes) -> list[tuple[int, bytes]]:
    salida, pos = [], 0
    while pos < len(contenido):
        etiqueta, valor, pos = _leer_tlv(contenido, pos)
        salida.append((etiqueta, valor))
    return salida


def _entero(valor: bytes) -> int:
    return int.from_bytes(valor, "big", signed=True)


ETIQUETA_SECUENCIA = 0x30
ETIQUETA_ENTERO = 0x02
ETIQUETA_ENUMERADO = 0x0A
ETIQUETA_OCTETOS = 0x04
ETIQUETA_BOOLEANO = 0x01
ETIQUETA_RAIZ_DE_CONFIANZA = 0xBF8540        # [704] EXPLICIT: AuthorizationList.rootOfTrust


def _descripcion_de_clave(certificado: x509.Certificate) -> dict:
    """Lee el KeyDescription que el chip pone en el certificado de la clave (OID 1.3.6.1.4.1.11129.2.1.17)."""
    try:
        extension = certificado.extensions.get_extension_for_oid(OID_ATESTACION)
    except x509.ExtensionNotFound as e:
        raise AtestacionInvalida("El certificado de la clave no trae la prueba de hardware") from e
    contenido = getattr(extension.value, "value", None)
    if not isinstance(contenido, bytes):
        raise AtestacionInvalida("La prueba de hardware de la clave no se pudo leer")
    etiqueta, cuerpo, _ = _leer_tlv(contenido, 0)
    if etiqueta != ETIQUETA_SECUENCIA:
        raise AtestacionInvalida("La prueba de hardware de la clave tiene un formato inválido")
    campos = _hijos(cuerpo)
    if len(campos) < 8:
        raise AtestacionInvalida("La prueba de hardware de la clave está incompleta")
    (_, version), (_, nivel_atestacion), (_, _vk), (_, nivel_clave), (_, desafio) = campos[:5]
    lista_hardware = campos[7][1]
    arranque_verificado: bool | None = None
    for etiqueta_elem, valor in _hijos(lista_hardware):
        if etiqueta_elem != ETIQUETA_RAIZ_DE_CONFIANZA:
            continue
        e2, raiz, _ = _leer_tlv(valor, 0)
        if e2 != ETIQUETA_SECUENCIA:
            break
        partes = _hijos(raiz)
        # rootOfTrust ::= SEQUENCE { verifiedBootKey, deviceLocked, verifiedBootState, verifiedBootHash }
        if len(partes) >= 3 and partes[2][0] == ETIQUETA_ENUMERADO:
            arranque_verificado = _entero(partes[2][1]) == 0   # 0 = Verified; 1 SelfSigned, 2 Unverified, 3 Failed
        break
    return {
        "version": _entero(version),
        "nivel": min(_entero(nivel_atestacion), _entero(nivel_clave)),   # 0 software, 1 TEE, 2 StrongBox
        "desafio": desafio,
        "arranque_verificado": arranque_verificado,
    }


_NIVELES = {0: "software", 1: "tee", 2: "strongbox"}


def evaluar_atestacion(
    cadena_b64: list[str], clave_b64: str, desafio: bytes, raices_sha256: frozenset[str] = frozenset()
) -> dict:
    """Comprueba la cadena de certificados de una clave de Android y devuelve la evidencia:
    {"plataforma": "android", "nivel": "strongbox|tee|software", "arranque_verificado": bool|None, "raiz_anclada": bool}.

    Lanza `AtestacionInvalida` si la cadena no es coherente, no es de esa clave o no lleva el desafío esperado."""
    if not cadena_b64:
        raise AtestacionInvalida("Falta la cadena de certificados de la clave")
    try:
        certificados = [x509.load_der_x509_certificate(_b64(c)) for c in cadena_b64]
    except (ClaveInvalida, ValueError) as e:
        raise AtestacionInvalida("Un certificado de la cadena no se pudo leer") from e

    # Cada certificado lo firma el siguiente; el último debe estar firmado por sí mismo (raíz).
    try:
        for hijo, padre in zip(certificados, certificados[1:] + [certificados[-1]]):
            hijo.verify_directly_issued_by(padre)
    except (ValueError, TypeError, InvalidSignature) as e:
        raise AtestacionInvalida("La cadena de certificados no es coherente") from e

    # El primero es el de la clave que se registra, no el de otra.
    hoja = certificados[0].public_key()
    if not isinstance(hoja, ec.EllipticCurvePublicKey) or clave_a_b64(hoja) != clave_a_b64(cargar_clave_publica(clave_b64)):
        raise AtestacionInvalida("La prueba es de otra clave")

    descripcion = _descripcion_de_clave(certificados[0])
    if not hmac.compare_digest(descripcion["desafio"], desafio):
        raise AtestacionInvalida("La prueba no corresponde a esta cuenta y este celular")

    huella_raiz = hashlib.sha256(certificados[-1].public_bytes(serialization.Encoding.DER)).hexdigest()
    if raices_sha256 and huella_raiz not in raices_sha256:
        raise AtestacionInvalida("La cadena no termina en una raíz de confianza")

    return {
        "plataforma": "android",
        "nivel": _NIVELES.get(descripcion["nivel"], "software"),
        "arranque_verificado": descripcion["arranque_verificado"],
        "raiz_anclada": bool(raices_sha256),
    }


def esta_en_hardware(evidencia: dict) -> bool:
    return evidencia.get("nivel") in ("tee", "strongbox")
