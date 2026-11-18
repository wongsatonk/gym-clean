"""Map dataset classes and your exported photos to our labels, split, and write the manifest.

  python scripts/prepare.py                         # data/raw/* + every zip in data/personal_zips/
  python scripts/prepare.py --zip ~/Downloads/gym-clean-food-photos-2026-12-01.zip
  python scripts/prepare.py --no-personal           # public data only (Colab)
"""
from __future__ import annotations

from pathlib import Path

from _common import config_from, parser

from gymfood.pipeline import run_prepare


def main() -> int:
    p = parser(__doc__)
    p.add_argument("--zip", type=Path, action="append", default=None, help="photo export zip(s) from the app")
    p.add_argument("--no-personal", action="store_true", help="ignore personal photo zips")
    p.add_argument("--raw-dir", type=Path, default=None, help="default <data>/raw")
    args = p.parse_args()
    cfg = config_from(args)
    run_prepare(cfg, raw_dir=args.raw_dir, zips=[] if args.no_personal else args.zip)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
