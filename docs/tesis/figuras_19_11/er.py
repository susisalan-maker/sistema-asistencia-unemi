"""Dibujo de MER en pata de gallo con Pillow: tablas por filas y conectores ortogonales con rutas explícitas."""
from PIL import Image, ImageDraw, ImageFont
K = 4  # px por punto tipográfico
FN = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
fN = ImageFont.truetype(FN, int(8.5 * K)); fB = ImageFont.truetype(FB, int(8.5 * K))
fT = ImageFont.truetype(FN, int(8 * K)); fK = ImageFont.truetype(FB, int(8 * K))
RH, HH, PAD = 11.5, 14, 3
MARINO, GRIS, ROJO = (27, 42, 110), (90, 90, 90), (163, 42, 42)

def w(t, f): return f.getlength(t) / K

class Lienzo:
    def __init__(s, W, H):
        s.W, s.H = W, H
        s.img = Image.new("RGB", (int(W * K), int(H * K)), "white")
        s.d = ImageDraw.Draw(s.img)
        s.t = {}
    def P(s, x, y): return (x * K, y * K)
    def ancho(s, cols):
        nom = max(w(c, fB if "PK" in k else fN) + (w(" " + k, fK) if k else 0) for c, t, k in cols)
        typ = max(w(t, fT) for c, t, k in cols)
        return nom + typ + 3 * PAD + 6
    def tabla(s, nombre, cols, x, y, ancho=None, stub=False):
        a = ancho or s.ancho(cols)
        h = HH + RH * len(cols) + 2
        d = s.d
        col = (138, 147, 165) if stub else MARINO
        d.rectangle([*s.P(x, y), *s.P(x + a, y + HH)], fill=col)
        d.text(s.P(x + a / 2, y + HH / 2), nombre, font=fB, fill="white", anchor="mm")
        nomw = max(w(c, fB if "PK" in k else fN) + (w(" " + k, fK) if k else 0) for c, t, k in cols)
        filas = {}
        for i, (c, t, k) in enumerate(cols):
            yy = y + HH + RH * i + RH / 2 + 1
            f = fB if "PK" in k else fN
            d.text(s.P(x + PAD, yy), c, font=f, fill="black", anchor="lm")
            if k:
                d.text(s.P(x + PAD + w(c + " ", f), yy), k, font=fK, fill=ROJO, anchor="lm")
            d.text(s.P(x + PAD * 2 + nomw + 6, yy), t, font=fT, fill=GRIS, anchor="lm")
            filas[c] = yy
        if stub:
            for xx in range(int(x * K), int((x + a) * K), 18):
                pass
            s.punteado([(x, y), (x + a, y), (x + a, y + h), (x, y + h), (x, y)])
        else:
            d.rectangle([*s.P(x, y), *s.P(x + a, y + h)], outline="black", width=int(0.9 * K))
        s.t[nombre] = dict(x=x, y=y, a=a, h=h, filas=filas)
        return s.t[nombre]
    def punteado(s, pts, paso=3.0):
        import math
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            L = math.hypot(x2 - x1, y2 - y1); n = max(1, int(L / paso))
            for i in range(0, n, 2):
                a = (x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n)
                b = (x1 + (x2 - x1) * min(n, i + 1) / n, y1 + (y2 - y1) * min(n, i + 1) / n)
                s.d.line([s.P(*a), s.P(*b)], fill="black", width=int(0.9 * K))
    def puerto(s, tabla, fila, lado):
        t = s.t[tabla]; y = t["filas"][fila]
        return (t["x"] if lado == "w" else t["x"] + t["a"], y)
    def marca(s, x, y, dx, dy, tipo):
        """Símbolo en el extremo (x,y) que toca la tabla; (dx,dy) apunta hacia afuera de la tabla."""
        d = s.d; lw = int(0.9 * K)
        px, py = -dy, dx  # perpendicular
        def seg(a, b, c, e): d.line([s.P(a, b), s.P(c, e)], fill="black", width=lw)
        def tick(o):
            cx, cy = x + dx * o, y + dy * o
            seg(cx + px * 3.5, cy + py * 3.5, cx - px * 3.5, cy - py * 3.5)
        def circ(o):
            cx, cy = x + dx * o, y + dy * o; r = 2.3
            d.ellipse([*s.P(cx - r, cy - r), *s.P(cx + r, cy + r)], fill="white", outline="black", width=lw)
        def crow():
            o = 6
            for k in (-1, 0, 1):
                seg(x + dx * o, y + dy * o, x + px * 3.8 * k, y + py * 3.8 * k)
        if tipo == "||": tick(3); tick(6)
        elif tipo == "o|": tick(3); circ(8.5)
        elif tipo == "o<": crow(); circ(8.5)
        elif tipo == "|<": crow(); tick(8.5)
    def rel(s, pts, ini, fin, saltos=()):
        """pts: polilínea ortogonal desde el puerto de la tabla padre al de la hija. ini/fin: tipos de marca."""
        lw = int(0.9 * K)
        for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
            s.d.line([s.P(x1, y1), s.P(x2, y2)], fill="black", width=lw)
        for (sx, sy) in saltos:  # puente sobre una línea vertical que cruza una horizontal
            r = 2.6
            s.d.rectangle([*s.P(sx - r, sy - 0.6), *s.P(sx + r, sy + 0.6)], fill="white")
            s.d.arc([*s.P(sx - r, sy - r), *s.P(sx + r, sy + r)], 180, 360, fill="black", width=lw)
        def dirn(a, b):
            dx, dy = b[0] - a[0], b[1] - a[1]; L = (dx * dx + dy * dy) ** .5
            return dx / L, dy / L
        if ini: s.marca(*pts[0], *dirn(pts[0], pts[1]), ini)
        s.marca(*pts[-1], *dirn(pts[-1], pts[-2]), fin)
    def guardar(s, ruta):
        s.img.save(ruta, dpi=(K * 72, K * 72)); print(ruta, s.img.size)
