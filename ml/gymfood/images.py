"""Image loading and light augmentation (Pillow + numpy; no TensorFlow)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def load_image(path: str | Path, size: int) -> np.ndarray:
    """RGB uint8 (size, size, 3). EXIF rotation applied; stretched to a square like MediaPipe's
    image classifier preprocessing (no crop)."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        return np.asarray(im.resize((size, size), Image.BILINEAR), dtype=np.uint8)


def augment(path: str | Path, size: int, rng: np.random.Generator) -> np.ndarray:
    """A random crop (70–100% of each side), maybe a horizontal flip, ±15% brightness."""
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        w, h = im.size
        cw, ch = int(w * rng.uniform(0.7, 1.0)), int(h * rng.uniform(0.7, 1.0))
        x, y = int(rng.integers(0, w - cw + 1)), int(rng.integers(0, h - ch + 1))
        im = im.crop((x, y, x + cw, y + ch)).resize((size, size), Image.BILINEAR)
        if rng.random() < 0.5:
            im = ImageOps.mirror(im)
        arr = np.asarray(im, dtype=np.float32) * rng.uniform(0.85, 1.15)
        return np.clip(arr, 0, 255).astype(np.uint8)
