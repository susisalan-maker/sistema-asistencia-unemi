"""Hora del servidor firmada, para poder creer la hora de una marcación hecha sin conexión.

El problema: sin internet, la hora de la marcación es la del reloj del celular, y la persona puede atrasarlo
(Ajustes → Fecha y hora) para «llegar puntual». El servidor ya rechaza horas futuras y muy antiguas; esto cierra el
hueco de las horas ATRASADAS.

La idea (docs/logica-negocio.md, «Hora de una marcación sin conexión»):
  1. Cada vez que la app consulta `GET /marcaciones/hoy`, el servidor le entrega su hora firmada (`hora_servidor`).
     La firma impide que la app invente o cambie esa hora; va ligada a la persona.
  2. La app anota, junto a esa hora, cuánto tiempo llevaba el celular encendido (contador de arranque, que no se
     cambia desde Ajustes). Lo mismo hace al marcar sin conexión.
  3. Al llegar la marcación, el servidor sabe que la hora real de la marcación no puede ser anterior a
     «hora firmada + tiempo encendido entre una cosa y la otra»: el celular encendido no retrocede el tiempo.
     Si la hora que dice el reloj del celular es anterior a esa cota (más la tolerancia), el reloj estaba atrasado.

Límites, dichos con claridad: el contador de arranque no cuenta el tiempo con el celular en reposo profundo
(Android) y se reinicia al apagar. Por eso es una COTA INFERIOR (nunca rechaza a quien tiene el reloj bien: el tiempo
real siempre es mayor o igual) y no la hora exacta; y tras un reinicio no hay cota y se vuelve a la hora del celular.
Con una compilación propia de la app se puede usar un contador que incluye el reposo y la cota se vuelve exacta.
Esto no defiende de quien modifica la app o el sistema (root, ganchos): eso corresponde a la integridad del
dispositivo y a la firma con clave de hardware, que quedan como trabajo futuro.

La clave de la firma se deriva de `SUPABASE_SERVICE_ROLE_KEY` (que ya solo vive en el servidor), así que no hay
variables nuevas que configurar.
"""
import hashlib
import hmac
from datetime import datetime, timezone

CONTEXTO = b"asistencia-unemi/reloj/v1"


def clave_de(secreto: str) -> bytes:
    """Clave propia de esta función, derivada del secreto del servidor: la firma de la hora no sirve para nada más."""
    return hmac.new(secreto.encode("utf-8"), CONTEXTO, hashlib.sha256).digest()


def a_milisegundos(momento: datetime) -> int:
    return int(momento.astimezone(timezone.utc).timestamp() * 1000)


def sin_microsegundos(momento: datetime) -> datetime:
    """La hora se entrega con precisión de milisegundo: así lo que se firma es exactamente lo que viaja."""
    return momento.replace(microsecond=(momento.microsecond // 1000) * 1000)


def firmar(clave: bytes, usuario_id: str, momento: datetime) -> str:
    mensaje = f"{usuario_id}|{a_milisegundos(momento)}".encode("utf-8")
    return hmac.new(clave, mensaje, hashlib.sha256).hexdigest()


def firma_valida(clave: bytes, usuario_id: str, momento: datetime, firma: str) -> bool:
    return hmac.compare_digest(firmar(clave, usuario_id, momento), firma)


def hora_servidor(clave: bytes, usuario_id: str, ahora: datetime) -> dict:
    """Lo que `GET /marcaciones/hoy` entrega a la app."""
    t = sin_microsegundos(ahora.astimezone(timezone.utc))
    return {"t": t.isoformat(), "firma": firmar(clave, usuario_id, t)}
