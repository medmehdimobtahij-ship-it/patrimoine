"""Icône de l'app, version sobre : carré presque noir, trois barres blanches montantes.
python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)
BG = (17, 18, 24)
FG = (255, 255, 255)


def draw(size: int, maskable: bool) -> Image.Image:
    s = 4  # suréchantillonnage pour des bords nets
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, W, W], fill=BG)
        box = W * 0.40  # zone de sécurité Android
    else:
        d.rounded_rectangle([0, 0, W - 1, W - 1], radius=W * 0.225, fill=BG)
        box = W * 0.50
    x0 = (W - box) / 2
    y1 = (W + box) / 2
    bar_w = box * 0.22
    gap = (box - 3 * bar_w) / 2
    heights = [0.42, 0.68, 1.0]
    for i, h in enumerate(heights):
        bx = x0 + i * (bar_w + gap)
        d.rounded_rectangle([bx, y1 - box * h, bx + bar_w, y1], radius=bar_w / 2, fill=FG)
    return img.resize((size, size), Image.LANCZOS)


draw(192, False).save(OUT / "icon-192.png")
draw(512, False).save(OUT / "icon-512.png")
draw(512, True).save(OUT / "icon-maskable-512.png")
print("icônes générées")
