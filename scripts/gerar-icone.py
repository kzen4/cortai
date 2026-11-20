# Gera resources/icons/icon.ico e icon.png a partir do logo (src/renderer/app/Logo.tsx: viewBox 64x64).
# Rodar só quando o logo mudar:  python scripts/gerar-icone.py
from pathlib import Path
from PIL import Image, ImageDraw

S = 1024; k = S / 64
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([k, k, S - k, S - k], radius=16 * k, fill='#15151C', outline='#2A2A36', width=int(2 * k))
d.polygon([(24 * k, 17 * k), (48 * k, 32 * k), (24 * k, 47 * k)], fill='#C6F432')
w = int(6 * k); r = w // 2
d.line([(17 * k, 46 * k), (47 * k, 18 * k)], fill='#8B5CF6', width=w)
for x, y in [(17, 46), (47, 18)]:
    d.ellipse([x * k - r, y * k - r, x * k + r, y * k + r], fill='#8B5CF6')
out = Path(__file__).resolve().parents[1] / 'resources' / 'icons'
out.mkdir(parents=True, exist_ok=True)
big = img.resize((512, 512), Image.LANCZOS)
big.save(out / 'icon.png')
big.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('ok', out)
