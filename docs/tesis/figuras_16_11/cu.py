"""Figura 2: casos de uso, asociaciones sin flecha e «include» separados."""
from er import Lienzo, K, FN, FB
from PIL import ImageFont
import math
f = ImageFont.truetype(FN, int(8 * K)); fb = ImageFont.truetype(FB, int(8.5 * K)); fi = ImageFont.truetype(FN, int(7.5 * K))
RH = 33; Y0 = 36
filas = ["CU02 Registrar rostro\ncon consentimiento", "CU03 Marcar asistencia\nen línea (app)", "CU05 Sincronizar\nsolicitudes pendientes",
         "CU06 Marcar por la web\nde contingencia", "CU04 Guardar solicitud\nsin conexión", "CU07 Consultar historial,\navisos y reporte individual",
         "CU08 Justificar anomalía\npor chat", "CU01 Iniciar sesión\nsegún el rol", "CU09 Invitar y gestionar\nusuarios",
         "CU10 Configurar sedes, bloques,\nparámetros y feriados", "CU11 Revisar y decidir\ncasos", "CU12 Consultar bitácora",
         "CU13 Generar reportes\ngenerales", "CU14 Detectar ausencias\ny plazos vencidos"]
H = Y0 + RH * len(filas) + 10
C = Lienzo(439, H); d = C.d; P = C.P; LW = int(0.8 * K)
BX1, BX2 = 84, 374
d.rectangle([*P(BX1, 6), *P(BX2, H - 6)], outline="black", width=LW)
d.text(P((BX1 + BX2) / 2, 11), "Sistema híbrido de asistencia UNEMI", font=fb, fill="black", anchor="ma")
CX, EW, EH = 164, 144, 27
def elipse(cx, cy, ew, t):
    d.ellipse([*P(cx - ew / 2, cy - EH / 2), *P(cx + ew / 2, cy + EH / 2)], fill=(242, 242, 242), outline="black", width=LW)
    d.multiline_text(P(cx, cy), t, font=f, fill="black", anchor="mm", align="center", spacing=int(1 * K))
def borde(cx, cy, ew, ang):  # punto del borde de la elipse en la dirección ang
    a, b = ew / 2, EH / 2
    r = a * b / math.hypot(b * math.cos(ang), a * math.sin(ang))
    return cx + r * math.cos(ang), cy + r * math.sin(ang)
def actor(x, y, t):
    s = 1.0
    d.ellipse([*P(x - 4, y - 18), *P(x + 4, y - 10)], outline="black", width=LW, fill="white")
    d.line([P(x, y - 10), P(x, y + 2)], fill="black", width=LW); d.line([P(x - 7, y - 6), P(x + 7, y - 6)], fill="black", width=LW)
    d.line([P(x, y + 2), P(x - 6, y + 11)], fill="black", width=LW); d.line([P(x, y + 2), P(x + 6, y + 11)], fill="black", width=LW)
    d.multiline_text(P(x, y + 14), t, font=f, fill="black", anchor="ma", align="center", spacing=int(1 * K))
def flecha(x1, y1, x2, y2, dash=False, punta=True):
    L = math.hypot(x2 - x1, y2 - y1)
    if dash:
        n = int(L / 2.0)
        for i in range(0, n, 2):
            d.line([P(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n), P(x1 + (x2 - x1) * (i + 1) / n, y1 + (y2 - y1) * (i + 1) / n)], fill="black", width=LW)
    else:
        d.line([P(x1, y1), P(x2, y2)], fill="black", width=LW)
    if punta:
        a = math.atan2(y2 - y1, x2 - x1); l = 5
        for s in (-.45, .45):
            d.line([P(x2, y2), P(x2 - l * math.cos(a + s), y2 - l * math.sin(a + s))], fill="black", width=LW)
ys = {}
for i, t in enumerate(filas):
    y = Y0 + 14 + i * RH; ys[t[:4]] = y; elipse(CX, y, EW if "CU10" not in t else 156, t)
# Casos incluidos
IX, IW = 324, 96
inc = {"VR": ("Verificar rostro\ny vivacidad", ys["CU02"] + 2), "DA": ("Detectar anomalías\npor reglas", ys["CU05"]), "VZ": ("Validar zona\n(geocerca)", ys["CU04"] - 2)}
for k, (t, y) in inc.items(): elipse(IX, y, IW, t)
fuentes = ["CU03", "CU05", "CU06"]
for j, s in enumerate(fuentes):
    for m, k in enumerate(["VR", "DA", "VZ"]):
        ty = inc[k][1] + (j - 1) * 8  # puertos separados en el destino
        sx, sy = CX + EW / 2, ys[s] + (m - 1) * 7
        sx = CX + (EW / 2) * math.sqrt(max(0, 1 - ((sy - ys[s]) / (EH / 2)) ** 2))
        tx = IX - (IW / 2) * math.sqrt(max(0, 1 - ((ty - inc[k][1]) / (EH / 2)) ** 2))
        flecha(sx, sy, tx, ty, dash=True)
for k, (t, y) in inc.items():
    d.text(P(IX, y - EH / 2 - 1.5), "«include»", font=fi, fill="black", anchor="md")
# Actores y asociaciones (línea simple, sin punta)
AU = (36, ys["CU07"] - 40); AA = (36, ys["CU11"] - 4); AP = (36, ys["CU14"] - 4)
actor(*AU, "Usuario\n(personal\nadministrativo)"); actor(*AA, "Administrador\n(Talento\nHumano)"); actor(*AP, "Proceso\nprogramado")
def asoc(a, c, dy=-4):
    x, y = a[0] + 9, a[1] + dy
    ex, ey = CX - (EW if c != "CU10" else 156) / 2, ys[c]
    d.line([P(x, y), P(ex, ey)], fill="black", width=LW)
for c in ["CU02", "CU03", "CU05", "CU06", "CU04", "CU07", "CU08", "CU01"]: asoc(AU, c)
for c in ["CU01", "CU09", "CU10", "CU11", "CU12", "CU13"]: asoc(AA, c)
asoc(AP, "CU14")
# Proveedor de IA (actor secundario, fuera del sistema)
AI = (408, ys["CU08"] + 2)
actor(*AI, "Proveedor\nde IA")
ex, ey = borde(CX, ys["CU08"], EW, 0)
d.line([P(ex, ey), P(AI[0] - 9, ys["CU08"] - 4)], fill="black", width=LW)
C.guardar("F02_casos_uso.png")
