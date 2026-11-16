"""Export a run to a .tflite with MediaPipe image-classifier metadata, check size and load it in
MediaPipe Python.

  python scripts/export.py --run-id 2026-12-01            # -> models/food-classifier.tflite"""
from __future__ import annotations

from pathlib import Path

from _common import config_from, parser

from gymfood.pipeline import run_export


def main() -> int:
    p = parser(__doc__)
    p.add_argument("--run-id", required=True)
    p.add_argument("--out", type=Path, default=None, help="default <models>/food-classifier.tflite")
    args = p.parse_args()
    cfg = config_from(args)
    run_export(cfg, args.run_id, args.out or cfg.paths.models / "food-classifier.tflite")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
