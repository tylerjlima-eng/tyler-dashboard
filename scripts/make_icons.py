#!/usr/bin/env python3
"""Generates PWA icons into icons/ (run by the workflow; needs Pillow)."""
import os
from PIL import Image, ImageDraw
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons"); os.makedirs(OUT, exist_ok=True)
def icon(n, mask=False):
    im = Image.new("RGB", (n, n), "#0f172a"); d = ImageDraw.Draw(im); s = n / 512; pad = 0.12 if mask else 0
    f = lambda v: (pad * 512 + v * (1 - 2 * pad)) * s
    d.rounded_rectangle([f(150), f(90), f(330), f(370)], radius=22 * s, fill="#38bdf8")
    d.rounded_rectangle([f(190), f(130), f(370), f(410)], radius=22 * s, fill="#f59e0b", outline="#0f172a", width=int(8 * s))
    d.line([(f(x), f(y)) for x, y in [(215, 350), (260, 300), (295, 325), (345, 240)]], fill="#0f172a", width=int(20 * s * (1 - 2 * pad)), joint="curve")
    return im
for n in (192, 512):
    icon(n).save(f"{OUT}/icon-{n}.png"); icon(n, True).save(f"{OUT}/maskable-{n}.png")
icon(180).save(f"{OUT}/apple-touch-icon.png")
