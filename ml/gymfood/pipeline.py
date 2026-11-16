"""prepare -> train -> evaluate -> export, shared by the CLI scripts, the smoke run and Colab."""
from __future__ import annotations

import json
import platform
import time
from pathlib import Path

import numpy as np

from .classmap import load_class_map, load_dish_names
from .config import Config
from .head import load_head, predict_proba, save_head, train_head
from .metrics import evaluate, report_markdown
from .prepare import TRAIN_SPLITS, VAL_SPLITS, Row, prepare_dataset, read_manifest

EVAL_SPLITS = ("val", "test", "personal_test")


def manifest_path(cfg: Config) -> Path:
    return cfg.paths.data / "prepared" / "manifest.csv"


def run_dir(cfg: Config, run_id: str) -> Path:
    return cfg.paths.runs / run_id


def run_prepare(cfg: Config, *, raw_dir: Path | None = None, zips: list[Path] | None = None, log=print) -> dict:
    cm = load_class_map(cfg.paths.class_map)
    if zips is None:
        zdir = cfg.paths.data / "personal_zips"
        zips = sorted(zdir.glob("*.zip")) if zdir.is_dir() else []
    res = prepare_dataset(cfg, cm, raw_dir=raw_dir or cfg.paths.data / "raw", zips=zips)
    out = res.write(cfg.paths.data / "prepared")
    splits: dict[str, int] = {}
    for r in res.rows:
        splits[r.split] = splits.get(r.split, 0) + 1
    log(f"manifest: {out} ({len(res.rows)} images) {dict(sorted(splits.items()))}")
    log(f"personal photos: {res.report['personal']}")
    for d, classes in res.report["unmapped_classes"].items():
        log(f"dropped {sum(classes.values())} images in {len(classes)} {d} classes with no dish: {sorted(classes)}")
    if res.report["unmapped_dishes"]:
        log(f"dropped personal photos of dishes the camera doesn't know yet: {res.report['unmapped_dishes']}")
    for w in res.report["warnings"] + res.report.get("zip_problems", []):
        log(f"warning: {w}")
    return res.report


class LazyEmbed:
    """Loads TensorFlow and the backbone only when a cache miss needs it."""

    def __init__(self, cfg: Config):
        self.cfg, self.fn = cfg, None

    def __call__(self, batch: np.ndarray) -> np.ndarray:
        if self.fn is None:
            from .backbone import make_embedder

            self.fn = make_embedder(self.cfg)
        return self.fn(batch)


def _embed_rows(cfg: Config, rows: list[Row], embed, *, augment_seed=None, log=None):
    from .backbone import embed_paths

    return embed_paths([r.path for r in rows], cfg, cfg.paths.data / "cache" / "emb", embed,
                       augment_seed=augment_seed, log=log)


def _model_labels(cfg: Config, rows: list[Row]) -> list[str]:
    cm = load_class_map(cfg.paths.class_map)
    trained = {r.label for r in rows if r.split in TRAIN_SPLITS}
    labels = [lbl for lbl in cm.labels if lbl in trained]
    if len(labels) < 2:
        raise ValueError(f"need training images for at least 2 labels, have {labels}")
    return labels


def run_train(cfg: Config, run_id: str, *, max_epochs: int | None = None, log=print) -> dict:
    t0 = time.time()
    rows = read_manifest(manifest_path(cfg))
    labels = _model_labels(cfg, rows)
    index = {lbl: i for i, lbl in enumerate(labels)}
    rd = run_dir(cfg, run_id)
    rd.mkdir(parents=True, exist_ok=True)
    embed = LazyEmbed(cfg)

    train_rows = [r for r in rows if r.split in TRAIN_SPLITS and r.label in index]
    val_rows = [r for r in rows if r.split in VAL_SPLITS and r.label in index]
    Xs, ys = [], []
    for copy in range(cfg.backbone.augment_copies + 1):
        log(f"embedding train images (copy {copy}: {'original' if copy == 0 else 'augmented'})")
        X, ok = _embed_rows(cfg, train_rows, embed, augment_seed=None if copy == 0 else copy, log=log)
        Xs.append(X[ok])
        ys.append(np.array([index[r.label] for r in train_rows])[ok])
    X, y = np.concatenate(Xs), np.concatenate(ys)
    log("embedding val images")
    Xv, okv = _embed_rows(cfg, val_rows, embed, log=log)
    yv = np.array([index[r.label] for r in val_rows], dtype=int)[okv]
    Xv = Xv[okv]
    t_embed = time.time() - t0
    log(f"training head on {len(X)} embeddings ({len(labels)} classes), val {len(Xv)}")
    state = train_head(X, y, Xv, yv, n_classes=len(labels), hp=cfg.head, max_epochs=max_epochs,
                       checkpoint=rd / "head_ckpt.npz", log=log)
    save_head(rd / "head.npz", state, labels=labels)
    info = {
        "run_id": run_id,
        "labels": labels,
        "train_embeddings": int(len(X)),
        "train_images": len(train_rows),
        "val_images": int(len(Xv)),
        "epochs": state.epoch,
        "best_val_top1": state.best_acc,
        "seconds_embed": round(t_embed, 1),
        "seconds_total": round(time.time() - t0, 1),
        "machine": f"{platform.system()} {platform.machine()} python {platform.python_version()}",
        "backbone": cfg.backbone.name,
    }
    (rd / "run.json").write_text(json.dumps(info, indent=2))
    log(f"trained: {info}")
    return info


def run_evaluate(cfg: Config, run_id: str, *, log=print) -> dict:
    rd = run_dir(cfg, run_id)
    head, labels = load_head(rd / "head.npz")
    index = {lbl: i for i, lbl in enumerate(labels)}
    rows = read_manifest(manifest_path(cfg))
    embed = LazyEmbed(cfg)
    results: dict[str, dict] = {}
    for split in EVAL_SPLITS:
        sr = [r for r in rows if r.split == split and r.label in index]
        if not sr:
            continue
        X, ok = _embed_rows(cfg, sr, embed, log=log)
        y = np.array([index[r.label] for r in sr])[ok]
        results[split] = evaluate(predict_proba(X[ok], head.W, head.b), y, labels,
                                  top_pairs=cfg.report.confused_pairs)
    not_in_model = sorted({r.label for r in rows if r.split in EVAL_SPLITS and r.label not in index})
    cm = load_class_map(cfg.paths.class_map)
    names = load_dish_names(cfg.paths.dishes)
    dish_names = {lbl: names.get(cm.default_dish(lbl) or "", lbl) for lbl in labels}
    run_info = json.loads((rd / "run.json").read_text()) if (rd / "run.json").exists() else {}
    meta = {"run": run_id, "classes": len(labels), "train images": run_info.get("train_images"),
            "training time (s)": run_info.get("seconds_total"), "machine": run_info.get("machine")}
    if not_in_model:
        meta["test labels with no training images (not scored)"] = ", ".join(not_in_model)
    md = report_markdown(results, labels=labels, dish_names=dish_names, meta=meta)
    (rd / "report.md").write_text(md)
    (rd / "metrics.json").write_text(json.dumps(results, indent=2))
    for split, r in results.items():
        t1 = "n/a" if r["top1"] is None else f"{100 * r['top1']:.1f}%"
        t3 = "n/a" if r["top3"] is None else f"{100 * r['top3']:.1f}%"
        log(f"{split}: {r['n']} images, top-1 {t1}, top-3 {t3}")
    log(f"report: {rd / 'report.md'}")
    return results


def run_export(cfg: Config, run_id: str, out: Path, *, log=print) -> dict:
    from .backbone import make_embedder
    from .export import add_metadata, build_tflite, mediapipe_classify
    from .images import load_image

    rd = run_dir(cfg, run_id)
    head, labels = load_head(rd / "head.npz")
    rows = read_manifest(manifest_path(cfg))
    pool = [r for s in ("personal_test", "test", "val", "train") for r in rows if r.split == s and r.label in labels]
    picks = pool[: cfg.export.verify_images]
    size = cfg.backbone.image_size
    reps = np.stack([load_image(r.path, size) for r in picks]) if picks else None
    tfl = add_metadata(build_tflite(cfg, head.W, head.b, representative=reps), labels, cfg)
    mb = len(tfl) / 1e6
    if mb > cfg.export.max_mb:
        raise ValueError(f"model is {mb:.1f} MB, above the {cfg.export.max_mb} MB limit")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(tfl)
    # Load check: MediaPipe Python (same task as the app) on the original images vs the trained head.
    from PIL import Image, ImageOps

    originals = []
    for r in picks:
        with Image.open(r.path) as im:
            originals.append(np.asarray(ImageOps.exif_transpose(im).convert("RGB")))
    mp_labels, mp_results, ms = mediapipe_classify(tfl, originals)
    if set(mp_labels) - set(labels) or (picks and len(set(mp_labels)) < min(2, len(labels))):
        raise ValueError(f"MediaPipe labels {mp_labels} don't match the model labels {labels}")
    expected = predict_proba(make_embedder(cfg)(reps), head.W, head.b).argmax(1) if picks else np.array([])
    agree = sum(1 for res, e in zip(mp_results, expected) if res and res[0][0] == labels[int(e)])
    agreement = agree / len(picks) if picks else 1.0
    info = {"model": str(out), "run_id": run_id, "bytes": len(tfl), "mb": round(mb, 2), "labels": labels,
            "quantization": cfg.export.quantization, "verify_images": len(picks),
            "mediapipe_top1_agreement": agreement, "mediapipe_python_cpu_ms_per_image": round(ms, 1),
            "machine": f"{platform.system()} {platform.machine()}"}
    out.with_suffix(".json").write_text(json.dumps(info, indent=2))
    log(f"exported {out} ({mb:.2f} MB, {len(labels)} labels); MediaPipe Python top-1 agreement "
        f"{agree}/{len(picks)}, {ms:.0f} ms/image on this CPU")
    if agreement < cfg.export.min_top1_agreement:
        raise ValueError(f"MediaPipe top-1 agreement {agreement:.2f} < {cfg.export.min_top1_agreement}")
    return info
