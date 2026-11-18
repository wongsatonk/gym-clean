"""The 2-class smoke run on generated images (no real data)."""
from __future__ import annotations

import dataclasses
import shutil

import numpy as np
from PIL import Image

from .config import Config
from .pipeline import run_evaluate, run_export, run_prepare, run_train

SMOKE_LABELS = ("pad_thai", "tom_yum_goong")  # real classMap labels
SMOKE_COLOURS = ((222, 160, 70), (190, 50, 35))


def make_images(root, n_per_class: int = 24, seed: int = 0) -> None:
    """Made-up 'dishes': noisy blobs in two colour families on a plate-white background."""
    rng = np.random.default_rng(seed)
    for label, colour in zip(SMOKE_LABELS, SMOKE_COLOURS):
        d = root / "smoke" / label
        d.mkdir(parents=True, exist_ok=True)
        for i in range(n_per_class):
            h, w = int(rng.integers(180, 320)), int(rng.integers(180, 320))
            img = np.full((h, w, 3), 235, np.float32)
            yy, xx = np.mgrid[0:h, 0:w]
            r = min(h, w) * rng.uniform(0.3, 0.45)
            mask = (yy - h / 2) ** 2 + (xx - w / 2) ** 2 < r * r
            img[mask] = np.array(colour) + rng.normal(0, 25, (mask.sum(), 3))
            Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(d / f"{i:03d}.jpg", quality=90)


def run_smoke(cfg: Config, log=print) -> dict:
    data = cfg.paths.data / "smoke"
    if data.exists():
        shutil.rmtree(data)
    # The smoke run keeps its own data dir but shares the downloaded backbone.
    backbone = cfg.paths.data / "backbones"
    data.mkdir(parents=True)
    (data / "backbones").symlink_to(backbone, target_is_directory=True)
    paths = dataclasses.replace(cfg.paths, data=data, runs=cfg.paths.runs)
    sc = dataclasses.replace(cfg, paths=paths, backbone=dataclasses.replace(cfg.backbone, augment_copies=0),
                             split=dataclasses.replace(cfg.split, val_pct=20, test_pct=20),
                             # 1 epoch, but small batches so the head moves away from 50/50.
                             head=dataclasses.replace(cfg.head, batch_size=4, learning_rate=0.01))
    make_images(data / "raw")
    run_prepare(sc, zips=[], log=log)
    run_train(sc, "smoke", max_epochs=1, log=log)
    run_evaluate(sc, "smoke", log=log)
    return run_export(sc, "smoke", cfg.paths.models / "smoke.tflite", log=log)
