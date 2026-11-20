"""Gera o ícone (flat) do Carcará a partir de src/assets/logo.svg (já espelhado).

Uso: python scripts/make-icon.py src/assets/logo.svg <pasta_saida>
Depois: copiar icon-1024.png para build/icon.png e gerar o .ico (PIL, 16..256). Precisa do Chrome instalado.
Saída: icon.html (fonte), icon-1024.png (render do Chrome headless).
"""
import colorsys
import re
import subprocess
import sys
from pathlib import Path

logo, out = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)

s = logo.read_text(encoding='utf8')
inner = s[s.index('>', s.index('<svg')) + 1 : s.rindex('</svg>')]
inner = re.sub(r'\sfill="[^"]*"', '', inner)  # a cor vem do <use>
vb = re.search(r'viewBox="([^"]+)"', s).group(1)
_, _, VW, VH = map(float, vb.split())


def hsl(h, s_, l):
    r, g, b = colorsys.hls_to_rgb(h / 360, l / 100, s_ / 100)
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


# amarelo padrão = --primary do tema claro (src/index.css). Ícone FLAT: cores chapadas,
# sem degradê, sombra nem relevo (pedido do Ygor em 19/11/2026).
Y = hsl(37.6923, 92.126, 50.1961)
BG = '#1C1814'  # carvão
EDGE = '#3A332B'  # bordinha em volta

S = 1024
M = 40  # margem transparente
R = 220  # raio dos cantos
T = S - 2 * M  # lado do quadrado
BORDER = 14

# o logo.svg tem bastante respiro interno: 0.88 deixa o carcará com ~60% do quadrado
BH = T * 0.88
BW = BH * VW / VH
BX = (S - BW) / 2
BY = (S - BH) / 2

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{S}" height="{S}" viewBox="0 0 {S} {S}">
<defs><symbol id="bird" viewBox="{vb}" preserveAspectRatio="xMidYMid meet">{inner}</symbol></defs>
<rect x="{M + BORDER/2}" y="{M + BORDER/2}" width="{T - BORDER}" height="{T - BORDER}" rx="{R - BORDER/2}"
  fill="{BG}" stroke="{EDGE}" stroke-width="{BORDER}"/>
<use href="#bird" x="{BX:.2f}" y="{BY:.2f}" width="{BW:.2f}" height="{BH:.2f}" fill="{Y}"/>
</svg>'''

html = out / 'icon.html'
html.write_text(
    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}svg{display:block}</style>'
    + svg,
    encoding='utf8',
)
(out / 'icon.svg').write_text(svg, encoding='utf8')

chrome = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
png = out / 'icon-1024.png'
subprocess.run(
    [chrome, '--headless=new', '--disable-gpu', '--hide-scrollbars',
     '--default-background-color=00000000', f'--window-size={S},{S}',
     f'--screenshot={png}', html.as_uri()],
    check=True, capture_output=True, timeout=60,
)
print(png, Y)
