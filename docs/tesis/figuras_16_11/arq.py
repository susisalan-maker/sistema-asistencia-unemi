"""Figura 1: arquitectura por capas, conectores ortogonales sin cruces."""
from er import Lienzo, K, FN, FB
from PIL import ImageFont
import math
f = ImageFont.truetype(FN, int(8.5 * K)); fb = ImageFont.truetype(FB, int(9 * K)); fs = ImageFont.truetype(FN, int(8 * K))
fbs = ImageFont.truetype(FB, int(8.5 * K))
C = Lienzo(439, 456); d = C.d; P = C.P; LW = int(0.9 * K)
GRIS = (90, 90, 90)
def banda(x1, y1, x2, y2, t):
    d.rectangle([*P(x1, y1), *P(x2, y2)], fill=(244, 246, 250), outline=(150, 156, 170), width=LW)
    d.text(P(x1 + 5, y1 + 4), t, font=fb, fill=(27, 42, 110), anchor="la")
def caja(x1, y1, x2, y2, lineas, titulo=False, fill="white"):
    d.rectangle([*P(x1, y1), *P(x2, y2)], fill=fill, outline="black", width=LW)
    if titulo:
        d.text(P((x1 + x2) / 2, y1 + 4), lineas[0], font=fbs, fill="black", anchor="ma"); return
    n = len(lineas); h = 10.5
    for i, t in enumerate(lineas):
        d.text(P((x1 + x2) / 2, (y1 + y2) / 2 + (i - (n - 1) / 2) * h), t, font=f, fill="black", anchor="mm")
def cilindro(x1, y1, x2, y2, lineas):
    e = 5
    d.rectangle([*P(x1, y1 + e), *P(x2, y2 - e)], fill="white")
    d.ellipse([*P(x1, y2 - 2 * e), *P(x2, y2)], fill="white", outline="black", width=LW)
    d.rectangle([*P(x1 + 0.5, y1 + e), *P(x2 - 0.5, y2 - e)], fill="white")
    d.line([P(x1, y1 + e), P(x1, y2 - e)], fill="black", width=LW); d.line([P(x2, y1 + e), P(x2, y2 - e)], fill="black", width=LW)
    d.ellipse([*P(x1, y1), *P(x2, y1 + 2 * e)], fill="white", outline="black", width=LW)
    n = len(lineas)
    for i, t in enumerate(lineas):
        d.text(P((x1 + x2) / 2, (y1 + y2) / 2 + 3 + (i - (n - 1) / 2) * 10.5), t, font=f, fill="black", anchor="mm")
def nube(x1, y1, x2, y2, lineas):
    d.rounded_rectangle([*P(x1, y1), *P(x2, y2)], radius=12 * K, fill="white", outline="black", width=LW)
    for i, t in enumerate(lineas):
        d.text(P((x1 + x2) / 2, (y1 + y2) / 2 + (i - (len(lineas) - 1) / 2) * 10.5), t, font=f, fill="black", anchor="mm")
def linea(pts, dash=False, flecha=True):
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        if dash:
            L = math.hypot(x2 - x1, y2 - y1); n = max(1, int(L / 3))
            for i in range(0, n, 2):
                d.line([P(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n), P(x1 + (x2 - x1) * min(n, i + 1) / n, y1 + (y2 - y1) * min(n, i + 1) / n)], fill="black", width=LW)
        else:
            d.line([P(x1, y1), P(x2, y2)], fill="black", width=LW)
    if flecha:
        (x1, y1), (x2, y2) = pts[-2], pts[-1]; a = math.atan2(y2 - y1, x2 - x1); L = 5
        d.polygon([P(x2, y2), P(x2 - L * math.cos(a - .42), y2 - L * math.sin(a - .42)), P(x2 - L * math.cos(a + .42), y2 - L * math.sin(a + .42))], fill="black")
def etiqueta(x, y, t, anchor="mm", num=None):
    bb = d.textbbox(P(x, y), t, font=fs, anchor=anchor)
    d.rectangle([bb[0] - 4, bb[1] - 2, bb[2] + 4, bb[3] + 2], fill="white")
    d.text(P(x, y), t, font=fs, fill=GRIS, anchor=anchor)
def numero(x, y, n):
    r = 5 if len(str(n)) == 1 else 6
    d.ellipse([*P(x - r, y - r), *P(x + r, y + r)], fill=(27, 42, 110))
    d.text(P(x, y + 0.3), str(n), font=ImageFont.truetype(FB, int((7.5 if len(str(n)) == 1 else 6.5) * K)), fill="white", anchor="mm")

# Capas
banda(6, 6, 433, 152, "Presentación")
banda(6, 166, 433, 266, "Lógica de negocio (Render, Docker)")
banda(6, 280, 433, 372, "Datos (Supabase)")
# Presentación
caja(20, 24, 228, 144, ["Aplicación Android (React Native + Expo)"], titulo=True)
caja(30, 44, 116, 78, ["Pantallas: marcar,", "historial, avisos"])
cilindro(140, 42, 218, 80, ["SQLite", "(cola local)"])
caja(140, 100, 218, 136, ["Sincronizador:", "firma P-256, cifrado"])
caja(244, 24, 424, 144, ["Navegador (React + Vite)"], titulo=True)
caja(254, 58, 334, 96, ["/usuario", "contingencia"])
caja(342, 58, 416, 96, ["/admin", "Talento Humano"])
# Lógica
caja(20, 184, 304, 258, ["Microservicio FastAPI (Python 3.11)"], titulo=True)
caja(30, 204, 110, 248, ["Reglas y", "anomalías"])
caja(118, 204, 206, 248, ["Verificación", "facial (ONNX)"])
caja(214, 204, 294, 248, ["Chat de", "justificación"])
nube(326, 202, 408, 248, ["Proveedor de IA", "(Gemini, Claude", "u OpenAI)"])
# Datos
caja(120, 300, 300, 352, ["Supabase Auth y PostgREST", "(sesión JWT, API REST con RLS)"])
cilindro(326, 294, 420, 360, ["PostgreSQL", "(RLS, funciones", "y disparadores)"])

# Conectores
linea([(73, 78), (73, 184)]); numero(73, 132, 1)
linea([(116, 61), (140, 61)]); numero(128, 61 - 9, 2)
linea([(179, 80), (179, 100)]); numero(179 + 9, 90, 3)
linea([(179, 136), (179, 184)]); numero(179, 160, 4)
linea([(294, 96), (294, 184)]); numero(294, 140, 5)
linea([(379, 96), (379, 174), (300, 174), (300, 184)], flecha=True); numero(340, 174, 6)
linea([(20, 120), (13, 120), (13, 326), (120, 326)], dash=True); numero(13, 230, 7)
linea([(424, 120), (428, 120), (428, 288), (270, 288), (270, 300)], dash=True); numero(428, 230, 8)
linea([(200, 258), (200, 300)]); numero(200, 279, 9)
linea([(304, 225), (326, 225)]); numero(315, 216, 10)
linea([(300, 326), (326, 326)]); numero(313, 317, 11)
# Leyenda
ley = [("1", "Marcación en línea: HTTPS y token JWT."), ("2", "Sin red: la solicitud se guarda cifrada."),
       ("3", "La cola entrega las solicitudes pendientes."), ("4", "Sincronización: HTTPS, firma y prueba de reloj."),
       ("5", "Marcación web de contingencia: HTTPS."), ("6", "Acciones administrativas con reglas: HTTPS."),
       ("7", "Inicio de sesión y perfil propio (RLS)."), ("8", "Sesión, lecturas y funciones RPC (RLS)."),
       ("9", "Valida el token; escribe con service_role."), ("10", "Chat y resumen ejecutivo: HTTPS."),
       ("11", "Consultas SQL dentro de Supabase.")]
y0 = 384
for i, (n, t) in enumerate(ley):
    col, fila = i % 2, i // 2
    x = 14 + col * 214; y = y0 + fila * 12
    numero(x, y, n)
    d.text(P(x + 9, y), t, font=fs, fill="black", anchor="lm")
C.guardar("F01_arquitectura.png")
