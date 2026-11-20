# Junta os quadros de docs/assets/demo-frames (gravados por e2e/demo.spec.ts) em docs/assets/demo.gif
# e salva o 1º e o último quadro como capturas para o site (site/assets).
from pathlib import Path
from PIL import Image

raiz = Path(__file__).resolve().parents[1]
frames = sorted((raiz / 'docs' / 'assets' / 'demo-frames').glob('*.png'))
W = 960
imgs = [Image.open(f).convert('RGB').resize((W, round(W * 900 / 1440)), Image.LANCZOS) for f in frames]
# tempo de cada quadro (ms): os da reprodução passam mais rápido; o último fica parado
dur = [1600, 1100, 1400, 600, 600, 600, 600, 1100, 1400, 2600][: len(imgs)]
pal = [im.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for im in imgs]
out = raiz / 'docs' / 'assets' / 'demo.gif'
pal[0].save(out, save_all=True, append_images=pal[1:], duration=dur, loop=0, optimize=True)
site = raiz / 'site' / 'assets'
site.mkdir(parents=True, exist_ok=True)
for nome, f in (('editor.png', frames[-1]), ('duplicar.png', frames[2])):
    Image.open(f).convert('RGB').resize((1440, 900)).save(site / nome.replace('.png', '.webp'), 'WEBP', quality=82)
print(out, round(out.stat().st_size / 1e6, 2), 'MB')
