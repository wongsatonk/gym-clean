"""Task 6 smoke (opt-in, slow): the whole pipeline on 2 made-up classes named with real classMap
labels, 1 epoch, CPU -> a .tflite that MediaPipe Python loads with the right labels.

  python -m pytest tests --runslow      (needs `python scripts/download.py efficientnet_lite0`)"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from gymfood.classmap import load_class_map
from gymfood.config import load_config

pytestmark = pytest.mark.slow


def test_smoke_pipeline_exports_a_mediapipe_model(tmp_path: Path):
    real = load_config()
    backbone = real.paths.data / "backbones"
    if not (backbone / real.backbone.source / "saved_model.pb").exists():
        pytest.skip("backbone not downloaded")
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "backbones").symlink_to(backbone, target_is_directory=True)
    cfg = load_config(data_dir=tmp_path / "data", runs_dir=tmp_path / "runs", models_dir=tmp_path / "models")

    from gymfood.export import mediapipe_classify
    from gymfood.smoke import SMOKE_LABELS, run_smoke

    info = run_smoke(cfg, log=lambda *_: None)
    model = Path(info["model"])
    assert model == tmp_path / "models" / "smoke.tflite"
    assert info["mb"] <= 25
    assert info["labels"] == list(SMOKE_LABELS)
    assert set(SMOKE_LABELS) <= set(load_class_map(cfg.paths.class_map).labels)
    assert info["mediapipe_top1_agreement"] >= 0.9
    assert json.loads(model.with_suffix(".json").read_text())["labels"] == list(SMOKE_LABELS)

    labels, results, _ms = mediapipe_classify(model.read_bytes(), [np.full((300, 200, 3), 200, np.uint8)])
    assert labels == sorted(SMOKE_LABELS)
    assert sum(s for _, s in results[0]) == pytest.approx(1.0, abs=1e-3)
    report = (tmp_path / "runs" / "smoke" / "report.md").read_text()
    assert "Top-3" in report
