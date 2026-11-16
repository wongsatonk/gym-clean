"""The frozen EfficientNet-Lite0 feature extractor (TensorFlow SavedModel from download.py) and
cached, resumable embedding of image lists."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Callable

import numpy as np

from .config import Config
from .images import augment, load_image

CHUNK = 512


def backbone_dir(cfg: Config) -> Path:
    return cfg.paths.data / "backbones" / cfg.backbone.source


def load_backbone(cfg: Config):
    """Returns (saved_model, signature). Raises with the download command if it's missing."""
    import tensorflow as tf

    d = backbone_dir(cfg)
    if not (d / "saved_model.pb").exists():
        raise FileNotFoundError(f"backbone not found in {d}: run `python scripts/download.py {cfg.backbone.source}`")
    model = tf.saved_model.load(str(d), tags=[])
    return model, model.signatures["default"]


def make_embedder(cfg: Config) -> Callable[[np.ndarray], np.ndarray]:
    """uint8 NHWC batch -> float32 (N, embed_dim)."""
    import tensorflow as tf

    model, sig = load_backbone(cfg)
    mean = np.float32(cfg.backbone.norm_mean[0])
    std = np.float32(cfg.backbone.norm_std[0])

    def embed(batch: np.ndarray) -> np.ndarray:
        _ = model  # keep the SavedModel (and its variables) alive with the signature
        x = (batch.astype(np.float32) - mean) / std
        return sig(images=tf.constant(x))["default"].numpy()

    return embed


def embed_paths(
    paths: list[str],
    cfg: Config,
    cache_dir: Path,
    embed: Callable[[np.ndarray], np.ndarray],
    *,
    augment_seed: int | None = None,
    log=None,
) -> tuple[np.ndarray, np.ndarray]:
    """Embeds images in chunks cached under cache_dir (a re-run skips finished chunks, so a
    disconnect only loses the current chunk). Returns (embeddings, ok mask); unreadable images
    get a zero row and ok=False."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(("\n".join(paths) + f"|{augment_seed}|{cfg.backbone.name}").encode()).hexdigest()[:16]
    size, bs = cfg.backbone.image_size, cfg.backbone.batch_size
    embs, oks = [], []
    for c0 in range(0, len(paths), CHUNK):
        f = cache_dir / f"{key}_{c0 // CHUNK:05d}.npz"
        if f.exists():
            with np.load(f) as z:
                embs.append(z["emb"])
                oks.append(z["ok"])
            continue
        chunk = paths[c0 : c0 + CHUNK]
        out = np.zeros((len(chunk), cfg.backbone.embed_dim), np.float32)
        ok = np.zeros(len(chunk), bool)
        for b0 in range(0, len(chunk), bs):
            imgs, idx = [], []
            for i, p in enumerate(chunk[b0 : b0 + bs], start=b0):
                try:
                    if augment_seed is None:
                        imgs.append(load_image(p, size))
                    else:
                        seed = int.from_bytes(hashlib.sha256(f"{augment_seed}:{p}".encode()).digest()[:8], "big")
                        imgs.append(augment(p, size, np.random.default_rng(seed)))
                    idx.append(i)
                except Exception as e:  # noqa: BLE001 - a broken file must not stop a long run
                    if log:
                        log(f"skip unreadable image {p}: {e}")
            if imgs:
                out[idx] = embed(np.stack(imgs))
                ok[idx] = True
        tmp = f.with_name(f.stem + ".tmp.npz")
        np.savez(tmp, emb=out, ok=ok)
        tmp.replace(f)
        embs.append(out)
        oks.append(ok)
        if log:
            log(f"embedded {min(c0 + CHUNK, len(paths))}/{len(paths)}")
    if not embs:
        return np.zeros((0, cfg.backbone.embed_dim), np.float32), np.zeros(0, bool)
    return np.concatenate(embs), np.concatenate(oks)
