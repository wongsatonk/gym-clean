"""Task 6 (pure parts): top-1 / top-3 / per-class / confused pairs, and the softmax head trained on
cached embeddings (numpy only, so these run without TensorFlow)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from gymfood.config import load_config
from gymfood.head import HeadState, load_head, predict_proba, save_head, train_head
from gymfood.metrics import evaluate, report_markdown

LABELS = ["a", "b", "c", "d"]


def onehot_probs(preds: list[list[int]], n: int = 4) -> np.ndarray:
    """Rows where preds[i] is the ranking (best first)."""
    out = np.zeros((len(preds), n), np.float32)
    for i, rank in enumerate(preds):
        for j, c in enumerate(rank):
            out[i, c] = 1.0 - 0.1 * j
    return out


def test_top1_top3_per_class_and_confused_pairs():
    y = np.array([0, 0, 1, 1, 2, 3])
    probs = onehot_probs([[0, 1, 2], [1, 0, 2], [0, 1, 2], [1, 2, 3], [3, 0, 1], [2, 3, 0]])
    r = evaluate(probs, y, LABELS, top_pairs=10)
    assert r["n"] == 6
    assert r["top1"] == pytest.approx(2 / 6)
    # Top-3 misses only sample 4 (true c, ranking d, a, b).
    assert r["top3"] == pytest.approx(5 / 6)
    assert r["per_class"]["a"] == {"n": 2, "top1": 0.5, "top3": 1.0}
    assert r["per_class"]["c"] == {"n": 1, "top1": 0.0, "top3": 0.0}
    # a<->b confused twice (a→b once, b→a once); c<->d twice.
    pairs = {(p["a"], p["b"]): p["count"] for p in r["confused"]}
    assert pairs == {("a", "b"): 2, ("c", "d"): 2}
    assert r["confused"][0]["count"] == 2


def test_evaluate_handles_fewer_than_3_classes_and_empty():
    r = evaluate(np.array([[0.9, 0.1], [0.2, 0.8]]), np.array([0, 0]), ["x", "y"], top_pairs=3)
    assert r["top3"] == 1.0 and r["top1"] == 0.5
    e = evaluate(np.zeros((0, 2)), np.zeros((0,), int), ["x", "y"], top_pairs=3)
    assert e["n"] == 0 and e["top1"] is None


def test_report_markdown_has_the_numbers_and_dish_names():
    y = np.array([0, 1])
    r = evaluate(onehot_probs([[0, 1, 2], [0, 1, 2]]), y, LABELS, top_pairs=5)
    md = report_markdown({"test": r}, labels=LABELS, dish_names={"a": "Pad thai"}, meta={"run": "x"})
    assert "Top-1" in md and "Top-3" in md and "50.0%" in md
    assert "Pad thai" in md
    assert "| a |" in md or "a (Pad thai)" in md


def _blobs(n_per: int, k: int, d: int = 16, seed: int = 0):
    """Gaussian blobs around fixed centres (the same for every seed); seed changes the samples."""
    centers = np.random.default_rng(99).normal(0, 3, (k, d))
    rng = np.random.default_rng(seed)
    X = np.concatenate([centers[i] + rng.normal(0, 1, (n_per, d)) for i in range(k)]).astype(np.float32)
    y = np.repeat(np.arange(k), n_per)
    return X, y


def test_head_learns_separable_embeddings_and_is_deterministic():
    hp = load_config().head
    X, y = _blobs(40, 3)
    Xv, yv = _blobs(10, 3, seed=1)
    s1 = train_head(X, y, Xv, yv, n_classes=3, hp=hp)
    s2 = train_head(X, y, Xv, yv, n_classes=3, hp=hp)
    p = predict_proba(Xv, s1.W, s1.b)
    assert p.shape == (30, 3)
    np.testing.assert_allclose(p.sum(1), 1, rtol=1e-5)
    assert (p.argmax(1) == yv).mean() > 0.9
    np.testing.assert_array_equal(s1.W, s2.W)


def test_head_checkpoint_resume_matches_an_uninterrupted_run(tmp_path: Path):
    hp = load_config().head
    X, y = _blobs(30, 2)
    Xv, yv = _blobs(10, 2, seed=1)
    ckpt = tmp_path / "head_ckpt.npz"
    full = train_head(X, y, Xv, yv, n_classes=2, hp=hp, max_epochs=6)
    part = train_head(X, y, Xv, yv, n_classes=2, hp=hp, max_epochs=3, checkpoint=ckpt)
    assert part.epoch == 3 and ckpt.exists()
    resumed = train_head(X, y, Xv, yv, n_classes=2, hp=hp, max_epochs=6, checkpoint=ckpt)
    assert resumed.epoch == 6
    np.testing.assert_allclose(resumed.W, full.W, rtol=1e-5, atol=1e-6)


def test_head_save_load_round_trip(tmp_path: Path):
    s = HeadState.init(4, 3, seed=1)
    save_head(tmp_path / "h.npz", s, labels=["a", "b", "c"])
    back, labels = load_head(tmp_path / "h.npz")
    np.testing.assert_array_equal(back.W, s.W)
    assert labels == ["a", "b", "c"]
