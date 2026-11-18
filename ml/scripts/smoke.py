"""Smoke run of the whole pipeline on made-up images: 2 classes named with real classMap labels,
1 epoch, CPU. Produces models/smoke.tflite (gitignored) and checks MediaPipe Python loads it.

  python scripts/smoke.py
Needs the backbone (`python scripts/download.py efficientnet_lite0`). No dataset is downloaded."""
from __future__ import annotations

import time

from _common import ML_DIR, config_from, parser  # noqa: F401

from gymfood.smoke import run_smoke


def main() -> int:
    p = parser(__doc__)
    args = p.parse_args()
    cfg = config_from(args)
    t0 = time.time()
    info = run_smoke(cfg)
    print(f"smoke OK in {time.time() - t0:.0f} s: {info['model']} ({info['mb']} MB, labels {info['labels']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
