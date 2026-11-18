"""Builds the training manifest: public dataset images + his exported photos → labels and splits.

- raw/<dataset>/<SourceClass>/**/<image>: mapped to our labels through classMap `datasets`
  (or identity when the folder is already one of our labels); unmapped classes are dropped and
  counted in the report.
- Photo export zips: dishId (labels.csv) → label through classMap; images are copied to
  data/personal/<sha256>.jpg. At least `personal_holdout_min` are held out as `personal_test`
  and never trained on; a held-out image is also removed from every other split.
- Exact duplicate files (same sha256) are kept once."""
from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from pathlib import Path

from .classmap import ClassMap
from .config import Config
from .personal import read_photo_zip
from .split import file_hash, personal_splits, public_split

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp"}
FIELDS = ["path", "label", "split", "source", "sha256"]
TRAIN_SPLITS = ("train", "personal_train")
VAL_SPLITS = ("val", "personal_val")


@dataclass(frozen=True)
class Row:
    path: str
    label: str
    split: str
    source: str
    sha256: str


@dataclass
class PrepareResult:
    rows: list[Row]
    report: dict = field(default_factory=dict)

    def write(self, out_dir: Path) -> Path:
        out_dir.mkdir(parents=True, exist_ok=True)
        manifest = out_dir / "manifest.csv"
        with manifest.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=FIELDS)
            w.writeheader()
            for r in self.rows:
                w.writerow(asdict(r))
        (out_dir / "prepare_report.json").write_text(json.dumps(self.report, indent=2, sort_keys=True))
        return manifest


def read_manifest(path: Path) -> list[Row]:
    with Path(path).open(newline="") as f:
        return [Row(**{k: r[k] for k in FIELDS}) for r in csv.DictReader(f)]


def scan_raw(raw_dir: Path) -> list[tuple[str, str, Path]]:
    """(dataset, source class, path) for every image under raw/<dataset>/<class>/ (recursive)."""
    items: list[tuple[str, str, Path]] = []
    if not raw_dir.is_dir():
        return items
    for ds in sorted(p for p in raw_dir.iterdir() if p.is_dir() and not p.name.startswith(".")):
        for cls in sorted(p for p in ds.iterdir() if p.is_dir() and not p.name.startswith(".")):
            for img in sorted(cls.rglob("*")):
                if img.is_file() and img.suffix.lower() in IMAGE_EXT and not img.name.startswith("."):
                    items.append((ds.name, cls.name, img))
    return items


def prepare_dataset(cfg: Config, cm: ClassMap, *, raw_dir: Path, zips: list[Path]) -> PrepareResult:
    report: dict = {"warnings": [], "unmapped_classes": {}, "unmapped_dishes": {}, "duplicates_dropped": 0}
    unmapped: dict[str, Counter] = defaultdict(Counter)
    seen: set[str] = set()
    rows: list[Row] = []

    # Personal photos first, so their holdout is known before public rows are added.
    personal_dir = cfg.paths.data / "personal"
    personal: list[tuple[str, str, Path]] = []  # (sha, label, path)
    personal_seen: set[str] = set()
    unmapped_dishes: Counter = Counter()
    zip_problems: list[str] = []
    for zp in zips:
        pz = read_photo_zip(zp)
        zip_problems += [f"{Path(zp).name}: {p}" for p in pz.problems]
        for ph in pz.photos:
            label = cm.label_for_dish(ph.dish_id)
            if label is None:
                unmapped_dishes[ph.dish_id] += 1
                continue
            sha = file_hash(ph.data)
            if sha in personal_seen:
                report["duplicates_dropped"] += 1
                continue
            personal_seen.add(sha)
            personal_dir.mkdir(parents=True, exist_ok=True)
            dest = personal_dir / f"{sha}.jpg"
            if not dest.exists():
                dest.write_bytes(ph.data)
            personal.append((sha, label, dest))
    splits, warns = personal_splits([s for s, _, _ in personal], cfg.split)
    report["warnings"] += warns
    held_out = {s for s, sp in splits.items() if sp == "personal_test"}

    for sha, label, path in personal:
        rows.append(Row(str(path), label, splits[sha], "personal", sha))
        seen.add(sha)

    for dataset, cls, path in scan_raw(raw_dir):
        label = cm.label_for_source(dataset, cls)
        if label is None:
            unmapped[dataset][cls] += 1
            continue
        sha = file_hash(path.read_bytes())
        if sha in seen:
            report["duplicates_dropped"] += 1
            continue
        seen.add(sha)
        rows.append(Row(str(path), label, public_split(sha, cfg.split), dataset, sha))

    # Belt and braces: nothing held out may appear in any other split.
    leaked = [r for r in rows if r.sha256 in held_out and r.split != "personal_test"]
    if leaked:
        raise AssertionError(f"holdout leak: {len(leaked)} rows")

    report["unmapped_classes"] = {d: dict(sorted(c.items())) for d, c in sorted(unmapped.items())}
    report["unmapped_dishes"] = dict(sorted(unmapped_dishes.items()))
    report["zip_problems"] = zip_problems
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for r in rows:
        counts[r.label][r.split] += 1
    report["counts"] = {lbl: dict(sorted(c.items())) for lbl, c in sorted(counts.items())}
    report["personal"] = {
        "total": len(personal),
        "held_out": len(held_out),
        "train": sum(1 for v in splits.values() if v == "personal_train"),
        "val": sum(1 for v in splits.values() if v == "personal_val"),
    }
    missing = [lbl for lbl in cm.labels if not any(counts[lbl].get(s) for s in TRAIN_SPLITS)]
    if missing:
        report["warnings"].append(f"labels with no training images (left out of the model): {missing}")
    thin = [lbl for lbl in cm.labels if 0 < sum(counts[lbl].get(s, 0) for s in TRAIN_SPLITS) < cfg.report.min_class_images]
    if thin:
        report["warnings"].append(f"labels with < {cfg.report.min_class_images} training images: {thin}")
    return PrepareResult(rows=rows, report=report)
