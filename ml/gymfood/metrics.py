"""Top-1 / top-3 / per-class accuracy, the most-confused dish pairs, and the Markdown report."""
from __future__ import annotations

from collections import Counter

import numpy as np


def evaluate(probs: np.ndarray, y: np.ndarray, labels: list[str], *, top_pairs: int) -> dict:
    n = int(len(y))
    if n == 0:
        return {"n": 0, "top1": None, "top3": None, "per_class": {}, "confused": []}
    k = min(3, probs.shape[1])
    # Stable ranking: higher score first, lower index on ties.
    rank = np.argsort(-probs, axis=1, kind="stable")
    top1 = rank[:, 0] == y
    top3 = (rank[:, :k] == y[:, None]).any(axis=1)
    per_class = {}
    for c, label in enumerate(labels):
        m = y == c
        if m.any():
            per_class[label] = {"n": int(m.sum()), "top1": float(top1[m].mean()), "top3": float(top3[m].mean())}
    pairs: Counter = Counter()
    directed: Counter = Counter()
    for t, p in zip(y.tolist(), rank[:, 0].tolist()):
        if t != p:
            a, b = sorted((labels[t], labels[p]))
            pairs[(a, b)] += 1
            directed[(labels[t], labels[p])] += 1
    confused = [
        {"a": a, "b": b, "count": c, "a_as_b": directed[(a, b)], "b_as_a": directed[(b, a)]}
        for (a, b), c in sorted(pairs.items(), key=lambda kv: (-kv[1], kv[0]))[:top_pairs]
    ]
    return {"n": n, "top1": float(top1.mean()), "top3": float(top3.mean()),
            "per_class": per_class, "confused": confused}


def _pct(x: float | None) -> str:
    return "n/a" if x is None else f"{100 * x:.1f}%"


def report_markdown(results: dict[str, dict], *, labels: list[str], dish_names: dict[str, str],
                    meta: dict) -> str:
    """results: split name -> evaluate() output. dish_names: label -> default dish name."""
    name = lambda lbl: f"{lbl} ({dish_names[lbl]})" if lbl in dish_names else lbl  # noqa: E731
    out = ["# Food classifier report", ""]
    out += [f"- {k}: {v}" for k, v in meta.items()]
    out += ["", "| Split | Images | Top-1 | Top-3 |", "|---|---|---|---|"]
    for split, r in results.items():
        out.append(f"| {split} | {r['n']} | {_pct(r['top1'])} | {_pct(r['top3'])} |")
    for split, r in results.items():
        if not r["n"]:
            continue
        out += ["", f"## {split}: per class", "", "| Class | Images | Top-1 | Top-3 |", "|---|---|---|---|"]
        for lbl in labels:
            pc = r["per_class"].get(lbl)
            if pc:
                out.append(f"| {name(lbl)} | {pc['n']} | {_pct(pc['top1'])} | {_pct(pc['top3'])} |")
        out += ["", f"## {split}: most-confused pairs", ""]
        if r["confused"]:
            out += ["| Pair | Mistakes | A taken as B | B taken as A |", "|---|---|---|---|"]
            for p in r["confused"]:
                out.append(f"| {name(p['a'])} ↔ {name(p['b'])} | {p['count']} | {p['a_as_b']} | {p['b_as_a']} |")
        else:
            out.append("None.")
    return "\n".join(out) + "\n"
