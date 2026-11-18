"""Softmax classifier head trained on cached backbone embeddings (numpy, CPU-fast).

The backbone stays frozen, so each image is embedded once and every epoch is a matrix multiply:
minutes on a Mac CPU for ~15k images. Training resumes from a checkpoint (Colab disconnects);
shuffling uses an RNG seeded per epoch so a resumed run equals an uninterrupted one."""
from __future__ import annotations

import json
from dataclasses import dataclass, replace
from pathlib import Path

import numpy as np

from .config import Head


def softmax(z: np.ndarray) -> np.ndarray:
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def predict_proba(X: np.ndarray, W: np.ndarray, b: np.ndarray) -> np.ndarray:
    return softmax(X.astype(np.float32) @ W + b)


@dataclass
class HeadState:
    W: np.ndarray
    b: np.ndarray
    mW: np.ndarray
    vW: np.ndarray
    mb: np.ndarray
    vb: np.ndarray
    step: int = 0
    epoch: int = 0
    best_W: np.ndarray | None = None
    best_b: np.ndarray | None = None
    best_acc: float = -1.0
    bad_epochs: int = 0

    @classmethod
    def init(cls, d: int, k: int, seed: int) -> "HeadState":
        rng = np.random.default_rng(seed)
        W = (rng.normal(0, 0.01, (d, k))).astype(np.float32)
        b = np.zeros(k, np.float32)
        z = lambda a: np.zeros_like(a)  # noqa: E731
        return cls(W=W, b=b, mW=z(W), vW=z(W), mb=z(b), vb=z(b))

    def arrays(self) -> dict[str, np.ndarray]:
        out = {k: getattr(self, k) for k in ("W", "b", "mW", "vW", "mb", "vb")}
        if self.best_W is not None and self.best_b is not None:
            out |= {"best_W": self.best_W, "best_b": self.best_b}
        out["scalars"] = np.array([self.step, self.epoch, self.best_acc, self.bad_epochs], np.float64)
        return out

    @classmethod
    def from_arrays(cls, a: dict[str, np.ndarray]) -> "HeadState":
        step, epoch, best_acc, bad = a["scalars"].tolist()
        return cls(W=a["W"], b=a["b"], mW=a["mW"], vW=a["vW"], mb=a["mb"], vb=a["vb"],
                   step=int(step), epoch=int(epoch), best_W=a.get("best_W"), best_b=a.get("best_b"),
                   best_acc=float(best_acc), bad_epochs=int(bad))


def _save_ckpt(path: Path, s: HeadState) -> None:
    tmp = path.with_name(path.stem + ".tmp.npz")
    np.savez(tmp, **s.arrays())
    tmp.replace(path)


def train_head(
    X: np.ndarray,
    y: np.ndarray,
    Xv: np.ndarray,
    yv: np.ndarray,
    *,
    n_classes: int,
    hp: Head,
    max_epochs: int | None = None,
    checkpoint: Path | None = None,
    log=None,
) -> HeadState:
    """Adam + label smoothing + L2; early stop on val top-1. Returns the best weights in W / b."""
    X = X.astype(np.float32)
    epochs = hp.epochs if max_epochs is None else max_epochs
    if checkpoint is not None and checkpoint.exists():
        with np.load(checkpoint) as f:
            s = HeadState.from_arrays({k: f[k] for k in f.files})
    else:
        s = HeadState.init(X.shape[1], n_classes, hp.seed)
    Y = np.full((len(y), n_classes), hp.label_smoothing / n_classes, np.float32)
    Y[np.arange(len(y)), y] += 1.0 - hp.label_smoothing
    b1, b2, eps = 0.9, 0.999, 1e-8
    while s.epoch < epochs and s.bad_epochs < hp.patience:
        rng = np.random.default_rng([hp.seed, s.epoch])
        order = rng.permutation(len(X))
        for i in range(0, len(X), hp.batch_size):
            idx = order[i : i + hp.batch_size]
            xb, yb = X[idx], Y[idx]
            p = softmax(xb @ s.W + s.b)
            g = (p - yb) / len(idx)
            gW = xb.T @ g + hp.l2 * s.W
            gb = g.sum(0)
            s.step += 1
            for (param, grad, m, v) in ((s.W, gW, s.mW, s.vW), (s.b, gb, s.mb, s.vb)):
                m *= b1
                m += (1 - b1) * grad
                v *= b2
                v += (1 - b2) * grad * grad
                mhat = m / (1 - b1 ** s.step)
                vhat = v / (1 - b2 ** s.step)
                param -= hp.learning_rate * mhat / (np.sqrt(vhat) + eps)
        s.epoch += 1
        acc = float((predict_proba(Xv, s.W, s.b).argmax(1) == yv).mean()) if len(Xv) else 0.0
        if acc > s.best_acc:
            s.best_acc, s.best_W, s.best_b, s.bad_epochs = acc, s.W.copy(), s.b.copy(), 0
        else:
            s.bad_epochs += 1
        if log:
            log(f"epoch {s.epoch}: val top-1 {acc:.3f} (best {s.best_acc:.3f})")
        if checkpoint is not None:
            _save_ckpt(checkpoint, s)
    best_W = s.best_W if s.best_W is not None else s.W
    best_b = s.best_b if s.best_b is not None else s.b
    return replace(s, W=best_W.copy(), b=best_b.copy())


def save_head(path: Path, s: HeadState, *, labels: list[str]) -> None:
    np.savez(path, W=s.W, b=s.b, labels=np.array(json.dumps(labels)))


def load_head(path: Path) -> tuple[HeadState, list[str]]:
    with np.load(path) as f:
        W, b, labels = f["W"], f["b"], json.loads(str(f["labels"]))
    z = np.zeros_like
    return HeadState(W=W, b=b, mW=z(W), vW=z(W), mb=z(b), vb=z(b)), labels
