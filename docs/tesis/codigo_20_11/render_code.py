import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont
from pygments import lex
from pygments.lexers import get_lexer_by_name
from pygments.token import Token as T

S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = '/home/user/sistema-asistencia-unemi'; REF = 'origin/despliegue'
K = 4                      # px por punto
WIDTH_PT = 425             # ancho de caja de texto (A4, márgenes 3 cm)
FS_PT = 8.4                # tamaño de letra del código al tamaño insertado
WRAP = 80
FONT = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Regular.ttf'
FONT_I = '/usr/share/fonts/truetype/jetbrains-mono/JetBrainsMono-Italic.ttf'
UI = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
f = ImageFont.truetype(FONT, int(FS_PT * K)); fi = ImageFont.truetype(FONT_I, int(FS_PT * K))
fui = ImageFont.truetype(UI, int(7.6 * K)); fui_s = ImageFont.truetype(UI, int(7 * K))
CW = f.getlength('M'); LH = int(FS_PT * K * 1.45)
BG, GUT, LN, LNA = (30, 30, 30), (30, 30, 30), (110, 118, 129), (200, 200, 200)
TITLE, TAB, CRUMB = (24, 24, 24), (30, 30, 30), (204, 204, 204)
COL = {
 'kw': (86, 156, 214), 'ctrl': (197, 134, 192), 'str': (206, 145, 120), 'com': (106, 153, 85),
 'num': (181, 206, 168), 'fn': (220, 220, 170), 'type': (78, 201, 176), 'var': (156, 220, 254),
 'txt': (212, 212, 212), 'const': (79, 193, 255), 'prop': (156, 220, 254),
}
CTRL = {'if','else','elif','return','await','async','for','while','try','except','catch','finally','raise','throw',
        'import','from','export','default','as','with','break','continue','switch','case','yield','new','await'}

def color(tt, val):
    if tt in T.Comment: return COL['com'], True
    if tt in T.String: return COL['str'], False
    if tt in T.Number: return COL['num'], False
    if tt in T.Keyword.Constant: return COL['kw'], False
    if tt in T.Keyword.Type: return COL['type'], False
    if tt in T.Keyword:
        return (COL['ctrl'] if val.strip() in CTRL else COL['kw']), False
    if tt in T.Name.Function or tt in T.Name.Decorator: return COL['fn'], False
    if tt in T.Name.Builtin.Pseudo: return COL['kw'], False
    if tt in T.Name.Builtin: return COL['type'] if val[:1].isupper() else COL['fn'], False
    if tt in T.Name.Class or tt in T.Name.Namespace: return COL['type'], False
    if tt in T.Name.Tag: return COL['kw'], False
    if tt in T.Name.Constant: return COL['const'], False
    if tt in T.Name.Attribute or tt in T.Name.Property or tt in T.Name.Variable or tt in T.Name.Other: return COL['var'], False
    if tt in T.Name:
        if val[:1].isupper(): return COL['type'], False
        return COL['var'], False
    return COL['txt'], False

def src_lines(path):
    return subprocess.run(['git', '-C', REPO, 'show', f'{REF}:{path}'], capture_output=True, text=True, check=True).stdout.splitlines()

def build_rows(code, src):
    """(n.º de línea real | None, texto, es_pliegue). Copia literal del repositorio; los saltos se marcan con un pliegue."""
    rows = []; k = 0; prev = None; pending = None
    for c in code.splitlines():
        cs = c.strip()
        if not cs: continue
        hit = next((t for t in range(k, len(src)) if src[t].strip() == cs), None)
        if hit is None:                       # comentario de omisión escrito en el documento
            pending = cs; continue
        if prev is not None and hit > prev + 1:
            skipped = src[prev + 1:hit]
            if pending is None and all(not s.strip() for s in skipped):
                rows += [(prev + 2 + i, s, False) for i, s in enumerate(skipped)]
            else:
                rows.append((None, pending or '', True))
        elif pending is not None:
            rows.append((None, pending, True))
        pending = None
        rows.append((hit + 1, src[hit], False)); prev = hit; k = hit + 1
    return rows

def wrap(tokens):
    """Ajuste de línea al estilo editor (wordWrap): corta en límite de palabra, sangría de la línea."""
    chars = [(c, tt) for tt, v in tokens for c in v]
    text = ''.join(c for c, _ in chars)
    ind = len(text) - len(text.lstrip(' '))
    if not chars: return [[('ws', '')]]
    lines = []; first = True
    while chars:
        room = WRAP - (0 if first else ind)
        if len(chars) <= room:
            seg = chars; chars = []
        else:
            cut = 0
            lo = (ind + 8) if first else 8
            for i in range(room, lo, -1):
                prev = chars[i - 1][0]
                if prev == ' ' or (prev in ',([{.:=' and chars[i][0] != ' '):
                    cut = i; break
            if cut == 0: cut = room
            seg = chars[:cut]; chars = chars[cut:]
            while chars and chars[0][0] == ' ': chars = chars[1:]
        lead = [] if first else [(' ' * ind, 'ws')]
        lines.append(lead + seg); first = False
    out = []
    for ln in lines:
        toks = []
        for c, tt in ln:
            if len(c) > 1: toks.append((tt, c)); continue
            if toks and toks[-1][0] == tt: toks[-1] = (tt, toks[-1][1] + c)
            else: toks.append((tt, c))
        out.append(toks or [('ws', '')])
    return out

def render(fr, outpath):
    src = src_lines(fr['file'])
    rows = build_rows(fr['code'], src)
    lexer = get_lexer_by_name(fr['lang'])
    gut_chars = max(len(str(r[0])) for r in rows if r[0]) + 1
    W = int(WIDTH_PT * K)
    global WRAP
    WRAP = int((W - (int(6 * K) + gut_chars * CW + int(10 * K)) - int(6 * K)) // CW)
    vis = []
    for n, text, fold in rows:
        if fold:
            vis.append(('', [('fold', text)], True)); continue
        toks = [(tt, v) for tt, v in lex(text + '\n', lexer)]
        if toks and toks[-1][1].endswith('\n'):
            tt, v = toks[-1]; toks[-1] = (tt, v[:-1])
        for i, part in enumerate(wrap(toks)):
            vis.append((str(n) if i == 0 else '', part, False))
    tab_h, crumb_h, pad = int(22 * K), int(15 * K), int(5 * K)
    H = tab_h + crumb_h + pad * 2 + LH * len(vis)
    img = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(img)
    # barra de pestañas
    d.rectangle([0, 0, W, tab_h], fill=TITLE)
    name = fr['file'].split('/')[-1]
    tw = int(d.textlength(name, font=fui) + d.textlength('TSX', font=fui_s) + 36 * K)
    d.rectangle([0, 0, tw, tab_h], fill=TAB)
    d.rectangle([0, 0, tw, int(0.6 * K)], fill=(0, 120, 212))
    ext = name.rsplit('.', 1)[-1]
    dot = {'ts': (49, 120, 198), 'tsx': (49, 120, 198), 'py': (255, 202, 40), 'css': (86, 61, 124), 'sql': (230, 145, 56)}.get(ext, (180, 180, 180))
    d.text((int(9 * K), tab_h // 2), {'ts': 'TS', 'tsx': 'TSX', 'py': 'py', 'css': '#', 'sql': 'SQL'}.get(ext, ''), font=fui_s, fill=dot, anchor='lm')
    d.text((int(9 * K) + int(d.textlength('TSX', font=fui_s)) + int(5 * K), tab_h // 2), name, font=fui, fill=(255, 255, 255), anchor='lm')
    d.text((tw - int(9 * K), tab_h // 2), '×', font=fui, fill=(160, 160, 160), anchor='mm')
    # ruta (breadcrumb)
    crumb = '  ›  '.join(fr['file'].split('/'))
    d.text((int(8 * K), tab_h + crumb_h // 2), crumb, font=fui_s, fill=CRUMB, anchor='lm')
    y = tab_h + crumb_h + pad
    gx = int(6 * K); gw = int(gut_chars * CW); x0 = gx + gw + int(10 * K)
    for n, toks, fold in vis:
        cy = y + LH // 2
        if fold:
            d.rectangle([0, y + 2, W, y + LH - 2], fill=(37, 37, 38))
            d.text((gx + gw, cy), '⋯', font=f, fill=LN, anchor='rm')
            txt = toks[0][1] or '⋯'
            d.text((x0, cy), txt, font=fi, fill=(133, 133, 133), anchor='lm', features=['-liga', '-calt'])
        else:
            if n: d.text((gx + gw, cy), n, font=f, fill=LN, anchor='rm')
            x = x0
            for tt, v in toks:
                if tt in ('ws',):
                    x += CW * len(v); continue
                c, ital = color(tt, v)
                d.text((x, cy), v, font=fi if ital else f, fill=c, anchor='lm', features=['-liga', '-calt', '-dlig'])
                x += CW * len(v)
        y += LH
    img.save(outpath, dpi=(K * 72, K * 72))
    return img.size, len(vis)

if __name__ == '__main__':
    fr = json.load(open(os.path.join(S, 'frags.json')))
    langs = {'.ts': 'typescript', '.tsx': 'tsx', '.py': 'python', '.css': 'css', '.sql': 'postgresql'}
    for x in fr:
        x['lang'] = langs[os.path.splitext(x['file'])[1]]
        out = os.path.join(S, 'code', f"FC{x['n']:02d}.png")
        size, n = render(x, out)
        print(x['n'], size, n, 'alto pt', round(size[1] / K))
