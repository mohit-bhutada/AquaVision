"""Generate SIMULATED preview images for the Home page demos.

Simulated preview: simple classical color correction (red-channel compensation, gray-world
white balance, per-channel auto-levels, gamma lift for dark scenes, mild contrast). This is NOT the AquaVision model. The results are labelled
"Simulated preview" in the UI. Replace them with real model outputs in src/lib/demoImages.ts.

Usage: python3 scripts/make-previews.py   (needs Pillow)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

IMAGES = Path(__file__).resolve().parent.parent / "public" / "images"
SOURCES = [p.stem for p in sorted(IMAGES.glob("gallery-*.webp")) if not p.stem.endswith("-sim")]


def stretch(c: np.ndarray, lo=0.5, hi=99.5) -> np.ndarray:
    a, b = np.percentile(c, [lo, hi])
    return np.clip((c - a) / max(b - a, 1e-3), 0, 1)


def simulate(im: Image.Image) -> Image.Image:
    x = np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0
    r, g, b = x[..., 0], x[..., 1], x[..., 2]
    if r.mean() > 0.85 * max(g.mean(), b.mean()):
        # No blue/green cast: only a gentle levels stretch, no color rebalancing.
        out = Image.fromarray((np.stack([stretch(c, 0.2, 99.8) for c in (r, g, b)], -1) * 255).astype(np.uint8))
        return ImageEnhance.Contrast(out).enhance(1.05)
    # Red-channel compensation (red is absorbed first underwater): borrow from green.
    r = np.clip(r + 2.5 * (g.mean() - r.mean()) * (1 - r) * g, 0, 1)
    if b.mean() < g.mean():
        b = np.clip(b + 1.2 * (g.mean() - b.mean()) * (1 - b) * g, 0, 1)
    x = np.stack([stretch(r), stretch(g), stretch(b)], -1)
    # Gray-world white balance.
    x = np.clip(x * (x.mean() / np.maximum(x.reshape(-1, 3).mean(0), 1e-3)), 0, 1)
    # Lift dark scenes a little.
    lum = float(x.mean())
    if lum < 0.4:
        x = x ** (0.6 + lum)
    out = Image.fromarray((x * 255).astype(np.uint8))
    out = ImageEnhance.Contrast(out).enhance(1.06)
    return ImageEnhance.Color(out).enhance(1.15)


for name in SOURCES:
    src = IMAGES / f"{name}.webp"
    out = IMAGES / f"{name}-sim.webp"
    simulate(Image.open(src)).save(out, "WEBP", quality=80)
    print("wrote", out.name)
