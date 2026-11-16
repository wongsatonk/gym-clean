"""Loads ml/config.yaml into typed sections with absolute paths."""
from __future__ import annotations

from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

import yaml

ML_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ML_DIR / "config.yaml"


@dataclass(frozen=True)
class Paths:
    class_map: Path
    dishes: Path
    data: Path
    runs: Path
    models: Path


@dataclass(frozen=True)
class Backbone:
    name: str
    source: str
    image_size: int
    norm_mean: list[float]
    norm_std: list[float]
    embed_dim: int
    batch_size: int
    augment_copies: int


@dataclass(frozen=True)
class Split:
    val_pct: int
    test_pct: int
    personal_holdout_min: int
    personal_holdout_frac: float
    personal_val_pct: int
    seed: str


@dataclass(frozen=True)
class Head:
    epochs: int
    batch_size: int
    learning_rate: float
    l2: float
    label_smoothing: float
    patience: int
    seed: int


@dataclass(frozen=True)
class Export:
    quantization: str
    max_mb: float
    verify_images: int
    min_top1_agreement: float


@dataclass(frozen=True)
class Report:
    confused_pairs: int
    min_class_images: int


@dataclass(frozen=True)
class Config:
    paths: Paths
    backbone: Backbone
    split: Split
    head: Head
    export: Export
    report: Report


def _section(cls: type, raw: dict[str, Any], name: str) -> Any:
    data = raw.get(name)
    if not isinstance(data, dict):
        raise ValueError(f"config: missing section '{name}'")
    names = {f.name for f in fields(cls)}
    missing = names - data.keys()
    if missing:
        raise ValueError(f"config: {name} is missing {sorted(missing)}")
    return cls(**{k: data[k] for k in names})


def _abs(p: str | Path) -> Path:
    p = Path(p).expanduser()
    return (p if p.is_absolute() else ML_DIR / p).resolve()


def load_config(
    path: str | Path | None = None,
    *,
    data_dir: str | Path | None = None,
    runs_dir: str | Path | None = None,
    models_dir: str | Path | None = None,
) -> Config:
    """Reads the YAML; relative paths resolve against ml/. The *_dir arguments override paths."""
    raw = yaml.safe_load(Path(path or DEFAULT_CONFIG).read_text())
    if not isinstance(raw, dict):
        raise ValueError("config: not a mapping")
    p = dict(raw.get("paths") or {})
    for key, override in (("data", data_dir), ("runs", runs_dir), ("models", models_dir)):
        if override is not None:
            p[key] = str(override)
    paths = _section(Paths, {"paths": {k: _abs(v) for k, v in p.items()}}, "paths")
    cfg = Config(
        paths=paths,
        backbone=_section(Backbone, raw, "backbone"),
        split=_section(Split, raw, "split"),
        head=_section(Head, raw, "head"),
        export=_section(Export, raw, "export"),
        report=_section(Report, raw, "report"),
    )
    if cfg.split.val_pct + cfg.split.test_pct >= 100:
        raise ValueError("config: val_pct + test_pct must be < 100")
    if cfg.split.personal_holdout_min < 100:
        raise ValueError("config: personal_holdout_min must be >= 100 (SPEC)")
    if cfg.export.quantization not in ("float16", "int8", "none"):
        raise ValueError("config: export.quantization must be float16, int8 or none")
    return cfg
