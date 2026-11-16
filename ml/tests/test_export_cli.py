"""The export CLI as Colab runs it (a subprocess, like the notebook's run()), on the smoke run.
Opt-in, slow: python -m pytest tests --runslow   (needs the downloaded backbone).

Prints the subprocess's stdout/stderr tail on failure, so a broken export shows its traceback."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from gymfood.config import load_config

pytestmark = pytest.mark.slow
ML = Path(__file__).resolve().parents[1]


def run(*args: str | Path) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, *map(str, args)], cwd=ML, capture_output=True, text=True, timeout=900)


def tail(p: subprocess.CompletedProcess, n: int = 60) -> str:
    return "\n".join(["--- stdout ---", *p.stdout.splitlines()[-n:], "--- stderr ---", *p.stderr.splitlines()[-n:]])


@pytest.fixture(scope="module")
def smoke(tmp_path_factory) -> Path:
    real = load_config()
    backbone = real.paths.data / "backbones"
    if not (backbone / real.backbone.source / "saved_model.pb").exists():
        pytest.skip("backbone not downloaded")
    root = tmp_path_factory.mktemp("cli")
    (root / "data").mkdir()
    (root / "data" / "backbones").symlink_to(backbone, target_is_directory=True)
    p = run("scripts/smoke.py", "--data-dir", root / "data", "--runs-dir", root / "runs", "--models-dir", root / "models")
    assert p.returncode == 0, tail(p)
    return root


def dirs(root: Path) -> list[str | Path]:
    # smoke.py keeps its prepared data under <data>/smoke
    return ["--data-dir", root / "data" / "smoke", "--runs-dir", root / "runs", "--models-dir", root / "models"]


def test_export_cli_writes_a_checked_model(smoke: Path):
    out = smoke / "models" / "food-classifier-smoke.tflite"
    p = run("scripts/export.py", "--run-id", "smoke", "--out", out, *dirs(smoke))
    assert p.returncode == 0, tail(p)
    info = json.loads(out.with_suffix(".json").read_text())
    assert info["tflite_top1_agreement"] >= 0.98
    if info["mediapipe_check"] == "ok":
        assert info["mediapipe_top1_agreement"] >= 0.98
    assert info["mb"] <= 25


def test_export_cli_keeps_the_model_and_explains_a_failed_check(smoke: Path):
    raw = yaml.safe_load((ML / "config.yaml").read_text())
    raw["export"]["min_top1_agreement"] = 1.01  # impossible: the check must fail
    raw["paths"] = {k: str((ML / v).resolve()) for k, v in raw["paths"].items()}
    cfg = smoke / "strict.yaml"
    cfg.write_text(yaml.safe_dump(raw))
    out = smoke / "models" / "strict.tflite"
    p = run("scripts/export.py", "--config", cfg, "--run-id", "smoke", "--out", out, *dirs(smoke))
    assert p.returncode == 1, tail(p)
    assert "file kept" in p.stderr and "min_top1_agreement" in p.stderr, tail(p)
    assert out.exists() and out.with_suffix(".json").exists()


def test_metadata_without_native_code_matches_the_mediapipe_writer(smoke: Path):
    """Our pure-Python add_metadata gives the same bytes as MetadataWriter.populate()."""
    from gymfood.export import _metadata_shim, add_metadata, mediapipe_unavailable

    if mediapipe_unavailable():
        pytest.skip("MediaPipe native library not loadable here")
    _metadata_shim()
    from mediapipe.tasks.python.metadata.metadata_writers import image_classifier, metadata_writer

    from gymfood.export import build_tflite
    from gymfood.head import load_head

    cfg = load_config()
    head, labels = load_head(smoke / "runs" / "smoke" / "head.npz")
    raw = build_tflite(cfg, head.W, head.b)
    ours = add_metadata(raw, labels, cfg)
    theirs, _json = image_classifier.MetadataWriter.create(
        bytearray(raw), list(cfg.backbone.norm_mean), list(cfg.backbone.norm_std),
        metadata_writer.Labels().add(list(labels))).populate()
    assert ours == bytes(theirs)
